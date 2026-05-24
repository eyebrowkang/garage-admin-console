import { Router, type Router as ExpressRouter } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ListBucketsCommand } from '@aws-sdk/client-s3';

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
});

const UpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    endpoint: z.string().url().optional(),
    region: z.string().min(1).optional(),
    forcePathStyle: z.boolean().optional(),
    accessKeyId: z.string().min(1).optional(),
    secretAccessKey: z.string().min(1).optional(),
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
  createdAt: connections.createdAt,
  updatedAt: connections.updatedAt,
} as const;

function toApi<T extends { forcePathStyle: string }>(row: T) {
  return { ...row, forcePathStyle: row.forcePathStyle !== 'false' };
}

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
    const [row] = await db
      .insert(connections)
      .values({
        name: body.name,
        endpoint: body.endpoint,
        region: body.region,
        forcePathStyle: body.forcePathStyle ? 'true' : 'false',
        accessKeyId: encrypt(body.accessKeyId),
        secretAccessKey: encrypt(body.secretAccessKey),
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
 * Bucket Backend API (§2.4). Nested here so its routes share the same
 * authentication mount and `:connId`/`:bucket` params propagate via
 * mergeParams.
 */
router.use('/:connId/buckets/:bucket', bucketsRouter);

/**
 * Extra route — list buckets in a connection. NOT part of the §2.4 Bucket
 * Backend API contract; the standalone web UI uses it to populate the
 * bucket picker.
 */
router.get('/:connId/buckets', async (req, res) => {
  try {
    const resolved = await clientForConnection(req.params.connId!);
    if (!resolved) {
      res.status(404).json({ error: 'Connection not found' });
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
