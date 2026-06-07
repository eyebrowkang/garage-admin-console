import type { AxiosInstance } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runUploadJob, uploadOneFile, UploadJobError } from '../lib/multipart-upload';
import {
  fingerprintFile,
  type UploadSession,
  type UploadSessionStore,
} from '../lib/upload-sessions';

// --- Fake XMLHttpRequest -----------------------------------------------------
// Part PUTs go through XHR (putPartWithProgress). This fake models per-attempt
// outcomes (keyed by URL), optional progress emission, an unsettling "hang" for
// the inactivity-watchdog path, and live concurrency tracking — enough to drive
// the retry / re-sign / decouple / global-concurrency behaviour under test.
interface Settle {
  status?: number;
  /** Simulate a network-level failure (xhr.onerror). */
  net?: boolean;
  /** Never settle — the inactivity watchdog must abort it. */
  hang?: boolean;
  /** Bytes to report via upload.onprogress before settling (defaults to body size). */
  progress?: number;
}

class FakeXHR {
  static plans = new Map<string, Settle[]>();
  static fallback: Settle = { status: 200 };
  static sent: { url: string; body: unknown }[] = [];
  static active = 0;
  static maxActive = 0;

  static reset() {
    FakeXHR.plans = new Map();
    FakeXHR.fallback = { status: 200 };
    FakeXHR.sent = [];
    FakeXHR.active = 0;
    FakeXHR.maxActive = 0;
  }

  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  statusText = '';
  private url = '';
  private settled = false;

  open(_method: string, url: string): void {
    this.url = url;
  }

  getResponseHeader(name: string): string | null {
    return name.toLowerCase() === 'etag' ? '"part-etag"' : null;
  }

  send(body?: unknown): void {
    FakeXHR.sent.push({ url: this.url, body });
    const plan = FakeXHR.plans.get(this.url);
    const outcome = plan && plan.length ? plan.shift()! : FakeXHR.fallback;
    FakeXHR.active += 1;
    FakeXHR.maxActive = Math.max(FakeXHR.maxActive, FakeXHR.active);
    if (outcome.hang) return; // never settles; the watchdog must abort it

    const size = (body as Blob | undefined)?.size ?? 0;
    // Settle on a macrotask so concurrently-sent parts are simultaneously
    // "active" — letting maxActive reflect the real concurrency ceiling.
    setTimeout(() => {
      if (this.settled) return;
      this.settled = true;
      FakeXHR.active -= 1;
      const reported = outcome.progress ?? (outcome.net ? 0 : size);
      if (reported > 0 && this.upload.onprogress) {
        this.upload.onprogress({
          lengthComputable: true,
          loaded: reported,
          total: size,
        } as unknown as ProgressEvent);
      }
      if (outcome.net) {
        this.onerror?.();
        return;
      }
      this.status = outcome.status ?? 200;
      this.statusText = String(this.status);
      this.onload?.();
    }, 0);
  }

  abort(): void {
    if (!this.settled) {
      this.settled = true;
      FakeXHR.active -= 1;
    }
    this.onabort?.();
  }
}

const RealXHR = globalThis.XMLHttpRequest;

beforeEach(() => {
  FakeXHR.reset();
  globalThis.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest;
});

afterEach(() => {
  globalThis.XMLHttpRequest = RealXHR;
});

// Disable backoff sleeps and the (real-timer) stall watchdog by default so the
// suite runs fast; individual tests re-enable what they exercise.
const FAST = { baseDelayMs: 0, maxDelayMs: 0, stallTimeoutMs: 0 } as const;

// --- Fake axios instance -----------------------------------------------------
type Responder = unknown | ((body: Record<string, unknown>) => unknown);

function mockHttp(routes: Record<string, Responder>) {
  const post = vi.fn((url: string, body?: unknown) => {
    const route = routes[url];
    if (route === undefined) return Promise.resolve({ data: {} });
    const value =
      typeof route === 'function'
        ? (route as (b: Record<string, unknown>) => unknown)(
            (body ?? {}) as Record<string, unknown>,
          )
        : route;
    if (value instanceof Error) return Promise.reject(value);
    return Promise.resolve(value);
  });
  return { post } as unknown as AxiosInstance & { post: typeof post };
}

function makeFile(name: string, size: number): File {
  return new File([new Uint8Array(size)], name);
}

// URLs embed the object key so per-file PUT outcomes can be targeted distinctly.
const signResponder = (body: Record<string, unknown>) => ({
  data: {
    urls: (body.partNumbers as number[]).map((n) => ({
      partNumber: n,
      url: `https://s3/${body.key as string}/part/${n}`,
    })),
    expiresAt: '',
  },
});

const partUrl = (key: string, n: number) => `https://s3/${key}/part/${n}`;
const signCalls = (http: { post: ReturnType<typeof vi.fn> }) =>
  http.post.mock.calls.filter(([u]) => u === '/multipart/sign');

describe('runUploadJob — small files (proxy /upload)', () => {
  it('batches every sub-threshold file into a single /upload request', async () => {
    const http = mockHttp({
      '/upload': {
        data: {
          uploaded: [
            { key: 'a.txt', etag: 'e1', size: 3 },
            { key: 'b.txt', etag: 'e2', size: 4 },
          ],
        },
      },
    });
    const out = await runUploadJob({
      http,
      files: [makeFile('a.txt', 3), makeFile('b.txt', 4)],
      prefix: '',
      threshold: 1000,
    });

    expect(out).toHaveLength(2);
    expect(http.post.mock.calls.filter(([u]) => u === '/upload')).toHaveLength(1);
    expect(http.post.mock.calls.some(([u]) => String(u).startsWith('/multipart'))).toBe(false);
    // The proxy body streams; it opts out of the client's control-plane deadline.
    const uploadCfg = http.post.mock.calls.find(([u]) => u === '/upload')?.[2] as
      | { timeout?: number }
      | undefined;
    expect(uploadCfg?.timeout).toBe(0);
  });

  it('emits an initial 0/total progress event', async () => {
    const http = mockHttp({ '/upload': { data: { uploaded: [] } } });
    const onProgress = vi.fn();
    await runUploadJob({
      http,
      files: [makeFile('a', 10)],
      prefix: '',
      threshold: 1000,
      onProgress,
    });
    expect(onProgress).toHaveBeenCalledWith({ loaded: 0, total: 10 });
  });
});

describe('runUploadJob — large files (direct multipart)', () => {
  it('drives a large file through create → sign → PUT → complete', async () => {
    const http = mockHttp({
      '/multipart/create': {
        data: { uploadId: 'up1', key: 'big.txt', partSize: 5, maxParts: 1000 },
      },
      '/multipart/sign': signResponder,
      '/multipart/complete': { data: { key: 'big.txt', etag: 'final-etag' } },
    });

    const out = await runUploadJob({
      http,
      files: [makeFile('big.txt', 12)], // 12 / partSize 5 → 3 parts
      prefix: '',
      threshold: 10,
      reliability: FAST,
    });

    expect(out).toEqual([{ key: 'big.txt', etag: 'final-etag', size: 12 }]);
    // Order across concurrent lanes is not a contract — compare as a set.
    expect(FakeXHR.sent.map((s) => s.url).sort()).toEqual([
      partUrl('big.txt', 1),
      partUrl('big.txt', 2),
      partUrl('big.txt', 3),
    ]);
    const completeCall = http.post.mock.calls.find(([u]) => u === '/multipart/complete');
    expect((completeCall?.[1] as { parts: unknown[] }).parts).toHaveLength(3);
  });

  it('builds the object key from a slash-padded prefix', async () => {
    const http = mockHttp({
      '/multipart/create': { data: { uploadId: 'up1', key: 'x', partSize: 100, maxParts: 1000 } },
      '/multipart/sign': signResponder,
      '/multipart/complete': { data: { key: 'docs/big.txt', etag: 'e' } },
    });
    await runUploadJob({
      http,
      files: [makeFile('big.txt', 50)],
      prefix: '/docs/',
      threshold: 10,
      reliability: FAST,
    });
    const createCall = http.post.mock.calls.find(([u]) => u === '/multipart/create');
    expect((createCall?.[1] as { key: string }).key).toBe('docs/big.txt');
    // The file size is sent so the server can pick an adaptive part size.
    expect((createCall?.[1] as { fileSize?: number }).fileSize).toBe(50);
  });

  it('aborts the upload and rejects on a non-retryable part failure', async () => {
    // 404 is neither retryable nor an expired-URL signal (403/400) → fatal at once.
    FakeXHR.fallback = { status: 404 };
    const http = mockHttp({
      '/multipart/create': {
        data: { uploadId: 'up1', key: 'big.txt', partSize: 5, maxParts: 1000 },
      },
      '/multipart/sign': signResponder,
      '/multipart/abort': { data: { ok: true } },
    });

    await expect(
      runUploadJob({
        http,
        files: [makeFile('big.txt', 12)],
        prefix: '',
        threshold: 10,
        reliability: FAST,
      }),
    ).rejects.toThrow(/404/);
    expect(http.post.mock.calls.some(([u]) => u === '/multipart/abort')).toBe(true);
  });

  it('leaves /multipart/complete untimed (it can take minutes) while timing quick control calls', async () => {
    const http = mockHttp({
      '/multipart/create': {
        data: { uploadId: 'up1', key: 'big.txt', partSize: 100, maxParts: 1000 },
      },
      '/multipart/sign': signResponder,
      '/multipart/complete': { data: { key: 'big.txt', etag: 'e' } },
    });
    await runUploadJob({
      http,
      files: [makeFile('big.txt', 50)],
      prefix: '',
      threshold: 10,
      reliability: FAST,
    });
    const cfgOf = (u: string) =>
      http.post.mock.calls.find(([url]) => url === u)?.[2] as { timeout?: number } | undefined;
    // complete opts OUT of the client's control-plane deadline (timeout: 0 = no
    // limit, since the shared client now defaults to a 30s timeout); the quick
    // metadata calls keep their short deadline.
    expect(cfgOf('/multipart/complete')?.timeout).toBe(0);
    expect(cfgOf('/multipart/create')?.timeout).toBe(30_000);
    expect(cfgOf('/multipart/sign')?.timeout).toBe(30_000);
  });
});

describe('runUploadJob — part-level retry', () => {
  it('retries a transient 503 and then succeeds without aborting', async () => {
    const http = mockHttp({
      '/multipart/create': {
        data: { uploadId: 'up1', key: 'r.txt', partSize: 100, maxParts: 1000 },
      },
      '/multipart/sign': signResponder,
      '/multipart/complete': { data: { key: 'r.txt', etag: 'ok-etag' } },
      '/multipart/abort': { data: { ok: true } },
    });
    FakeXHR.plans.set(partUrl('r.txt', 1), [{ status: 503 }, { status: 200 }]);

    const out = await runUploadJob({
      http,
      files: [makeFile('r.txt', 10)], // 1 part
      prefix: '',
      threshold: 5,
      reliability: FAST,
    });

    expect(out).toEqual([{ key: 'r.txt', etag: 'ok-etag', size: 10 }]);
    expect(FakeXHR.sent.filter((s) => s.url === partUrl('r.txt', 1))).toHaveLength(2);
    expect(http.post.mock.calls.some(([u]) => u === '/multipart/abort')).toBe(false);
  });

  it('re-signs the part on a 403 (expired URL) then succeeds', async () => {
    const http = mockHttp({
      '/multipart/create': {
        data: { uploadId: 'up1', key: 'x.txt', partSize: 100, maxParts: 1000 },
      },
      '/multipart/sign': signResponder,
      '/multipart/complete': { data: { key: 'x.txt', etag: 'e' } },
    });
    FakeXHR.plans.set(partUrl('x.txt', 1), [{ status: 403 }, { status: 200 }]);

    const out = await runUploadJob({
      http,
      files: [makeFile('x.txt', 10)],
      prefix: '',
      threshold: 5,
      reliability: FAST,
    });

    expect(out).toHaveLength(1);
    // One window sign on first demand + one single-part re-sign after the 403.
    expect(signCalls(http)).toHaveLength(2);
    const resign = signCalls(http)[1];
    expect((resign?.[1] as { partNumbers: number[] }).partNumbers).toEqual([1]);
  });

  it('re-signs the part on a 400 (Garage expired URL) then succeeds', async () => {
    const http = mockHttp({
      '/multipart/create': {
        data: { uploadId: 'up1', key: 'g.txt', partSize: 100, maxParts: 1000 },
      },
      '/multipart/sign': signResponder,
      '/multipart/complete': { data: { key: 'g.txt', etag: 'e' } },
    });
    // Garage returns 400 "Date is too old" (not 403) for an expired presigned URL.
    FakeXHR.plans.set(partUrl('g.txt', 1), [{ status: 400 }, { status: 200 }]);

    const out = await runUploadJob({
      http,
      files: [makeFile('g.txt', 10)],
      prefix: '',
      threshold: 5,
      reliability: FAST,
    });

    expect(out).toHaveLength(1);
    expect(signCalls(http)).toHaveLength(2); // window sign + single-part re-sign
    expect((signCalls(http)[1]?.[1] as { partNumbers: number[] }).partNumbers).toEqual([1]);
  });

  it('re-signs again on a SECOND expiry (a queued part can outlive two windows)', async () => {
    const http = mockHttp({
      '/multipart/create': {
        data: { uploadId: 'up1', key: 'y.txt', partSize: 100, maxParts: 1000 },
      },
      '/multipart/sign': signResponder,
      '/multipart/complete': { data: { key: 'y.txt', etag: 'e' } },
    });
    // Two consecutive expiries before the part finally lands. The old one-shot
    // re-sign would have made the SECOND 403 fatal; bounded re-signs recover.
    FakeXHR.plans.set(partUrl('y.txt', 1), [{ status: 403 }, { status: 403 }, { status: 200 }]);

    const out = await runUploadJob({
      http,
      files: [makeFile('y.txt', 10)],
      prefix: '',
      threshold: 5,
      reliability: FAST,
    });

    expect(out).toHaveLength(1);
    expect(FakeXHR.sent.filter((s) => s.url === partUrl('y.txt', 1))).toHaveLength(3);
    // One window sign + one re-sign per expiry.
    expect(signCalls(http)).toHaveLength(3);
    expect((signCalls(http)[1]?.[1] as { partNumbers: number[] }).partNumbers).toEqual([1]);
    expect((signCalls(http)[2]?.[1] as { partNumbers: number[] }).partNumbers).toEqual([1]);
  });

  it('gives up after maxAttempts is exhausted and aborts', async () => {
    const http = mockHttp({
      '/multipart/create': {
        data: { uploadId: 'up1', key: 'd.txt', partSize: 100, maxParts: 1000 },
      },
      '/multipart/sign': signResponder,
      '/multipart/abort': { data: { ok: true } },
    });
    FakeXHR.plans.set(partUrl('d.txt', 1), [{ status: 503 }, { status: 503 }]);

    await expect(
      runUploadJob({
        http,
        files: [makeFile('d.txt', 10)],
        prefix: '',
        threshold: 5,
        reliability: { ...FAST, maxAttempts: 2 },
      }),
    ).rejects.toThrow();
    expect(FakeXHR.sent.filter((s) => s.url === partUrl('d.txt', 1))).toHaveLength(2);
    expect(http.post.mock.calls.some(([u]) => u === '/multipart/abort')).toBe(true);
  });

  it('recovers a stalled part via the inactivity watchdog', async () => {
    const http = mockHttp({
      '/multipart/create': {
        data: { uploadId: 'up1', key: 'h.txt', partSize: 100, maxParts: 1000 },
      },
      '/multipart/sign': signResponder,
      '/multipart/complete': { data: { key: 'h.txt', etag: 'e' } },
    });
    FakeXHR.plans.set(partUrl('h.txt', 1), [{ hang: true }, { status: 200 }]);

    const out = await runUploadJob({
      http,
      files: [makeFile('h.txt', 10)],
      prefix: '',
      threshold: 5,
      reliability: { baseDelayMs: 0, maxDelayMs: 0, stallTimeoutMs: 10, maxAttempts: 4 },
    });

    expect(out).toHaveLength(1);
    expect(FakeXHR.sent.filter((s) => s.url === partUrl('h.txt', 1))).toHaveLength(2);
  });
});

describe('runUploadJob — failure isolation & progress', () => {
  it('lets a sibling file complete when another file fails fatally', async () => {
    const http = mockHttp({
      '/multipart/create': (body) => ({
        data: { uploadId: `up-${body.key}`, key: body.key, partSize: 100, maxParts: 1000 },
      }),
      '/multipart/sign': signResponder,
      '/multipart/complete': (body) => ({ data: { key: body.key, etag: `etag-${body.key}` } }),
      '/multipart/abort': { data: { ok: true } },
    });
    FakeXHR.plans.set(partUrl('a.txt', 1), [{ status: 404 }]); // a.txt fails fatally (no re-sign)
    // b.txt uses the default 200 fallback.

    const err = await runUploadJob({
      http,
      files: [makeFile('a.txt', 10), makeFile('b.txt', 10)],
      prefix: '',
      threshold: 5,
      reliability: FAST,
    }).catch((e: unknown) => e);

    const completed = http.post.mock.calls
      .filter(([u]) => u === '/multipart/complete')
      .map(([, b]) => (b as { key: string }).key);
    const aborted = http.post.mock.calls
      .filter(([u]) => u === '/multipart/abort')
      .map(([, b]) => (b as { key: string }).key);
    expect(completed).toContain('b.txt'); // sibling finished despite the failure
    expect(aborted).toContain('a.txt'); // failed file cleaned itself up
    expect(completed).not.toContain('a.txt');
    // The rejection carries the partial success so the caller isn't misled.
    expect(err).toBeInstanceOf(UploadJobError);
    expect((err as UploadJobError).uploaded.map((u) => u.key)).toEqual(['b.txt']);
  });

  it('does not double-count progress across a retried part', async () => {
    const http = mockHttp({
      '/multipart/create': {
        data: { uploadId: 'up1', key: 'p.txt', partSize: 100, maxParts: 1000 },
      },
      '/multipart/sign': signResponder,
      '/multipart/complete': { data: { key: 'p.txt', etag: 'e' } },
    });
    // First attempt reports 40 bytes then fails; retry reports the full 100.
    FakeXHR.plans.set(partUrl('p.txt', 1), [
      { status: 500, progress: 40 },
      { status: 200, progress: 100 },
    ]);

    const loadeds: number[] = [];
    await runUploadJob({
      http,
      files: [makeFile('p.txt', 100)],
      prefix: '',
      threshold: 5,
      reliability: FAST,
      onProgress: (p) => loadeds.push(p.loaded),
    });

    expect(loadeds[loadeds.length - 1]).toBe(100); // ends exactly at total, once
    expect(Math.max(...loadeds)).toBeLessThanOrEqual(100); // never overshoots
    // The failed attempt's bytes were rolled back → progress dipped before recovering.
    const dipped = loadeds.some((v, i) => i > 0 && v < loadeds[i - 1]!);
    expect(dipped).toBe(true);
  });
});

describe('runUploadJob — global concurrency cap', () => {
  it('never exceeds the global PUT concurrency ceiling across files', async () => {
    const http = mockHttp({
      '/multipart/create': (body) => ({
        data: { uploadId: `up-${body.key}`, key: body.key, partSize: 100, maxParts: 1000 },
      }),
      '/multipart/sign': signResponder,
      '/multipart/complete': (body) => ({ data: { key: body.key, etag: `etag-${body.key}` } }),
    });

    // 3 files × 5 parts = 15 PUTs; per-file lanes (4) × 3 files = 12 would-be
    // concurrent without a global cap. The shared limiter holds it at 6.
    const out = await runUploadJob({
      http,
      files: [makeFile('f1', 500), makeFile('f2', 500), makeFile('f3', 500)],
      prefix: '',
      threshold: 50,
      reliability: FAST,
    });

    expect(out).toHaveLength(3);
    expect(FakeXHR.maxActive).toBeGreaterThan(1); // genuinely concurrent
    expect(FakeXHR.maxActive).toBeLessThanOrEqual(6); // but capped
  });
});

describe('runUploadJob — user cancel', () => {
  it('rejects with AbortError and aborts the in-flight multipart upload', async () => {
    const controller = new AbortController();
    const http = mockHttp({
      '/multipart/create': {
        data: { uploadId: 'up1', key: 'c.txt', partSize: 100, maxParts: 1000 },
      },
      '/multipart/sign': signResponder,
      '/multipart/abort': { data: { ok: true } },
    });
    FakeXHR.plans.set(partUrl('c.txt', 1), [{ hang: true }]); // in-flight, never settles

    const p = runUploadJob({
      http,
      files: [makeFile('c.txt', 10)],
      prefix: '',
      threshold: 5,
      signal: controller.signal,
      reliability: FAST,
    });
    const settled = expect(p).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise((r) => setTimeout(r, 5)); // let create → sign → PUT start
    controller.abort();
    await settled;

    expect(http.post.mock.calls.some(([u]) => u === '/multipart/abort')).toBe(true);
  });

  it('reports a cancel as AbortError even if another file errored concurrently', async () => {
    const controller = new AbortController();
    const http = mockHttp({
      '/multipart/create': (body) => ({
        data: { uploadId: `up-${body.key}`, key: body.key, partSize: 100, maxParts: 1000 },
      }),
      '/multipart/sign': signResponder,
      '/multipart/abort': { data: { ok: true } },
    });
    FakeXHR.plans.set(partUrl('hang.txt', 1), [{ hang: true }]); // cancelled
    FakeXHR.plans.set(partUrl('bad.txt', 1), [{ status: 404 }]); // real fatal error, settles first

    const p = runUploadJob({
      http,
      files: [makeFile('hang.txt', 10), makeFile('bad.txt', 10)],
      prefix: '',
      threshold: 5,
      signal: controller.signal,
      reliability: FAST,
    });
    const settled = expect(p).rejects.toMatchObject({ name: 'AbortError' });
    await new Promise((r) => setTimeout(r, 5));
    controller.abort();
    await settled;
  });
});

describe('runUploadJob — mixed batch routing', () => {
  it('routes small files to /upload and large files to multipart in one job', async () => {
    const http = mockHttp({
      '/upload': { data: { uploaded: [{ key: 'small.txt', etag: 'e', size: 3 }] } },
      '/multipart/create': {
        data: { uploadId: 'up1', key: 'big.txt', partSize: 100, maxParts: 1000 },
      },
      '/multipart/sign': signResponder,
      '/multipart/complete': { data: { key: 'big.txt', etag: 'big-etag' } },
    });

    const out = await runUploadJob({
      http,
      files: [makeFile('small.txt', 3), makeFile('big.txt', 50)],
      prefix: '',
      threshold: 10,
      reliability: FAST,
    });

    expect(out.map((i) => i.key).sort()).toEqual(['big.txt', 'small.txt']);
    expect(http.post.mock.calls.some(([u]) => u === '/upload')).toBe(true);
    expect(http.post.mock.calls.some(([u]) => u === '/multipart/create')).toBe(true);
  });
});

function memStore(): UploadSessionStore {
  const map = new Map<string, UploadSession>();
  const k = (ns: string, fp: string) => `${ns}|${fp}`;
  return {
    get: (ns, fp) => map.get(k(ns, fp)) ?? null,
    put: (ns, fp, s) => void map.set(k(ns, fp), s),
    remove: (ns, fp) => void map.delete(k(ns, fp)),
  };
}

describe('uploadOneFile — resume', () => {
  it('resumes a large file, skipping parts already on the server', async () => {
    const key = 'big.bin';
    const file = makeFile(key, 12); // partSize 5 → 3 parts (5, 5, 2)
    const store = memStore();
    // Seed a session as if a prior attempt created the upload (namespace '' since
    // the mock http has no defaults.baseURL).
    store.put('', fingerprintFile(file), {
      key,
      uploadId: 'up-resumed',
      partSize: 5,
      createdAt: Date.now(),
    });

    const http = mockHttp({
      // Part 1 already on the server; create must NOT be called.
      '/multipart/parts': { data: { parts: [{ partNumber: 1, etag: 'r1', size: 5 }] } },
      '/multipart/sign': signResponder,
      '/multipart/complete': { data: { key, etag: 'final' } },
    });

    const item = await uploadOneFile(http, file, '', {
      threshold: 10,
      reliability: FAST,
      resume: { store },
    });

    expect(item).toEqual({ key, etag: 'final', size: 12 });
    // Only the missing parts (2, 3) are PUT; part 1 is skipped.
    expect(FakeXHR.sent.map((s) => s.url).sort()).toEqual([partUrl(key, 2), partUrl(key, 3)]);
    // A fresh create is NOT issued when resuming.
    expect(http.post.mock.calls.some(([u]) => u === '/multipart/create')).toBe(false);
    // Complete stitches all three parts (1 from the server + 2 uploaded).
    const complete = http.post.mock.calls.find(([u]) => u === '/multipart/complete');
    expect((complete?.[1] as { parts: unknown[] }).parts).toHaveLength(3);
    // Session is cleared once the upload completes.
    expect(store.get('', fingerprintFile(file))).toBeNull();
  });

  it('starts fresh and persists a session when none exists', async () => {
    const key = 'fresh.bin';
    const file = makeFile(key, 12);
    const store = memStore();
    const http = mockHttp({
      '/multipart/create': { data: { uploadId: 'up-new', key, partSize: 5, maxParts: 1000 } },
      '/multipart/sign': signResponder,
      '/multipart/complete': { data: { key, etag: 'final' } },
    });

    await uploadOneFile(http, file, '', { threshold: 10, reliability: FAST, resume: { store } });

    // No saved session → it created one (no /multipart/parts call), then cleared it on success.
    expect(http.post.mock.calls.some(([u]) => u === '/multipart/parts')).toBe(false);
    expect(http.post.mock.calls.some(([u]) => u === '/multipart/create')).toBe(true);
    expect(store.get('', fingerprintFile(file))).toBeNull();
  });

  it('discards a stale session (parts 404) and starts fresh', async () => {
    const key = 'stale.bin';
    const file = makeFile(key, 12);
    const store = memStore();
    store.put('', fingerprintFile(file), {
      key,
      uploadId: 'dead',
      partSize: 5,
      createdAt: Date.now(),
    });

    const notFound = Object.assign(new Error('NoSuchUpload'), {
      response: { status: 404 },
    });
    const http = mockHttp({
      '/multipart/parts': notFound, // stale → rejected
      '/multipart/create': { data: { uploadId: 'up-new', key, partSize: 5, maxParts: 1000 } },
      '/multipart/sign': signResponder,
      '/multipart/complete': { data: { key, etag: 'final' } },
    });

    const item = await uploadOneFile(http, file, '', {
      threshold: 10,
      reliability: FAST,
      resume: { store },
    });

    expect(item.etag).toBe('final');
    // Fell back to a fresh create after the stale-session probe failed.
    expect(http.post.mock.calls.some(([u]) => u === '/multipart/create')).toBe(true);
    expect(FakeXHR.sent).toHaveLength(3); // all 3 parts uploaded fresh
  });

  it('keeps the session and propagates a transient probe error (no fresh upload)', async () => {
    const key = 'flaky.bin';
    const file = makeFile(key, 12);
    const store = memStore();
    store.put('', fingerprintFile(file), {
      key,
      uploadId: 'up-keep',
      partSize: 5,
      createdAt: Date.now(),
    });

    const transient = Object.assign(new Error('Service Unavailable'), {
      response: { status: 503 },
    });
    const http = mockHttp({
      '/multipart/parts': transient, // transient, NOT a 404
      '/multipart/create': {
        data: { uploadId: 'must-not-be-used', key, partSize: 5, maxParts: 1000 },
      },
    });

    await expect(
      uploadOneFile(http, file, '', { threshold: 10, reliability: FAST, resume: { store } }),
    ).rejects.toThrow();

    // Parts are still valid → the session is preserved for a later resume, and no
    // fresh multipart upload is created.
    expect(store.get('', fingerprintFile(file))?.uploadId).toBe('up-keep');
    expect(http.post.mock.calls.some(([u]) => u === '/multipart/create')).toBe(false);
  });
});
