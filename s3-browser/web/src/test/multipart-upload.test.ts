import type { AxiosInstance } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runUploadJob } from '../lib/multipart-upload';

// --- Fake XMLHttpRequest -----------------------------------------------------
// Part PUTs go through XHR (putPartWithProgress). This minimal fake settles
// each send on a microtask with a controllable outcome and an ETag header.
type XhrOutcome = 'ok' | 'fail' | 'error';

class FakeXHR {
  static outcome: XhrOutcome = 'ok';
  static sent: { url: string; body: unknown }[] = [];

  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  statusText = '';
  private url = '';
  private aborted = false;

  open(_method: string, url: string): void {
    this.url = url;
  }

  getResponseHeader(name: string): string | null {
    return name.toLowerCase() === 'etag' ? '"part-etag"' : null;
  }

  send(body?: unknown): void {
    FakeXHR.sent.push({ url: this.url, body });
    queueMicrotask(() => {
      if (this.aborted) return;
      if (FakeXHR.outcome === 'error') {
        this.onerror?.();
      } else if (FakeXHR.outcome === 'fail') {
        this.status = 500;
        this.statusText = 'Server Error';
        this.onload?.();
      } else {
        this.status = 200;
        this.statusText = 'OK';
        this.onload?.();
      }
    });
  }

  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }
}

const RealXHR = globalThis.XMLHttpRequest;

beforeEach(() => {
  FakeXHR.outcome = 'ok';
  FakeXHR.sent = [];
  globalThis.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest;
});

afterEach(() => {
  globalThis.XMLHttpRequest = RealXHR;
});

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

const signResponder = (body: Record<string, unknown>) => ({
  data: {
    urls: (body.partNumbers as number[]).map((n) => ({
      partNumber: n,
      url: `https://s3/part/${n}`,
    })),
    expiresAt: '',
  },
});

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
    });

    expect(out).toEqual([{ key: 'big.txt', etag: 'final-etag', size: 12 }]);
    expect(FakeXHR.sent.map((s) => s.url)).toEqual([
      'https://s3/part/1',
      'https://s3/part/2',
      'https://s3/part/3',
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
    await runUploadJob({ http, files: [makeFile('big.txt', 50)], prefix: '/docs/', threshold: 10 });
    const createCall = http.post.mock.calls.find(([u]) => u === '/multipart/create');
    expect((createCall?.[1] as { key: string }).key).toBe('docs/big.txt');
  });

  it('aborts the upload and rejects when a part PUT fails', async () => {
    FakeXHR.outcome = 'fail';
    const http = mockHttp({
      '/multipart/create': {
        data: { uploadId: 'up1', key: 'big.txt', partSize: 5, maxParts: 1000 },
      },
      '/multipart/sign': signResponder,
      '/multipart/abort': { data: { ok: true } },
    });

    await expect(
      runUploadJob({ http, files: [makeFile('big.txt', 12)], prefix: '', threshold: 10 }),
    ).rejects.toThrow();
    expect(http.post.mock.calls.some(([u]) => u === '/multipart/abort')).toBe(true);
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
    });

    expect(out.map((i) => i.key).sort()).toEqual(['big.txt', 'small.txt']);
    expect(http.post.mock.calls.some(([u]) => u === '/upload')).toBe(true);
    expect(http.post.mock.calls.some(([u]) => u === '/multipart/create')).toBe(true);
  });
});
