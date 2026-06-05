/**
 * Multipart upload runtime — drives files >= LARGE_FILE_THRESHOLD_BYTES from
 * the browser directly to the S3 endpoint via presigned UploadPart URLs.
 *
 * Wire flow per file:
 *   1. POST /multipart/create   → uploadId + partSize from the BFF
 *   2. Slice the File into N = ceil(size/partSize) blobs
 *   3. POST /multipart/sign     → presigned URLs for every part (batched 1000 at a time)
 *   4. PUT each blob to its URL via XHR (concurrent, with progress + abort)
 *   5. POST /multipart/complete → server stitches the parts
 * On abort/error after step 1 we POST /multipart/abort so S3 reclaims storage.
 *
 * Below the threshold, files are batched together and sent through the
 * existing POST /upload proxy — the BFF still holds the credentials.
 */
import type { AxiosInstance } from 'axios';
import { LARGE_FILE_THRESHOLD_BYTES } from '@garage/bucket-api-server/constants';

// Re-exported so file-browser components keep importing the threshold from
// here; the BFF enforces the same value server-side (413 on oversized proxy
// uploads), so it must stay a single source of truth.
export { LARGE_FILE_THRESHOLD_BYTES };

interface UploadedItem {
  key: string;
  etag: string;
  size: number;
}

export interface UploadProgress {
  /** Bytes uploaded so far across the whole job (small batch + large files). */
  loaded: number;
  /** Total bytes the whole job will move. */
  total: number;
}

export interface UploadJobOptions {
  http: AxiosInstance;
  files: File[];
  prefix: string;
  /** Files at or above this size go direct-to-S3 via multipart. */
  threshold?: number;
  /** Concurrent UploadPart PUTs per file. */
  partConcurrency?: number;
  signal?: AbortSignal;
  onProgress?: (p: UploadProgress) => void;
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

function buildKey(prefix: string, name: string): string {
  const clean = prefix.replace(/^\/+|\/+$/g, '');
  return clean ? `${clean}/${name}` : name;
}

function putPartWithProgress(
  url: string,
  body: Blob,
  signal: AbortSignal | undefined,
  onLoaded: (delta: number) => void,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastLoaded = 0;
    let onAbort: (() => void) | undefined;
    const removeAbortListener = () => {
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
    };
    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const delta = evt.loaded - lastLoaded;
      lastLoaded = evt.loaded;
      if (delta > 0) onLoaded(delta);
    };
    xhr.onload = () => {
      removeAbortListener();
      if (xhr.status >= 200 && xhr.status < 300) {
        // Make up the rest of the progress in case onprogress didn't reach 100%.
        const remaining = body.size - lastLoaded;
        if (remaining > 0) onLoaded(remaining);
        const etag = xhr.getResponseHeader('ETag') ?? xhr.getResponseHeader('etag') ?? '';
        if (!etag) {
          reject(
            new Error(
              'S3 PUT succeeded but no ETag header was returned. Check bucket CORS exposes ETag.',
            ),
          );
          return;
        }
        resolve(etag);
      } else {
        reject(new Error(`Part PUT failed: ${xhr.status} ${xhr.statusText}`));
      }
    };
    xhr.onerror = () => {
      removeAbortListener();
      reject(new Error('Network error during part PUT'));
    };
    xhr.onabort = () => {
      removeAbortListener();
      reject(new DOMException('Aborted', 'AbortError'));
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
  });
}

async function uploadOneLarge(
  http: AxiosInstance,
  file: File,
  prefix: string,
  partConcurrency: number,
  signal: AbortSignal | undefined,
  onLoaded: (delta: number) => void,
): Promise<UploadedItem> {
  const key = buildKey(prefix, file.name);

  // 1. Create.
  const createRes = await http.post<CreateResponse>(
    '/multipart/create',
    { key, contentType: file.type || undefined },
    { signal },
  );
  const { uploadId, partSize, maxParts } = createRes.data;

  const numParts = Math.max(1, Math.ceil(file.size / partSize));
  if (numParts > maxParts) {
    throw new Error(
      `File too large for the configured part size: would need ${numParts} parts (max ${maxParts})`,
    );
  }

  // Cleanup helper. Called on any failure so S3 doesn't keep the orphaned parts.
  const abortUpload = async () => {
    try {
      await http.post('/multipart/abort', { key, uploadId });
    } catch {
      /* best-effort */
    }
  };

  try {
    // 2. Presign all part URLs (batched at 1000 per call so we stay under
    //    the server-side schema cap).
    const partNumbers = Array.from({ length: numParts }, (_, i) => i + 1);
    const signed: { partNumber: number; url: string }[] = [];
    for (let i = 0; i < partNumbers.length; i += 1000) {
      const batch = partNumbers.slice(i, i + 1000);
      const signRes = await http.post<SignResponse>(
        '/multipart/sign',
        { key, uploadId, partNumbers: batch },
        { signal },
      );
      signed.push(...signRes.data.urls);
    }
    signed.sort((a, b) => a.partNumber - b.partNumber);

    // 3. PUT parts with bounded concurrency.
    const etags = new Array<string>(numParts);
    let next = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        const idx = next++;
        if (idx >= numParts) return;
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const start = idx * partSize;
        const end = Math.min(start + partSize, file.size);
        const blob = file.slice(start, end);
        const url = signed[idx]!.url;
        const etag = await putPartWithProgress(url, blob, signal, onLoaded);
        etags[idx] = etag;
      }
    };

    const workers: Promise<void>[] = [];
    const lanes = Math.max(1, Math.min(partConcurrency, numParts));
    for (let i = 0; i < lanes; i++) workers.push(worker());
    await Promise.all(workers);

    // 4. Complete.
    const completeRes = await http.post<CompleteResponse>('/multipart/complete', {
      key,
      uploadId,
      parts: etags.map((etag, i) => ({ partNumber: i + 1, etag })),
    });

    return {
      key: completeRes.data.key,
      etag: completeRes.data.etag,
      size: file.size,
    };
  } catch (err) {
    await abortUpload();
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

export async function runUploadJob(opts: UploadJobOptions): Promise<UploadedItem[]> {
  const {
    http,
    files,
    prefix,
    threshold = LARGE_FILE_THRESHOLD_BYTES,
    partConcurrency = 4,
    signal,
    onProgress,
  } = opts;

  const small = files.filter((f) => f.size < threshold);
  const large = files.filter((f) => f.size >= threshold);
  const total = files.reduce((s, f) => s + f.size, 0);
  let loaded = 0;

  const tick = (delta: number) => {
    loaded += delta;
    if (loaded > total) loaded = total;
    onProgress?.({ loaded, total });
  };

  onProgress?.({ loaded: 0, total });

  // Run the small batch and each large file concurrently — they're
  // independent and the user perceives total throughput, not order.
  const tasks: Promise<UploadedItem[]>[] = [];

  if (small.length > 0) {
    tasks.push(uploadSmallBatch(http, small, prefix, signal, tick));
  }
  for (const file of large) {
    tasks.push(
      uploadOneLarge(http, file, prefix, partConcurrency, signal, tick).then((item) => [item]),
    );
  }

  const results = await Promise.all(tasks);
  return results.flat();
}
