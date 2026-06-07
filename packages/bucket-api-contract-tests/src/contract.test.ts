import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from './env.js';
import { BucketApiClient } from './client.js';

/**
 * Regression suite for the Bucket Backend API — the shared HTTP surface
 * implemented by both BFFs in this monorepo.
 *
 * Skips itself if env vars aren't set so `pnpm test` is offline-safe.
 */

const runId = `r${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const prefix = `contract-test/${runId}`;

describe.skipIf(config === null)('Bucket Backend API regression', () => {
  let client: BucketApiClient;
  let ownedOwner = false;

  beforeAll(async () => {
    if (!config) return;
    ownedOwner = config.ownerId === null;
    client = await BucketApiClient.create(config);
  });

  afterAll(async () => {
    if (!client) return;
    // Best-effort cleanup of every key we wrote.
    try {
      const listed = await client.list({ prefix: `${prefix}/`, delimiter: '' });
      const keys = listed.objects.map((o) => o.key);
      if (keys.length > 0) await client.deleteObjects(keys);
    } catch {
      // ignore cleanup errors
    }
    await client.dispose({ ownedOwner });
  });

  it('GET /list returns the contract envelope on an empty prefix', async () => {
    const res = await client.list({ prefix: `${prefix}/empty/`, delimiter: '/' });
    expect(res).toMatchObject({
      objects: expect.any(Array),
      prefixes: expect.any(Array),
    });
    expect(res.objects).toHaveLength(0);
  });

  it('POST /upload streams a single file and the response shape matches', async () => {
    const res = await client.upload(
      [{ name: 'small.txt', body: 'hello contract', contentType: 'text/plain' }],
      prefix,
    );
    expect(res.uploaded).toHaveLength(1);
    expect(res.uploaded[0]).toMatchObject({
      key: `${prefix}/small.txt`,
      etag: expect.stringMatching(/^[a-f0-9]{32}$/),
      size: 14,
    });
  });

  it('POST /upload accepts multiple files in one request', async () => {
    const res = await client.upload(
      [
        { name: 'multi-a.txt', body: 'a' },
        { name: 'multi-b.txt', body: 'bb' },
        { name: 'multi-c.txt', body: 'ccc' },
      ],
      prefix,
    );
    expect(res.uploaded).toHaveLength(3);
    const sizes = res.uploaded.map((u) => u.size).sort();
    expect(sizes).toEqual([1, 2, 3]);
  });

  it('GET /list?prefix returns the just-uploaded objects', async () => {
    const res = await client.list({ prefix: `${prefix}/`, delimiter: '/' });
    const keys = res.objects.map((o) => o.key).sort();
    expect(keys).toContain(`${prefix}/small.txt`);
    expect(keys).toContain(`${prefix}/multi-a.txt`);
  });

  it('GET /object returns HEAD-equivalent metadata', async () => {
    const meta = await client.object(`${prefix}/small.txt`);
    expect(meta).toMatchObject({
      key: `${prefix}/small.txt`,
      size: 14,
      etag: expect.stringMatching(/^[a-f0-9]{32}$/),
      lastModified: expect.any(String),
    });
  });

  it('GET /object returns 404 for a missing key', async () => {
    await expect(client.object(`${prefix}/does-not-exist`)).rejects.toMatchObject({
      response: { status: 404 },
    });
  });

  it('POST /presign returns a usable getObject URL', async () => {
    const res = await client.presign({
      key: `${prefix}/small.txt`,
      operation: 'getObject',
      expiresIn: 60,
    });
    expect(res.url).toMatch(/^https?:\/\//);
    expect(res.expiresAt).toBeTypeOf('string');

    // Fetch via the presigned URL — must succeed and return the body.
    const fetchRes = await fetch(res.url);
    expect(fetchRes.status).toBe(200);
    const body = await fetchRes.text();
    expect(body).toBe('hello contract');
  });

  it('POST /presign returns a usable putObject URL', async () => {
    const res = await client.presign({
      key: `${prefix}/put-presigned.txt`,
      operation: 'putObject',
      expiresIn: 60,
    });
    const put = await fetch(res.url, { method: 'PUT', body: 'via presign' });
    expect(put.status).toBe(200);

    const meta = await client.object(`${prefix}/put-presigned.txt`);
    expect(meta.size).toBe(11);
  });

  it('POST /presign honours responseContentDisposition on getObject', async () => {
    const res = await client.presign({
      key: `${prefix}/small.txt`,
      operation: 'getObject',
      expiresIn: 60,
      responseContentDisposition: 'attachment; filename="renamed.txt"',
    });
    const fetched = await fetch(res.url);
    expect(fetched.status).toBe(200);
    // S3 (and Garage) override Content-Disposition when ResponseContentDisposition is signed in.
    const disp = fetched.headers.get('content-disposition') ?? '';
    expect(disp.toLowerCase()).toContain('attachment');
    expect(disp).toContain('renamed.txt');
  });

  it('GET /download streams the full object body through the BFF', async () => {
    const res = await client.download(`${prefix}/small.txt`);
    expect(res.status).toBe(200);
    expect((res.contentDisposition ?? '').toLowerCase()).toContain('attachment');
    expect(res.body.toString()).toBe('hello contract');
  });

  it('GET /download honours a Range request with 206 + Content-Range', async () => {
    const res = await client.download(`${prefix}/small.txt`, 'bytes=0-4');
    expect(res.status).toBe(206);
    expect(res.contentRange ?? '').toMatch(/^bytes 0-4\//);
    expect(res.body.toString()).toBe('hello');
  });

  it('POST /multipart round-trip stitches presigned PUT parts into one object', async () => {
    // Build a body large enough to need two parts: 5MiB + 1KiB total.
    // S3 requires every part except the last to be >= 5 MiB.
    const partSize = 5 * 1024 * 1024;
    const tail = 1024;
    const total = partSize + tail;
    const key = `${prefix}/multipart.bin`;

    const created = await client.multipartCreate({
      key,
      contentType: 'application/octet-stream',
    });
    expect(created.uploadId).toBeTruthy();
    expect(created.partSize).toBeGreaterThanOrEqual(5 * 1024 * 1024);

    const signed = await client.multipartSign({
      key,
      uploadId: created.uploadId,
      partNumbers: [1, 2],
    });
    expect(signed.urls).toHaveLength(2);

    // Allocate the deterministic-but-not-all-zero body so etags differ between parts.
    const body = Buffer.alloc(total);
    for (let i = 0; i < total; i++) body[i] = (i * 13) & 0xff;

    const parts: { partNumber: number; etag: string }[] = [];
    for (const u of signed.urls) {
      const start = (u.partNumber - 1) * partSize;
      const end = u.partNumber === 1 ? partSize : total;
      const chunk = body.subarray(start, end);
      const put = await fetch(u.url, { method: 'PUT', body: chunk });
      expect(put.status).toBe(200);
      const etag = put.headers.get('etag');
      expect(etag).toBeTruthy();
      parts.push({ partNumber: u.partNumber, etag: etag! });
    }

    const completed = await client.multipartComplete({
      key,
      uploadId: created.uploadId,
      parts,
    });
    expect(completed.key).toBe(key);
    expect(completed.etag).toBeTruthy();

    const meta = await client.object(key);
    expect(meta.size).toBe(total);
  });

  it('POST /multipart/abort cleans up an in-progress upload', async () => {
    const key = `${prefix}/multipart-abort.bin`;
    const created = await client.multipartCreate({ key });
    const aborted = await client.multipartAbort({ key, uploadId: created.uploadId });
    expect(aborted.ok).toBe(true);

    // After abort, the object must not exist as a finalized key.
    await expect(client.object(key)).rejects.toMatchObject({
      response: { status: 404 },
    });
  });

  it('POST /copy duplicates an object', async () => {
    const res = await client.copy(`${prefix}/small.txt`, `${prefix}/small-copy.txt`);
    expect(res.etag).toMatch(/^[a-f0-9]{32}$/);

    const meta = await client.object(`${prefix}/small-copy.txt`);
    expect(meta.size).toBe(14);
  });

  it('DELETE /objects handles single-key payload', async () => {
    await client.upload([{ name: 'doomed-single.txt', body: 'gone' }], prefix);
    const res = await client.deleteObjects([`${prefix}/doomed-single.txt`]);
    expect(res.deleted).toEqual([`${prefix}/doomed-single.txt`]);
    expect(res.errors).toEqual([]);
  });

  it('DELETE /objects handles batch payload', async () => {
    await client.upload(
      [
        { name: 'doomed-1.txt', body: '1' },
        { name: 'doomed-2.txt', body: '2' },
      ],
      prefix,
    );
    const res = await client.deleteObjects([`${prefix}/doomed-1.txt`, `${prefix}/doomed-2.txt`]);
    expect(new Set(res.deleted)).toEqual(
      new Set([`${prefix}/doomed-1.txt`, `${prefix}/doomed-2.txt`]),
    );
  });

  it('pagination: continuationToken round-trips when needed', async () => {
    // Upload more keys than maxKeys=2 can hold.
    await client.upload(
      [
        { name: 'page-a.txt', body: 'a' },
        { name: 'page-b.txt', body: 'b' },
        { name: 'page-c.txt', body: 'c' },
      ],
      `${prefix}/paged`,
    );

    const first = await client.list({ prefix: `${prefix}/paged/`, delimiter: '/', maxKeys: 2 });
    expect(first.objects.length).toBeLessThanOrEqual(2);
    if (first.nextContinuationToken) {
      const second = await client.list({
        prefix: `${prefix}/paged/`,
        delimiter: '/',
        maxKeys: 2,
        continuationToken: first.nextContinuationToken,
      });
      expect(second.objects.length).toBeGreaterThan(0);
    }
  });
});
