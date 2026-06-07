import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AxiosInstance } from 'axios';

// The manager schedules uploadOneFile per task; mock it so the queue/state
// machine is exercised deterministically (no network, controllable timing).
// UPLOAD_PAUSED is the real sentinel the manager passes to abort() on pause — the
// manager distinguishes pause from cancel by the task's own status, not the
// reason, so any value works here; we mirror the real export for fidelity.
vi.mock('../lib/multipart-upload', () => ({
  uploadOneFile: vi.fn(),
  UPLOAD_PAUSED: Symbol('upload-paused'),
}));

import { uploadOneFile } from '../lib/multipart-upload';
import { UploadManager } from '../lib/upload-manager';
import type { UploadTask } from '../lib/upload-manager';

const mockUpload = uploadOneFile as Mock;

interface Deferred {
  file: File;
  resolve: (v: { key: string; etag: string; size: number }) => void;
  reject: (e: unknown) => void;
}
let deferreds: Deferred[] = [];

beforeEach(() => {
  deferreds = [];
  mockUpload.mockReset();
  // Each call returns a controllable promise; aborting the signal rejects it
  // with an AbortError, mirroring the real uploadOneFile.
  mockUpload.mockImplementation(
    (_http: unknown, file: File, _prefix: string, opts: { signal?: AbortSignal } = {}) =>
      new Promise((resolve, reject) => {
        deferreds.push({ file, resolve, reject });
        opts.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      }),
  );
});

afterEach(() => vi.clearAllMocks());

const http = {} as unknown as AxiosInstance; // unused — uploadOneFile is mocked
const file = (name: string, size: number) => new File([new Uint8Array(size)], name);
const flush = () => new Promise((r) => setTimeout(r, 0));
const byName = (snap: UploadTask[], name: string) => snap.find((t) => t.name === name);

describe('UploadManager', () => {
  it('runs queued files up to the file-concurrency cap', () => {
    const m = new UploadManager(http, { fileConcurrency: 2 });
    m.enqueue([file('a', 1), file('b', 1), file('c', 1)], 'p');
    const snap = m.getSnapshot();
    expect(snap.filter((t) => t.status === 'uploading')).toHaveLength(2);
    expect(snap.filter((t) => t.status === 'queued')).toHaveLength(1);
    expect(snap.map((t) => t.key)).toEqual(['p/a', 'p/b', 'p/c']);
  });

  it('starts the next queued file when one completes', async () => {
    const m = new UploadManager(http, { fileConcurrency: 2 });
    m.enqueue([file('a', 10), file('b', 10), file('c', 10)], 'p');

    deferreds[0]!.resolve({ key: 'p/a', etag: 'e', size: 10 });
    await flush();

    const snap = m.getSnapshot();
    expect(byName(snap, 'a')?.status).toBe('done');
    expect(byName(snap, 'a')?.loaded).toBe(10);
    expect(snap.filter((t) => t.status === 'uploading')).toHaveLength(2); // b + c now
  });

  it('marks one file errored without affecting siblings', async () => {
    const m = new UploadManager(http, { fileConcurrency: 3 });
    m.enqueue([file('a', 1), file('b', 1)], 'p');
    deferreds[0]!.reject(new Error('boom'));
    deferreds[1]!.resolve({ key: 'p/b', etag: 'e', size: 1 });
    await flush();
    const snap = m.getSnapshot();
    expect(byName(snap, 'a')?.status).toBe('error');
    expect(byName(snap, 'a')?.error).toBe('boom');
    expect(byName(snap, 'b')?.status).toBe('done');
  });

  it('cancels an in-flight file via its own controller and frees the slot', async () => {
    const m = new UploadManager(http, { fileConcurrency: 1 });
    m.enqueue([file('a', 1), file('b', 1)], 'p');
    m.cancel(m.getSnapshot()[0]!.id);
    await flush();
    const snap = m.getSnapshot();
    expect(byName(snap, 'a')?.status).toBe('canceled');
    expect(byName(snap, 'b')?.status).toBe('uploading'); // slot freed → b started
  });

  it('cancels a queued file without ever starting it', () => {
    const m = new UploadManager(http, { fileConcurrency: 1 });
    m.enqueue([file('a', 1), file('b', 1)], 'p');
    const queued = m.getSnapshot().find((t) => t.status === 'queued')!;
    m.cancel(queued.id);
    expect(byName(m.getSnapshot(), 'b')?.status).toBe('canceled');
    expect(mockUpload).toHaveBeenCalledTimes(1); // only 'a' ever started
  });

  it('retries a failed file', async () => {
    const m = new UploadManager(http, { fileConcurrency: 1 });
    m.enqueue([file('a', 1)], 'p');
    deferreds[0]!.reject(new Error('boom'));
    await flush();
    expect(byName(m.getSnapshot(), 'a')?.status).toBe('error');

    m.retry(m.getSnapshot()[0]!.id);
    expect(byName(m.getSnapshot(), 'a')?.status).toBe('uploading');
    deferreds[1]!.resolve({ key: 'p/a', etag: 'e', size: 1 });
    await flush();
    expect(byName(m.getSnapshot(), 'a')?.status).toBe('done');
  });

  it('pauses an in-flight upload and resumes it', async () => {
    const m = new UploadManager(http, { fileConcurrency: 2 });
    m.enqueue([file('a', 10)], 'p');
    const aId = byName(m.getSnapshot(), 'a')!.id;
    expect(byName(m.getSnapshot(), 'a')?.status).toBe('uploading');

    m.pause(aId);
    // Status flips to 'paused' synchronously (before the abort propagates) so
    // run()'s catch keeps it paused instead of marking it canceled.
    expect(byName(m.getSnapshot(), 'a')?.status).toBe('paused');
    await flush();
    expect(byName(m.getSnapshot(), 'a')?.status).toBe('paused');

    m.resume(aId);
    expect(byName(m.getSnapshot(), 'a')?.status).toBe('uploading'); // pump restarts it
    deferreds.at(-1)!.resolve({ key: 'p/a', etag: 'e', size: 10 });
    await flush();
    expect(byName(m.getSnapshot(), 'a')?.status).toBe('done');
  });

  it('pauses a queued file without starting it', () => {
    const m = new UploadManager(http, { fileConcurrency: 1 });
    m.enqueue([file('a', 1), file('b', 1)], 'p');
    const bId = byName(m.getSnapshot(), 'b')!.id; // queued behind a (cap 1)
    m.pause(bId);
    expect(byName(m.getSnapshot(), 'b')?.status).toBe('paused');
    m.resume(bId);
    // a still holds the only slot → b returns to queued, not started.
    expect(byName(m.getSnapshot(), 'b')?.status).toBe('queued');
    expect(mockUpload).toHaveBeenCalledTimes(1); // only 'a' ever started
  });

  it('cancelling a paused upload clears its resumable session', async () => {
    const removed: Array<[string, string]> = [];
    const sessionStore = {
      get: () => null,
      put: () => undefined,
      remove: (ns: string, fp: string) => void removed.push([ns, fp]),
    };
    const m = new UploadManager(http, { fileConcurrency: 1, sessionStore });
    m.enqueue([file('a', 10)], 'p');
    const aId = byName(m.getSnapshot(), 'a')!.id;
    m.pause(aId);
    await flush();
    m.cancel(aId);
    expect(byName(m.getSnapshot(), 'a')?.status).toBe('canceled');
    expect(removed).toHaveLength(1); // session dropped so it won't silently resume
  });

  it('surfaces per-part status from the uploader into the snapshot', async () => {
    mockUpload.mockImplementationOnce(
      (
        _http: unknown,
        _file: File,
        _prefix: string,
        opts: { onPart?: (p: unknown) => void } = {},
      ) => {
        opts.onPart?.({ total: 4, completed: 2, active: 1 });
        return new Promise(() => {}); // stay uploading
      },
    );
    const m = new UploadManager(http, { fileConcurrency: 1 });
    m.enqueue([file('big', 100)], 'p');
    await flush();
    expect(byName(m.getSnapshot(), 'big')?.parts).toEqual({ total: 4, completed: 2, active: 1 });
  });

  it('clearFinished drops finished tasks but keeps active ones', async () => {
    const m = new UploadManager(http, { fileConcurrency: 1 });
    m.enqueue([file('a', 1), file('b', 1)], 'p');
    deferreds[0]!.resolve({ key: 'p/a', etag: 'e', size: 1 });
    await flush();
    m.clearFinished();
    const snap = m.getSnapshot();
    expect(byName(snap, 'a')).toBeUndefined(); // done → removed
    expect(byName(snap, 'b')?.status).toBe('uploading'); // active → kept
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const m = new UploadManager(http, { fileConcurrency: 1 });
    const listener = vi.fn();
    const unsub = m.subscribe(listener);
    m.enqueue([file('a', 1)], 'p');
    expect(listener).toHaveBeenCalled();
    unsub();
    listener.mockClear();
    m.cancelAll();
    expect(listener).not.toHaveBeenCalled();
  });
});
