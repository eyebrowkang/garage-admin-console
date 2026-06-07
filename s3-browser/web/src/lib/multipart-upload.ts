/**
 * Multipart upload runtime — drives files >= LARGE_FILE_THRESHOLD_BYTES from
 * the browser directly to the S3 endpoint via presigned UploadPart URLs.
 *
 * Wire flow per file:
 *   1. POST /multipart/create   → uploadId + partSize from the BFF
 *   2. Slice the File into N = ceil(size/partSize) blobs
 *   3. POST /multipart/sign     → presigned URLs, signed JUST IN TIME in a sliding
 *                                 window (not all up front) so they can't expire
 *                                 while waiting in the upload queue
 *   4. PUT each blob to its URL via XHR, with bounded GLOBAL concurrency, a
 *      per-part retry/backoff loop, an inactivity watchdog, and an expired-URL
 *      (403) re-sign-and-retry path
 *   5. POST /multipart/complete → server stitches the parts
 * On unrecoverable failure after step 1 we POST /multipart/abort so S3 reclaims
 * storage. A single file failing no longer aborts its siblings in the job.
 *
 * Below the threshold, files are batched together and sent through the
 * existing POST /upload proxy — the BFF still holds the credentials.
 *
 * This module lives in the federated remote, so the Admin Console embed inherits
 * every reliability fix here without any host change.
 */
import type { AxiosInstance } from 'axios';
import {
  LARGE_FILE_THRESHOLD_BYTES,
  MULTIPART_MAX_PARTS,
} from '@garage/bucket-api-server/constants';
import { Semaphore } from './semaphore';
import { fingerprintFile, type UploadSessionStore } from './upload-sessions';

// Re-exported so file-browser components keep importing the threshold from
// here; the BFF enforces the same value server-side (413 on oversized proxy
// uploads), so it must stay a single source of truth.
export { LARGE_FILE_THRESHOLD_BYTES };

// --- Reliability tuning ------------------------------------------------------

/**
 * Hard ceiling on concurrent browser→S3 part PUTs across the WHOLE app, shared
 * by every file and every upload job. 6 matches the browser per-origin HTTP/1.1
 * connection cap, so going higher only head-of-line stalls and ages signed URLs.
 * Module-level so it survives a dialog unmount and bounds two jobs at once.
 */
const GLOBAL_PUT_CONCURRENCY = 6;
const putLimiter = new Semaphore(GLOBAL_PUT_CONCURRENCY);

const DEFAULT_MAX_ATTEMPTS = 4; // 1 try + 3 retries
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 8_000;
const DEFAULT_STALL_TIMEOUT_MS = 30_000; // abort a part with no progress for this long
const DEFAULT_SIGN_WINDOW = 100; // parts presigned per /multipart/sign round-trip
const CONTROL_TIMEOUT_MS = 30_000; // quick control-plane calls: create/sign/abort (NOT complete)
const SIGN_EXPIRY_SKEW_MS = 5 * 60 * 1000; // re-sign a URL with < 5 min of life left

/** HTTP statuses worth retrying (transient server/throttle conditions). */
const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504]);

interface ReliabilityOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /**
   * Abort + retry a part that reports no progress for this long. The watchdog is
   * mandatory — it's the only thing that frees a globally-shared upload permit
   * held by a half-open socket — so a value <= 0 falls back to the default rather
   * than disabling it. (Residual: a connection that trickles bytes slower than
   * this window re-arms it; a throughput cap is a follow-up once Phase 3 grows
   * part sizes.)
   */
  stallTimeoutMs?: number;
  /** How many part URLs to presign per round-trip. */
  signWindow?: number;
}

interface ResolvedReliability {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  stallTimeoutMs: number;
  signWindow: number;
}

// --- Typed part-PUT errors (drive the retry-vs-fatal decision) ---------------

class PartHttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Part PUT failed: ${status}`);
    this.name = 'PartHttpError';
    this.status = status;
  }
}

class PartNetworkError extends Error {
  constructor() {
    super('Network error during part PUT');
    this.name = 'PartNetworkError';
  }
}

class PartTimeoutError extends Error {
  constructor() {
    super('Part PUT stalled (no progress) and was retried');
    this.name = 'PartTimeoutError';
  }
}

class PartEtagMissingError extends Error {
  constructor() {
    super('S3 PUT succeeded but no ETag header was returned. Check bucket CORS exposes ETag.');
    this.name = 'PartEtagMissingError';
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function isRetryable(err: unknown): boolean {
  if (err instanceof PartNetworkError || err instanceof PartTimeoutError) return true;
  if (err instanceof PartHttpError) return RETRYABLE_HTTP.has(err.status);
  return false;
}

/** Full-jitter exponential backoff: random(0, min(cap, base * 2^(attempt-1))). */
function backoffDelay(attempt: number, base: number, cap: number): number {
  const exp = Math.min(cap, base * 2 ** (attempt - 1));
  return Math.random() * exp;
}

/** Abort-aware sleep. Rejects with AbortError if the signal fires while waiting. */
function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(
      () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      },
      Math.max(0, ms),
    );
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Returns a signal that aborts when EITHER input aborts. */
function mergeSignals(a: AbortSignal | undefined, b: AbortSignal): AbortSignal {
  if (!a) return b;
  if (a.aborted) return a;
  if (b.aborted) return b;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });
  return ctrl.signal;
}

export interface UploadedItem {
  key: string;
  etag: string;
  size: number;
}

/**
 * Thrown when a job finishes with at least one failed file. Carries the files
 * that DID store (so the caller can still surface them — e.g. refresh the
 * listing) instead of the failure swallowing a partial success. `message` is the
 * first underlying failure's message. A user cancel rejects with a plain
 * AbortError, not this, so callers can distinguish the two.
 */
export class UploadJobError extends Error {
  readonly uploaded: UploadedItem[];
  readonly failures: unknown[];
  constructor(uploaded: UploadedItem[], failures: unknown[]) {
    const first = failures[0];
    super(first instanceof Error ? first.message : 'Upload failed');
    this.name = 'UploadJobError';
    this.uploaded = uploaded;
    this.failures = failures;
  }
}

export interface UploadProgress {
  /** Bytes uploaded so far across the whole job (small batch + large files). */
  loaded: number;
  /** Total bytes the whole job will move. */
  total: number;
}

/**
 * Abort reason that marks a PAUSE rather than a cancel. A paused large upload
 * keeps its multipart upload AND its resumable session alive (so resume() can
 * continue via ListParts); a cancel/failure tears both down. Pass it to
 * `AbortController.abort(UPLOAD_PAUSED)`.
 */
export const UPLOAD_PAUSED = Symbol('upload-paused');

function isPausedSignal(signal: AbortSignal | undefined): boolean {
  return !!signal && signal.aborted && (signal as { reason?: unknown }).reason === UPLOAD_PAUSED;
}

/** Aggregate per-part status for a multipart upload, surfaced to the UI. */
export interface PartSummary {
  /** Total parts the file will be split into. */
  total: number;
  /** Parts confirmed on the server (uploaded this run or skipped on resume). */
  completed: number;
  /** Parts currently being PUT. */
  active: number;
}

export interface UploadJobOptions {
  http: AxiosInstance;
  files: File[];
  prefix: string;
  /** Files at or above this size go direct-to-S3 via multipart. */
  threshold?: number;
  /** Soft per-file fairness hint for part lanes; the hard cap is global. */
  partConcurrency?: number;
  signal?: AbortSignal;
  onProgress?: (p: UploadProgress) => void;
  /** Retry/backoff/signing knobs — defaults are production-tuned; tests override. */
  reliability?: ReliabilityOptions;
}

interface CreateResponse {
  uploadId: string;
  key: string;
  partSize: number;
  maxParts: number;
}

interface SignResponse {
  urls: { partNumber: number; url: string }[];
  expiresAt: string;
}

interface CompleteResponse {
  key: string;
  etag: string;
}

interface MultipartPartsResponse {
  parts: { partNumber: number; etag: string; size: number }[];
}

/** Enables resumable uploads: large files persist a session and resume via ListParts. */
interface ResumeContext {
  store: UploadSessionStore;
}

function buildKey(prefix: string, name: string): string {
  const clean = prefix.replace(/^\/+|\/+$/g, '');
  return clean ? `${clean}/${name}` : name;
}

/**
 * PUT one part blob to a presigned URL via XHR, reporting byte deltas through
 * `onLoaded`. Rejects with a TYPED error so the caller can decide retry vs fatal:
 * PartHttpError(status), PartNetworkError, PartTimeoutError (inactivity
 * watchdog), PartEtagMissingError, or a DOMException('AbortError').
 */
function putPartWithProgress(
  url: string,
  body: Blob,
  signal: AbortSignal | undefined,
  onLoaded: (delta: number) => void,
  stallMs: number,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastLoaded = 0;
    let timedOut = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;

    const cleanup = () => {
      if (watchdog !== undefined) {
        clearTimeout(watchdog);
        watchdog = undefined;
      }
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
    };

    // (Re)arm the inactivity watchdog — fired only when a part makes NO progress
    // for stallMs, which recovers a half-open TCP connection that would
    // otherwise freeze the upload forever with no error.
    const arm = () => {
      if (stallMs > 0) {
        if (watchdog !== undefined) clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          timedOut = true;
          xhr.abort();
        }, stallMs);
      }
    };

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const delta = evt.loaded - lastLoaded;
      lastLoaded = evt.loaded;
      if (delta > 0) onLoaded(delta);
      arm();
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        // Top up in case onprogress didn't reach 100%.
        const remaining = body.size - lastLoaded;
        if (remaining > 0) onLoaded(remaining);
        const etag = xhr.getResponseHeader('ETag') ?? xhr.getResponseHeader('etag') ?? '';
        if (!etag) {
          reject(new PartEtagMissingError());
          return;
        }
        resolve(etag);
      } else {
        reject(new PartHttpError(xhr.status));
      }
    };
    xhr.onerror = () => {
      cleanup();
      reject(new PartNetworkError());
    };
    xhr.onabort = () => {
      cleanup();
      reject(timedOut ? new PartTimeoutError() : new DOMException('Aborted', 'AbortError'));
    };

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      onAbort = () => xhr.abort();
      signal.addEventListener('abort', onAbort);
    }

    xhr.open('PUT', url);
    xhr.send(body);
    arm();
  });
}

interface SignedUrl {
  url: string;
  expMs: number;
}

/**
 * Lazily presigns UploadPart URLs in sliding windows instead of all up front.
 * `get(n)` returns a URL with comfortable life left, signing the covering window
 * on demand and de-duping concurrent requests for the same window. `resign(n)`
 * forces a fresh single-part URL — used when a PUT gets a 403 (expired URL).
 */
function createPartSigner(opts: {
  http: AxiosInstance;
  key: string;
  uploadId: string;
  numParts: number;
  signal: AbortSignal;
  window: number;
}) {
  const { http, key, uploadId, numParts, signal, window } = opts;
  const cache = new Map<number, SignedUrl>();
  const windowInFlight = new Map<number, Promise<void>>();

  const isFresh = (n: number): SignedUrl | undefined => {
    const c = cache.get(n);
    return c && c.expMs - Date.now() > SIGN_EXPIRY_SKEW_MS ? c : undefined;
  };

  const signNumbers = async (partNumbers: number[]): Promise<void> => {
    if (partNumbers.length === 0) return;
    const res = await http.post<SignResponse>(
      '/multipart/sign',
      { key, uploadId, partNumbers },
      { signal, timeout: CONTROL_TIMEOUT_MS },
    );
    const parsed = Date.parse(res.data.expiresAt);
    const expMs = Number.isFinite(parsed) ? parsed : Date.now() + 3600 * 1000;
    for (const u of res.data.urls) cache.set(u.partNumber, { url: u.url, expMs });
  };

  const ensureWindow = (winIdx: number): Promise<void> => {
    const inflight = windowInFlight.get(winIdx);
    if (inflight) return inflight;
    const startN = winIdx * window + 1;
    const endN = Math.min(startN + window - 1, numParts);
    const nums: number[] = [];
    for (let n = startN; n <= endN; n++) if (!isFresh(n)) nums.push(n);
    const p = signNumbers(nums).finally(() => windowInFlight.delete(winIdx));
    windowInFlight.set(winIdx, p);
    return p;
  };

  return {
    async get(partNumber: number): Promise<string> {
      const cached = isFresh(partNumber);
      if (cached) return cached.url;
      await ensureWindow(Math.floor((partNumber - 1) / window));
      const got = cache.get(partNumber);
      if (!got) throw new Error(`Failed to presign part ${partNumber}`);
      return got.url;
    },
    async resign(partNumber: number): Promise<string> {
      await signNumbers([partNumber]);
      const got = cache.get(partNumber);
      if (!got) throw new Error(`Failed to presign part ${partNumber}`);
      return got.url;
    },
  };
}

type PartSigner = ReturnType<typeof createPartSigner>;

/**
 * Upload a single part with the full reliability loop: JIT-signed URL, global
 * concurrency permit, retry with backoff on transient failures, and bounded
 * re-signs on an expired-URL response (403 or 400 — see below). Byte progress
 * already counted for the part is rolled back before each retry so the job
 * progress total is never double-counted.
 */
async function uploadPart(
  file: File,
  partSize: number,
  idx: number,
  signer: PartSigner,
  signal: AbortSignal,
  tick: (delta: number) => void,
  cfg: ResolvedReliability,
): Promise<string> {
  const partNumber = idx + 1;
  const start = idx * partSize;
  const end = Math.min(start + partSize, file.size);
  const blob = file.slice(start, end);

  let partCounted = 0;
  const onLoaded = (delta: number) => {
    partCounted += delta;
    tick(delta);
  };
  const rollback = () => {
    if (partCounted !== 0) {
      tick(-partCounted);
      partCounted = 0;
    }
  };

  let attempt = 0;
  let resignCount = 0;

  for (;;) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const url = await signer.get(partNumber);
    try {
      return await putLimiter.run(() =>
        putPartWithProgress(url, blob, signal, onLoaded, cfg.stallTimeoutMs),
      );
    } catch (err) {
      rollback();
      if (isAbortError(err)) throw err;
      // An expired/invalid presigned URL surfaces differently per backend: AWS S3
      // and MinIO return 403 ("Request has expired"); Garage returns 400 ("Date is
      // too old", confirmed against a live cluster). Re-sign this one part and
      // retry WITHOUT consuming a transient-retry attempt. A long part queued
      // behind the global concurrency limit can age past TWO signing windows, so
      // allow re-signs to RECUR — bounded by maxAttempts so a backend that always
      // reports "expired" (or a genuinely malformed 400) can't spin forever.
      if (
        err instanceof PartHttpError &&
        (err.status === 403 || err.status === 400) &&
        resignCount < cfg.maxAttempts
      ) {
        resignCount += 1;
        await signer.resign(partNumber);
        continue;
      }
      attempt += 1;
      if (attempt >= cfg.maxAttempts || !isRetryable(err)) throw err;
      await delay(backoffDelay(attempt, cfg.baseDelayMs, cfg.maxDelayMs), signal);
    }
  }
}

async function uploadOneLarge(
  http: AxiosInstance,
  file: File,
  prefix: string,
  partConcurrency: number,
  signal: AbortSignal | undefined,
  tick: (delta: number) => void,
  cfg: ResolvedReliability,
  resume?: ResumeContext,
  onPart?: (parts: PartSummary) => void,
): Promise<UploadedItem> {
  const key = buildKey(prefix, file.name);
  const namespace = http.defaults?.baseURL ?? '';
  const fingerprint = fingerprintFile(file);
  const clearSession = () => resume?.store.remove(namespace, fingerprint);

  // Parts already on the server (by partNumber), used to skip re-uploading on resume.
  const completed = new Map<number, { etag: string; size: number }>();
  let uploadId!: string;
  let partSize!: number;
  let maxParts!: number;

  // 1. Resume a saved session if THIS file's upload was interrupted earlier.
  const saved = resume?.store.get(namespace, fingerprint);
  let resumed = false;
  if (saved && saved.key === key) {
    try {
      const partsRes = await http.post<MultipartPartsResponse>(
        '/multipart/parts',
        { key, uploadId: saved.uploadId },
        { signal, timeout: CONTROL_TIMEOUT_MS },
      );
      uploadId = saved.uploadId;
      partSize = saved.partSize;
      maxParts = MULTIPART_MAX_PARTS;
      for (const p of partsRes.data.parts)
        completed.set(p.partNumber, { etag: p.etag, size: p.size });
      resumed = true;
    } catch (err) {
      // Only a 404 (NoSuchUpload) means the saved upload is truly gone — discard
      // the session and start fresh. A transient failure (timeout / 5xx / network
      // drop) or a user abort leaves the already-uploaded parts valid, so DON'T
      // drop the session: propagate the error and let a retry resume from it.
      if ((err as { response?: { status?: number } }).response?.status !== 404) throw err;
      clearSession();
    }
  }

  // 2. Otherwise create a fresh multipart upload and persist the session so an
  //    interruption (reload/crash/drop) can resume when the file is re-selected.
  if (!resumed) {
    const createRes = await http.post<CreateResponse>(
      '/multipart/create',
      // fileSize lets the server pick an adaptive part size (bounded part count
      // for large files); it still returns the part size we must slice to.
      { key, contentType: file.type || undefined, fileSize: file.size },
      { signal, timeout: CONTROL_TIMEOUT_MS },
    );
    uploadId = createRes.data.uploadId;
    partSize = createRes.data.partSize;
    maxParts = createRes.data.maxParts;
    resume?.store.put(namespace, fingerprint, { key, uploadId, partSize, createdAt: Date.now() });
  }

  const numParts = Math.max(1, Math.ceil(file.size / partSize));
  if (numParts > maxParts) {
    clearSession();
    throw new Error(
      `File too large for the configured part size: would need ${numParts} parts (max ${maxParts})`,
    );
  }

  // Per-part status, surfaced to the UI as an aggregate — a thousand-part upload
  // can't render per-part rows, so the panel shows completed/total + in-flight.
  let completedParts = 0;
  let activeParts = 0;
  const emitParts = () =>
    onPart?.({ total: numParts, completed: completedParts, active: activeParts });
  emitParts();

  // Cleanup helper. Called on unrecoverable failure so S3 doesn't keep the
  // orphaned parts. Best-effort and not subject to the user's abort signal so it
  // still runs on cancel.
  const abortUpload = async () => {
    try {
      await http.post('/multipart/abort', { key, uploadId }, { timeout: CONTROL_TIMEOUT_MS });
    } catch {
      /* best-effort */
    }
  };

  // A file-local controller lets the FIRST fatal part error stop this file's
  // OTHER in-flight parts immediately, without touching sibling files.
  const fileCtrl = new AbortController();
  const merged = mergeSignals(signal, fileCtrl.signal);

  const signer = createPartSigner({
    http,
    key,
    uploadId,
    numParts,
    signal: merged,
    window: cfg.signWindow,
  });

  try {
    const etags = new Array<string>(numParts);
    let next = 0;

    const worker = async (): Promise<void> => {
      for (;;) {
        const idx = next++;
        if (idx >= numParts) return;
        if (merged.aborted) throw new DOMException('Aborted', 'AbortError');
        const partNumber = idx + 1;
        const start = idx * partSize;
        const end = Math.min(start + partSize, file.size);
        const already = completed.get(partNumber);
        if (already && already.size === end - start) {
          // Already on the server (resume) — skip the PUT, count its bytes.
          etags[idx] = already.etag;
          tick(end - start);
          completedParts += 1;
          emitParts();
          continue;
        }
        activeParts += 1;
        emitParts();
        try {
          etags[idx] = await uploadPart(file, partSize, idx, signer, merged, tick, cfg);
          completedParts += 1;
        } finally {
          activeParts -= 1;
          emitParts();
        }
      }
    };

    const lanes = Math.max(1, Math.min(partConcurrency, numParts));
    await Promise.all(Array.from({ length: lanes }, () => worker()));

    // Complete. Deliberately UNTIMED (timeout: 0 overrides the client's default
    // control-plane deadline): CompleteMultipartUpload stitches every part
    // server-side and AWS documents it as potentially taking several minutes. A
    // short client timeout here would reject AFTER all parts uploaded, then trip
    // the catch → /multipart/abort and destroy (or race) an upload the backend is
    // still finalizing. The BFF's own handling and the socket timeout are the
    // backstops; we also don't pass the user signal, since cancelling mid-finalize
    // would race the same way.
    const completeRes = await http.post<CompleteResponse>(
      '/multipart/complete',
      {
        key,
        uploadId,
        parts: etags.map((etag, i) => ({ partNumber: i + 1, etag })),
      },
      { timeout: 0 },
    );

    clearSession();
    return { key: completeRes.data.key, etag: completeRes.data.etag, size: file.size };
  } catch (err) {
    fileCtrl.abort(); // stop this file's other parts
    // A PAUSE keeps the multipart upload AND its session alive so resume() can
    // continue via ListParts. A cancel/failure tears both down: abort server-side
    // so S3 doesn't keep orphaned parts, and drop the (now-dead) session. Only a
    // crash/reload leaves a session behind without reaching here.
    if (!isPausedSignal(signal)) {
      await abortUpload();
      clearSession();
    }
    throw err;
  }
}

async function uploadSmallBatch(
  http: AxiosInstance,
  files: File[],
  prefix: string,
  signal: AbortSignal | undefined,
  onLoaded: (delta: number) => void,
): Promise<UploadedItem[]> {
  if (files.length === 0) return [];
  const form = new FormData();
  if (prefix) form.append('prefix', prefix.replace(/^\/+|\/+$/g, ''));
  for (const f of files) form.append('file', f, f.name);

  let lastLoaded = 0;
  const res = await http.post<{ uploaded: UploadedItem[] }>('/upload', form, {
    signal,
    // Proxy upload streams the whole body; opt out of the client's control-plane
    // deadline so a slow-but-progressing upload isn't killed at 30s.
    timeout: 0,
    onUploadProgress: (e) => {
      const total = e.total ?? files.reduce((s, f) => s + f.size, 0);
      const loaded = Math.min(e.loaded, total);
      const delta = loaded - lastLoaded;
      lastLoaded = loaded;
      if (delta > 0) onLoaded(delta);
    },
  });
  return res.data.uploaded;
}

function resolveReliability(reliability?: ReliabilityOptions): ResolvedReliability {
  const stall = reliability?.stallTimeoutMs;
  return {
    maxAttempts: reliability?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    baseDelayMs: reliability?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
    maxDelayMs: reliability?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
    // The stall watchdog can't be switched off (it's what frees a shared permit
    // from a hung socket); a non-positive value falls back to the default.
    stallTimeoutMs: stall !== undefined && stall > 0 ? stall : DEFAULT_STALL_TIMEOUT_MS,
    signWindow: reliability?.signWindow ?? DEFAULT_SIGN_WINDOW,
  };
}

export interface UploadOneFileOptions {
  signal?: AbortSignal;
  onProgress?: (p: UploadProgress) => void;
  /** Per-part status for multipart files (not emitted for small proxy uploads). */
  onPart?: (parts: PartSummary) => void;
  /** Files at or above this size go direct-to-S3 via multipart. */
  threshold?: number;
  partConcurrency?: number;
  reliability?: ReliabilityOptions;
  /** When set, large files persist a resumable session and resume via ListParts. */
  resume?: ResumeContext;
}

/**
 * Upload a SINGLE file, choosing the path by size: below the threshold it goes
 * through the BFF proxy (POST /upload), at/above it goes direct-to-S3 via
 * multipart. Progress is reported as a cumulative {loaded,total} for the file.
 * This is the per-file primitive the UploadManager schedules; runUploadJob stays
 * the one-shot batch API.
 */
export async function uploadOneFile(
  http: AxiosInstance,
  file: File,
  prefix: string,
  opts: UploadOneFileOptions = {},
): Promise<UploadedItem> {
  const { signal, onProgress, threshold = LARGE_FILE_THRESHOLD_BYTES, partConcurrency = 4 } = opts;
  const total = file.size;
  let loaded = 0;
  const tick = (delta: number) => {
    loaded += delta;
    if (loaded > total) loaded = total;
    if (loaded < 0) loaded = 0;
    onProgress?.({ loaded, total });
  };
  onProgress?.({ loaded: 0, total });

  if (file.size >= threshold) {
    return uploadOneLarge(
      http,
      file,
      prefix,
      partConcurrency,
      signal,
      tick,
      resolveReliability(opts.reliability),
      opts.resume,
      opts.onPart,
    );
  }
  const [item] = await uploadSmallBatch(http, [file], prefix, signal, tick);
  if (!item) throw new Error('Upload returned no result');
  return item;
}

export async function runUploadJob(opts: UploadJobOptions): Promise<UploadedItem[]> {
  const {
    http,
    files,
    prefix,
    threshold = LARGE_FILE_THRESHOLD_BYTES,
    partConcurrency = 4,
    signal,
    onProgress,
    reliability,
  } = opts;

  const cfg = resolveReliability(reliability);

  const small = files.filter((f) => f.size < threshold);
  const large = files.filter((f) => f.size >= threshold);
  const total = files.reduce((s, f) => s + f.size, 0);
  let loaded = 0;

  const tick = (delta: number) => {
    loaded += delta;
    if (loaded > total) loaded = total;
    if (loaded < 0) loaded = 0;
    onProgress?.({ loaded, total });
  };

  onProgress?.({ loaded: 0, total });

  // Run the small batch and each large file concurrently. Crucially settle them
  // all even if one fails — a single file's failure must NOT abandon siblings
  // that are already storing bytes. Failures are surfaced after all settle.
  const tasks: Promise<UploadedItem[]>[] = [];
  if (small.length > 0) {
    tasks.push(uploadSmallBatch(http, small, prefix, signal, tick));
  }
  for (const file of large) {
    tasks.push(
      uploadOneLarge(http, file, prefix, partConcurrency, signal, tick, cfg).then((item) => [item]),
    );
  }

  const settled = await Promise.allSettled(tasks);
  const uploaded = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const failures = settled.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []));

  if (failures.length > 0) {
    // A user cancel should read as a cancel even if a real error also surfaced.
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    // Carry the files that DID store so the caller can still reflect them.
    throw new UploadJobError(uploaded, failures);
  }
  return uploaded;
}
