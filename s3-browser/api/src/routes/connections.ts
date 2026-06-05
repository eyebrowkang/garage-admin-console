import { Router, type Router as ExpressRouter } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { HeadBucketCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import { createS3Client } from '@garage/bucket-api-server';

import db from '../db/index.js';
import { connections } from '../db/schema.js';
import { encrypt } from '../encryption.js';
import { logger } from '../logger.js';
import { clientForConnection } from '../lib/s3-client.js';
import bucketsRouter from './buckets.js';

const router: ExpressRouter = Router();

const CreateSchema = z.object({
  name: z.string().min(1),
  endpoint: z.string().url(),
  region: z.string().min(1).default('us-east-1'),
  forcePathStyle: z.boolean().default(true),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  // Optional bucket scope for keys that lack ListBuckets permission.
  bucket: z.string().trim().optional(),
});

const UpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    endpoint: z.string().url().optional(),
    region: z.string().min(1).optional(),
    forcePathStyle: z.boolean().optional(),
    accessKeyId: z.string().min(1).optional(),
    secretAccessKey: z.string().min(1).optional(),
    bucket: z.string().trim().nullable().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

// Safe fields — never expose credentials in list/get responses.
const safeColumns = {
  id: connections.id,
  name: connections.name,
  endpoint: connections.endpoint,
  region: connections.region,
  forcePathStyle: connections.forcePathStyle,
  bucket: connections.bucket,
  createdAt: connections.createdAt,
  updatedAt: connections.updatedAt,
} as const;

function toApi<T extends { forcePathStyle: string }>(row: T) {
  return { ...row, forcePathStyle: row.forcePathStyle !== 'false' };
}

const TestSchema = z.object({
  endpoint: z.string().url(),
  region: z.string().min(1).default('us-east-1'),
  forcePathStyle: z.boolean().default(true),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  bucket: z.string().trim().optional(),
});

router.post('/test', async (req, res) => {
  try {
    const body = TestSchema.parse(req.body);
    const bucket = body.bucket?.trim();
    // Transient probe credentials — use an uncached client so one-off test
    // creds never linger in the shared S3 client cache.
    const client = createS3Client({
      endpoint: body.endpoint.replace(/\/+$/, ''),
      region: body.region,
      forcePathStyle: body.forcePathStyle,
      credentials: {
        accessKeyId: body.accessKeyId,
        secretAccessKey: body.secretAccessKey,
      },
    });
    if (bucket) {
      // Bucket-scoped probe — works for keys without ListBuckets permission.
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      res.json({ ok: true, buckets: 1 });
      return;
    }
    const out = await client.send(new ListBucketsCommand({}));
    res.json({ ok: true, buckets: (out.Buckets ?? []).length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues });
      return;
    }
    logger.warn({ err }, 'connection test failed');
    res.status(200).json({ ok: false, error: (err as Error).message || 'Unreachable' });
  }
});

router.get('/', async (_req, res) => {
  try {
    const rows = await db.select(safeColumns).from(connections);
    res.json(rows.map(toApi));
  } catch (error) {
    logger.error({ err: error }, 'Error fetching connections');
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = CreateSchema.parse(req.body);
    const bucket = body.bucket?.trim() ? body.bucket.trim() : null;
    const [row] = await db
      .insert(connections)
      .values({
        name: body.name,
        endpoint: body.endpoint,
        region: body.region,
        forcePathStyle: body.forcePathStyle ? 'true' : 'false',
        accessKeyId: encrypt(body.accessKeyId),
        secretAccessKey: encrypt(body.secretAccessKey),
        bucket,
      })
      .returning(safeColumns);
    res.status(201).json(toApi(row!));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      logger.error({ err: error }, 'Error creating connection');
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id!;
    const body = UpdateSchema.parse(req.body);
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.endpoint !== undefined) patch.endpoint = body.endpoint;
    if (body.region !== undefined) patch.region = body.region;
    if (body.forcePathStyle !== undefined) {
      patch.forcePathStyle = body.forcePathStyle ? 'true' : 'false';
    }
    if (body.accessKeyId !== undefined) patch.accessKeyId = encrypt(body.accessKeyId);
    if (body.secretAccessKey !== undefined) {
      patch.secretAccessKey = encrypt(body.secretAccessKey);
    }
    if (body.bucket !== undefined) {
      const trimmed = body.bucket?.trim();
      patch.bucket = trimmed ? trimmed : null;
    }
    const [row] = await db
      .update(connections)
      .set(patch)
      .where(eq(connections.id, id))
      .returning(safeColumns);
    if (!row) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    res.json(toApi(row));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      logger.error({ err: error }, 'Error updating connection');
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id!;
    const deleted = await db
      .delete(connections)
      .where(eq(connections.id, id))
      .returning({ id: connections.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, 'Error deleting connection');
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * Bucket Backend API. Nested here so its routes share the same
 * authentication mount and `:connId`/`:bucket` params propagate via
 * mergeParams.
 */
router.use('/:connId/buckets/:bucket', bucketsRouter);

/**
 * Extra helper — list buckets in a connection. Not part of the per-bucket
 * Bucket Backend API; the standalone web UI uses it to populate the
 * bucket picker.
 */
router.get('/:connId/buckets', async (req, res) => {
  try {
    const resolved = await clientForConnection(req.params.connId!);
    if (!resolved) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    // If the connection is scoped to a single bucket, the key may not have
    // ListBuckets permission — surface just that bucket and skip the probe.
    if (resolved.conn.bucket) {
      res.json({ buckets: [{ name: resolved.conn.bucket, creationDate: null }] });
      return;
    }
    const out = await resolved.client.send(new ListBucketsCommand({}));
    const buckets = (out.Buckets ?? []).map((b) => ({
      name: b.Name ?? '',
      creationDate: b.CreationDate?.toISOString() ?? null,
    }));
    res.json({ buckets });
  } catch (error) {
    logger.error({ err: error }, 'Error listing buckets');
    res.status(502).json({ error: (error as Error).message });
  }
});

export default router;
