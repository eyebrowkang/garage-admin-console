/**
 * Upload manager — a small, framework-agnostic store that turns the one-shot
 * uploader into a reopenable, non-blocking queue with PER-FILE control.
 *
 * It lives at the BrowserProvider level (one per bucket backend), so uploads
 * keep running when the upload dialog closes. Each file is an independent task
 * with its own AbortController (so a single file can be cancelled/retried
 * without touching its siblings — unlike the old one-controller-per-job dialog).
 * A file-level concurrency cap bounds how many run at once; the global
 * part-PUT Semaphore (see multipart-upload.ts) still bounds the byte transfers
 * underneath.
 *
 * Exposes a useSyncExternalStore-shaped surface (subscribe + getSnapshot) so
 * React renders the panel/indicator off an immutable snapshot.
 */
import type { AxiosInstance } from 'axios';
import { uploadOneFile } from './multipart-upload';

export type UploadTaskStatus = 'queued' | 'uploading' | 'done' | 'error' | 'canceled';

export interface UploadTask {
  id: string;
  name: string;
  /** Destination object key (prefix + name). */
  key: string;
  /** Prefix the file is uploaded into (used to refresh that listing on done). */
  prefix: string;
  size: number;
  loaded: number;
  status: UploadTaskStatus;
  error?: string;
}

interface InternalTask extends UploadTask {
  file: File;
  controller: AbortController | null;
}

const ACTIVE_STATUSES: ReadonlySet<UploadTaskStatus> = new Set(['queued', 'uploading']);

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `u${idCounter.toString(36)}-${Math.round(performance.now()).toString(36)}`;
}

function buildKey(prefix: string, name: string): string {
  const clean = prefix.replace(/^\/+|\/+$/g, '');
  return clean ? `${clean}/${name}` : name;
}

function publicView(t: InternalTask): UploadTask {
  return {
    id: t.id,
    name: t.name,
    key: t.key,
    prefix: t.prefix,
    size: t.size,
    loaded: t.loaded,
    status: t.status,
    error: t.error,
  };
}

function isAbortError(err: unknown): boolean {
  // A cancel surfaces differently per path and `DOMException` isn't reliably an
  // `instanceof Error`, so match by name/code: DOMException('AbortError') from the
  // multipart XHR path, or axios CanceledError / ERR_CANCELED from the small-file
  // proxy path.
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { name?: string; code?: string };
  return e.name === 'AbortError' || e.name === 'CanceledError' || e.code === 'ERR_CANCELED';
}

export interface UploadManagerOptions {
  /** How many files upload at once (the global part-PUT cap bounds bytes underneath). */
  fileConcurrency?: number;
}

export class UploadManager {
  private readonly http: AxiosInstance;
  private readonly fileConcurrency: number;
  private tasks: InternalTask[] = [];
  private readonly listeners = new Set<() => void>();
  private snapshot: UploadTask[] = [];
  private running = 0;

  constructor(http: AxiosInstance, opts: UploadManagerOptions = {}) {
    this.http = http;
    this.fileConcurrency = Math.max(1, opts.fileConcurrency ?? 3);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Stable until the next mutation, so useSyncExternalStore won't loop. */
  getSnapshot = (): UploadTask[] => this.snapshot;

  private emit(): void {
    this.snapshot = this.tasks.map(publicView);
    for (const listener of this.listeners) listener();
  }

  /** Queue files for upload into `prefix` and start the scheduler. */
  enqueue(files: File[], prefix: string): void {
    if (files.length === 0) return;
    for (const file of files) {
      this.tasks.push({
        id: nextId(),
        name: file.name,
        key: buildKey(prefix, file.name),
        prefix,
        size: file.size,
        loaded: 0,
        status: 'queued',
        file,
        controller: null,
      });
    }
    this.emit();
    this.pump();
  }

  private pump(): void {
    while (this.running < this.fileConcurrency) {
      const next = this.tasks.find((t) => t.status === 'queued');
      if (!next) break;
      void this.run(next);
    }
  }

  private async run(task: InternalTask): Promise<void> {
    this.running += 1;
    task.status = 'uploading';
    task.loaded = 0;
    task.error = undefined;
    task.controller = new AbortController();
    this.emit();
    try {
      await uploadOneFile(this.http, task.file, task.prefix, {
        signal: task.controller.signal,
        onProgress: ({ loaded }) => {
          task.loaded = loaded;
          this.emit();
        },
      });
      task.status = 'done';
      task.loaded = task.size;
    } catch (err) {
      if (isAbortError(err)) {
        task.status = 'canceled';
      } else {
        task.status = 'error';
        task.error = (err as Error)?.message || 'Upload failed';
      }
    } finally {
      task.controller = null;
      this.running -= 1;
      this.emit();
      this.pump();
    }
  }

  /** Cancel one task (a queued one is dropped; an in-flight one is aborted). */
  cancel(id: string): void {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return;
    if (task.status === 'queued') {
      task.status = 'canceled';
      this.emit();
    } else if (task.status === 'uploading') {
      task.controller?.abort();
    }
  }

  cancelAll(): void {
    for (const task of this.tasks) {
      if (task.status === 'queued') task.status = 'canceled';
      else if (task.status === 'uploading') task.controller?.abort();
    }
    this.emit();
  }

  /** Re-queue a failed or cancelled task. */
  retry(id: string): void {
    const task = this.tasks.find((t) => t.id === id);
    if (!task || (task.status !== 'error' && task.status !== 'canceled')) return;
    task.status = 'queued';
    task.loaded = 0;
    task.error = undefined;
    this.emit();
    this.pump();
  }

  /** Drop a single finished (done/error/canceled) task from the list. */
  remove(id: string): void {
    const task = this.tasks.find((t) => t.id === id);
    if (!task || ACTIVE_STATUSES.has(task.status)) return;
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.emit();
  }

  /** Drop every finished task, keeping queued/uploading ones. */
  clearFinished(): void {
    const before = this.tasks.length;
    this.tasks = this.tasks.filter((t) => ACTIVE_STATUSES.has(t.status));
    if (this.tasks.length !== before) this.emit();
  }
}
