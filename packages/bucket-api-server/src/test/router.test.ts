import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { Readable } from 'node:stream';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { S3Client } from '@aws-sdk/client-s3';

import { createBucketRouter } from '../router.js';
import type { Logger } from '../types.js';

const silentLogger: Logger = { error: () => undefined };

interface RecordedCall {
  name: string;
  input: Record<string, unknown>;
}
type Handler = (input: Record<string, unknown>) => unknown;

/**
 * A mock S3Client that dispatches on the command's constructor name and records
 * every call. A handler may return a value or throw to simulate an S3 error.
 */
function makeClient(handlers: Record<string, Handler>) {
  const calls: RecordedCall[] = [];
  const send = vi.fn(async (command: unknown) => {
    const name = (command as { constructor: { name: string } }).constructor.name;
    const input = (command as { input: Record<string, unknown> }).input;
    calls.push({ name, input });
    const handler = handlers[name];
    if (!handler) throw new Error(`unexpected command: ${name}`);
    return handler(input);
  });
  return { client: { send } as unknown as S3Client, calls };
}

const servers: Server[] = [];

afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function withServer(client: S3Client, fn: (base: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(
    '/b',
    createBucketRouter({
      resolveContext: () => ({ client, bucketName: 'bucket' }),
      logger: silentLogger,
      manageCors: false,
    }),
  );
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  await fn(`http://127.0.0.1:${port}/b`);
}

const GiB = 1024 * 1024 * 1024;
const rangeBounds = (r: string) => r.replace('bytes=', '').split('-').map(Number);

describe('GET /download — streaming', () => {
  it('streams the full object with an attachment disposition', async () => {
    const { client } = makeClient({
      GetObjectCommand: () => ({
        Body: Readable.from([Buffer.from('hello world')]),
        ContentType: 'text/plain',
        ContentLength: 11,
      }),
    });
    await withServer(client, async (base) => {
      const res = await fetch(`${base}/download?key=a.txt`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-disposition')).toContain('attachment');
      expect(await res.text()).toBe('hello world');
    });
  });

  it('returns 206 + Content-Range for a ranged request and forwards the Range header', async () => {
    const { client, calls } = makeClient({
      GetObjectCommand: () => ({
        Body: Readable.from([Buffer.from('hello')]),
        ContentType: 'text/plain',
        ContentLength: 5,
        ContentRange: 'bytes 0-4/11',
      }),
    });
    await withServer(client, async (base) => {
      const res = await fetch(`${base}/download?key=a.txt`, { headers: { Range: 'bytes=0-4' } });
      expect(res.status).toBe(206);
      expect(res.headers.get('content-range')).toBe('bytes 0-4/11');
      expect(res.headers.get('accept-ranges')).toBe('bytes');
      expect(await res.text()).toBe('hello');
    });
    expect(calls.find((c) => c.name === 'GetObjectCommand')?.input.Range).toBe('bytes=0-4');
  });

  it('returns 404 JSON for a missing object', async () => {
    const { client } = makeClient({
      GetObjectCommand: () => {
        throw Object.assign(new Error('no such key'), { $metadata: { httpStatusCode: 404 } });
      },
    });
    await withServer(client, async (base) => {
      const res = await fetch(`${base}/download?key=missing`);
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBeTruthy();
    });
  });

  it('does not deliver a clean body when the upstream stream errors mid-flight', async () => {
    const { client } = makeClient({
      GetObjectCommand: () => {
        const s = new Readable({ read() {} });
        s.push(Buffer.from('partial'));
        // Error AFTER headers (incl. Content-Length: 100) are committed.
        setImmediate(() => s.destroy(new Error('upstream blew up')));
        return { Body: s, ContentType: 'application/octet-stream', ContentLength: 100 };
      },
    });
    await withServer(client, async (base) => {
      // The transfer must fail (truncated/reset) rather than read as a complete
      // 100-byte body — and the server must not crash.
      await expect(
        (async () => {
          const res = await fetch(`${base}/download?key=a.bin`);
          await res.arrayBuffer();
        })(),
      ).rejects.toBeTruthy();
    });
  });

  it('stops pulling from upstream when the client disconnects mid-download', async () => {
    let destroyed = false;
    const { client } = makeClient({
      GetObjectCommand: () => {
        // A stream that keeps producing until destroyed.
        const s = new Readable({
          read() {
            this.push(Buffer.alloc(1024, 1));
          },
        });
        s.on('close', () => {
          destroyed = true;
        });
        return { Body: s, ContentType: 'application/octet-stream' };
      },
    });
    await withServer(client, async (base) => {
      const ctrl = new AbortController();
      const p = fetch(`${base}/download?key=big.bin`, { signal: ctrl.signal });
      const res = await p;
      const reader = res.body!.getReader();
      await reader.read(); // pull one chunk, then bail
      ctrl.abort();
      // Give the server a tick to observe the close and tear the source down.
      await new Promise((r) => setTimeout(r, 50));
      expect(destroyed).toBe(true);
    });
  });
});

describe('POST /copy — size-aware', () => {
  const postCopy = (base: string, src: string, dst: string) =>
    fetch(`${base}/copy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ src, dst }),
    });

  it('uses a single CopyObject for objects <= 5 GiB', async () => {
    const { client, calls } = makeClient({
      HeadObjectCommand: () => ({ ContentLength: 1024, ContentType: 'text/plain' }),
      CopyObjectCommand: () => ({ CopyObjectResult: { ETag: '"abc123"' } }),
    });
    await withServer(client, async (base) => {
      const res = await postCopy(base, 'a', 'b');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ etag: 'abc123' });
    });
    expect(calls.some((c) => c.name === 'CopyObjectCommand')).toBe(true);
    expect(calls.some((c) => c.name === 'CreateMultipartUploadCommand')).toBe(false);
  });

  it('falls back to multipart copy for objects > 5 GiB with inclusive, contiguous ranges', async () => {
    const size = 6 * GiB;
    const { client, calls } = makeClient({
      HeadObjectCommand: () => ({
        ContentLength: size,
        ContentType: 'video/mp4',
        Metadata: { foo: 'bar' },
      }),
      CreateMultipartUploadCommand: () => ({ UploadId: 'up-1' }),
      UploadPartCopyCommand: (input) => ({ CopyPartResult: { ETag: `"p${input.PartNumber}"` } }),
      CompleteMultipartUploadCommand: () => ({ ETag: '"final-etag"' }),
    });
    await withServer(client, async (base) => {
      const res = await postCopy(base, 'big', 'big-copy');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ etag: 'final-etag' });
    });

    // Source content metadata carried onto the new multipart upload.
    const create = calls.find((c) => c.name === 'CreateMultipartUploadCommand');
    expect(create?.input.ContentType).toBe('video/mp4');
    expect(create?.input.Metadata).toEqual({ foo: 'bar' });

    const ranges = calls
      .filter((c) => c.name === 'UploadPartCopyCommand')
      .map((c) => c.input.CopySourceRange as string);
    expect(ranges.length).toBeGreaterThan(1);
    expect(rangeBounds(ranges[0]!)[0]).toBe(0); // first part starts at 0
    expect(rangeBounds(ranges[ranges.length - 1]!)[1]).toBe(size - 1); // last clamps to size-1
    // Contiguous + inclusive: each part starts one byte after the previous end.
    for (let i = 1; i < ranges.length; i++) {
      expect(rangeBounds(ranges[i]!)[0]).toBe(rangeBounds(ranges[i - 1]!)[1]! + 1);
    }

    const complete = calls.find((c) => c.name === 'CompleteMultipartUploadCommand');
    const parts = (complete?.input.MultipartUpload as { Parts: { PartNumber: number }[] }).Parts;
    expect(parts.map((p) => p.PartNumber)).toEqual(ranges.map((_, i) => i + 1));
  });

  it('aborts the multipart copy when a part fails', async () => {
    const { client, calls } = makeClient({
      HeadObjectCommand: () => ({ ContentLength: 6 * GiB }),
      CreateMultipartUploadCommand: () => ({ UploadId: 'up-2' }),
      UploadPartCopyCommand: (input) => {
        if (input.PartNumber === 2) throw new Error('part 2 failed');
        return { CopyPartResult: { ETag: '"p1"' } };
      },
      AbortMultipartUploadCommand: () => ({}),
    });
    await withServer(client, async (base) => {
      const res = await postCopy(base, 'big', 'big-copy');
      expect(res.status).toBeGreaterThanOrEqual(500);
    });
    expect(
      calls.some((c) => c.name === 'AbortMultipartUploadCommand' && c.input.UploadId === 'up-2'),
    ).toBe(true);
    expect(calls.some((c) => c.name === 'CompleteMultipartUploadCommand')).toBe(false);
  });

  it('returns 404 when the source object is missing', async () => {
    const { client } = makeClient({
      HeadObjectCommand: () => {
        throw Object.assign(new Error('no such key'), { $metadata: { httpStatusCode: 404 } });
      },
    });
    await withServer(client, async (base) => {
      const res = await postCopy(base, 'missing', 'x');
      expect(res.status).toBe(404);
    });
  });
});
