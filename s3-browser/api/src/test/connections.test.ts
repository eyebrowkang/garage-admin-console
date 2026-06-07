import { randomUUID } from 'node:crypto';
import { HeadBucketCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { app } from '../app.js';
import db from '../db/index.js';
import { runMigrations } from '../db/migrate.js';
import { connections } from '../db/schema.js';
import { decrypt, encrypt } from '../encryption.js';

// Intercept S3 at the @garage/bucket-api-server boundary: both the uncached
// probe client (createS3Client) and the cached per-connection client
// (getCachedS3Client) resolve to a fake whose `send` we drive per-test. The
// rest of the package (createBucketRouter, getParam, …) stays real so the app
// — including the nested bucketsRouter — loads normally.
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('@garage/bucket-api-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@garage/bucket-api-server')>();
  return {
    ...actual,
    createS3Client: () => ({ send: mockSend }),
    getCachedS3Client: () => ({ send: mockSend }),
  };
});

const authHeader = () => {
  const token = jwt.sign({ role: 'admin', type: 'access' }, process.env.JWT_SECRET as string, {
    expiresIn: '1d',
  });
  return { Authorization: `Bearer ${token}` };
};

async function insertConnection(overrides: Partial<typeof connections.$inferInsert> = {}) {
  const [row] = await db
    .insert(connections)
    .values({
      name: 'conn',
      endpoint: 'http://s3.local:3900',
      region: 'garage',
      accessKeyId: encrypt('GK_access'),
      secretAccessKey: encrypt('super-secret'),
      ...overrides,
    })
    .returning();
  return row!;
}

function s3CommandName(command: unknown): string {
  return (command as { constructor?: { name?: string } })?.constructor?.name ?? 'unknown';
}

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  mockSend.mockReset();
  await db.delete(connections);
});

describe('connections — auth', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/connections');
    expect(res.status).toBe(401);
  });
});

describe('connections — CRUD', () => {
  it('creates a connection, encrypts credentials, and returns only safe fields', async () => {
    const res = await request(app).post('/api/connections').set(authHeader()).send({
      name: 'My S3',
      endpoint: 'http://s3.local:3900',
      accessKeyId: 'GK_abc',
      secretAccessKey: 'super-secret',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'My S3',
      endpoint: 'http://s3.local:3900',
      region: 'us-east-1',
      forcePathStyle: true,
    });
    // Credentials never appear in the API response.
    expect(res.body.accessKeyId).toBeUndefined();
    expect(res.body.secretAccessKey).toBeUndefined();

    // ...and are stored encrypted at rest, recoverable via decrypt.
    const [row] = await db.select().from(connections).where(eq(connections.id, res.body.id));
    expect(row!.accessKeyId).not.toBe('GK_abc');
    expect(decrypt(row!.accessKeyId)).toBe('GK_abc');
    expect(decrypt(row!.secretAccessKey)).toBe('super-secret');
  });

  it('lists connections without exposing credentials', async () => {
    await insertConnection({ name: 'c1' });
    const res = await request(app).get('/api/connections').set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ name: 'c1', forcePathStyle: true });
    expect(res.body[0]).not.toHaveProperty('accessKeyId');
    expect(res.body[0]).not.toHaveProperty('secretAccessKey');
  });

  it('rejects an invalid create payload with 400', async () => {
    const res = await request(app)
      .post('/api/connections')
      .set(authHeader())
      .send({ name: '', endpoint: 'not-a-url', accessKeyId: '', secretAccessKey: '' });
    expect(res.status).toBe(400);
  });

  it('updates fields and re-encrypts only rotated credentials', async () => {
    const conn = await insertConnection({
      name: 'old',
      accessKeyId: encrypt('GK_old'),
      secretAccessKey: encrypt('secret_old'),
    });

    const res = await request(app)
      .put(`/api/connections/${conn.id}`)
      .set(authHeader())
      .send({ name: 'new', secretAccessKey: 'secret_new' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('new');

    const [row] = await db.select().from(connections).where(eq(connections.id, conn.id));
    expect(decrypt(row!.secretAccessKey)).toBe('secret_new'); // rotated
    expect(decrypt(row!.accessKeyId)).toBe('GK_old'); // untouched
  });

  it('rejects an empty update body with 400', async () => {
    const conn = await insertConnection();
    const res = await request(app).put(`/api/connections/${conn.id}`).set(authHeader()).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when updating a missing connection', async () => {
    const res = await request(app)
      .put('/api/connections/does-not-exist')
      .set(authHeader())
      .send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  it('persists an optional bucket scope and clears it with null', async () => {
    const created = await request(app).post('/api/connections').set(authHeader()).send({
      name: 'scoped',
      endpoint: 'http://s3.local:3900',
      accessKeyId: 'GK',
      secretAccessKey: 'secret',
      bucket: 'my-bucket',
    });
    expect(created.body.bucket).toBe('my-bucket');

    const updated = await request(app)
      .put(`/api/connections/${created.body.id}`)
      .set(authHeader())
      .send({ bucket: null });
    expect(updated.status).toBe(200);
    expect(updated.body.bucket).toBeNull();
  });

  it('deletes a connection (204), then 404s on the second delete', async () => {
    const conn = await insertConnection();
    const first = await request(app).delete(`/api/connections/${conn.id}`).set(authHeader());
    expect(first.status).toBe(204);
    const second = await request(app).delete(`/api/connections/${conn.id}`).set(authHeader());
    expect(second.status).toBe(404);
  });
});

describe('POST /api/connections/test — credential probe', () => {
  it('probes via ListBuckets when no bucket scope is given', async () => {
    mockSend.mockResolvedValue({ Buckets: [{ Name: 'a' }, { Name: 'b' }] });
    const res = await request(app).post('/api/connections/test').set(authHeader()).send({
      endpoint: 'http://s3.local:3900',
      accessKeyId: 'GK',
      secretAccessKey: 'secret',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, buckets: 2 });
    expect(mockSend).toHaveBeenCalledWith(expect.any(ListBucketsCommand));
  });

  it('probes via HeadBucket when a bucket scope is given', async () => {
    mockSend.mockResolvedValue({});
    const res = await request(app).post('/api/connections/test').set(authHeader()).send({
      endpoint: 'http://s3.local:3900',
      accessKeyId: 'GK',
      secretAccessKey: 'secret',
      bucket: 'only-this',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, buckets: 1 });
    expect(mockSend).toHaveBeenCalledWith(expect.any(HeadBucketCommand));
  });

  it('returns ok:false (HTTP 200) with the error message when the probe fails', async () => {
    mockSend.mockRejectedValue(new Error('InvalidAccessKeyId'));
    const res = await request(app).post('/api/connections/test').set(authHeader()).send({
      endpoint: 'http://s3.local:3900',
      accessKeyId: 'bad',
      secretAccessKey: 'secret',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/InvalidAccessKeyId/);
  });

  it('400s on an invalid test payload', async () => {
    const res = await request(app)
      .post('/api/connections/test')
      .set(authHeader())
      .send({ endpoint: 'not-a-url' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/connections/:connId/buckets — bucket listing', () => {
  it('lists buckets via ListBuckets for an unscoped connection', async () => {
    const conn = await insertConnection();
    mockSend.mockResolvedValue({
      Buckets: [{ Name: 'one', CreationDate: new Date('2026-01-01T00:00:00Z') }],
    });
    const res = await request(app).get(`/api/connections/${conn.id}/buckets`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.buckets).toEqual([{ name: 'one', creationDate: '2026-01-01T00:00:00.000Z' }]);
  });

  it('returns just the scoped bucket without probing for a bucket-scoped connection', async () => {
    const conn = await insertConnection({ bucket: 'scoped' });
    const res = await request(app).get(`/api/connections/${conn.id}/buckets`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ buckets: [{ name: 'scoped', creationDate: null }] });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('404s for a missing connection', async () => {
    const res = await request(app).get('/api/connections/missing/buckets').set(authHeader());
    expect(res.status).toBe(404);
  });

  it('502s when the upstream ListBuckets call fails', async () => {
    const conn = await insertConnection();
    mockSend.mockRejectedValue(new Error('network down'));
    const res = await request(app).get(`/api/connections/${conn.id}/buckets`).set(authHeader());
    expect(res.status).toBe(502);
  });
});

describe('Bucket Backend API — CORS cache identity', () => {
  it('re-checks CORS when the same connection bucket moves to another endpoint', async () => {
    const bucket = `cors-cache-${randomUUID()}`;
    const conn = await insertConnection({ endpoint: 'http://s3-a.local:3900' });
    let uploadId = 0;
    mockSend.mockImplementation(async (command: unknown) => {
      const commandName = s3CommandName(command);
      if (commandName === 'GetBucketCorsCommand') {
        throw Object.assign(new Error('no rules'), { name: 'NoSuchCORSConfiguration' });
      }
      if (commandName === 'PutBucketCorsCommand') return {};
      if (commandName === 'CreateMultipartUploadCommand') {
        uploadId += 1;
        return { UploadId: `upload-${uploadId}` };
      }
      throw new Error(`unexpected S3 command: ${commandName}`);
    });

    // A browser caller always sends Origin; CORS is provisioned scoped to it.
    const browserOrigin = 'https://app.example';
    const first = await request(app)
      .post(`/api/connections/${conn.id}/buckets/${bucket}/multipart/create`)
      .set(authHeader())
      .set('Origin', browserOrigin)
      .send({ key: 'large.bin' });
    expect(first.status).toBe(200);

    const update = await request(app)
      .put(`/api/connections/${conn.id}`)
      .set(authHeader())
      .send({ endpoint: 'http://s3-b.local:3900' });
    expect(update.status).toBe(200);

    const second = await request(app)
      .post(`/api/connections/${conn.id}/buckets/${bucket}/multipart/create`)
      .set(authHeader())
      .set('Origin', browserOrigin)
      .send({ key: 'large-again.bin' });
    expect(second.status).toBe(200);

    expect(
      mockSend.mock.calls.filter(([command]) => s3CommandName(command) === 'GetBucketCorsCommand'),
    ).toHaveLength(2);
    expect(
      mockSend.mock.calls.filter(([command]) => s3CommandName(command) === 'PutBucketCorsCommand'),
    ).toHaveLength(2);
  });
});
