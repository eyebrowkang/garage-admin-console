import { Router, type Router as ExpressRouter } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import db from '../db/index.js';
import { connections } from '../db/schema.js';
import { encrypt, decrypt } from '../encryption.js';

const router: ExpressRouter = Router();

// Fields safe to return (no secrets)
const safeColumns = {
  id: connections.id,
  name: connections.name,
  endpoint: connections.endpoint,
  region: connections.region,
  bucket: connections.bucket,
  pathStyle: connections.pathStyle,
  createdAt: connections.createdAt,
  updatedAt: connections.updatedAt,
} as const;

const CreateConnectionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  endpoint: z.string().url('Endpoint must be a valid URL'),
  region: z.string().optional(),
  accessKeyId: z.string().min(1, 'Access Key ID is required'),
  secretAccessKey: z.string().min(1, 'Secret Access Key is required'),
  bucket: z.string().optional(),
  pathStyle: z.boolean().optional().default(true),
});

const UpdateConnectionSchema = z
  .object({
    name: z.string().min(1).optional(),
    endpoint: z.string().url().optional(),
    region: z.string().nullable().optional(),
    accessKeyId: z.string().min(1).optional(),
    secretAccessKey: z.string().min(1).optional(),
    bucket: z.string().nullable().optional(),
    pathStyle: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

// GET /api/connections — List all connections (safe columns only)
router.get('/', async (_req, res) => {
  try {
    const rows = await db.select(safeColumns).from(connections);
    res.json(rows);
  } catch (error) {
    console.error('Failed to list connections:', error);
    res.status(500).json({ error: 'Failed to list connections' });
  }
});

// GET /api/connections/:id — Get a single connection
router.get('/:id', async (req, res) => {
  try {
    const [row] = await db.select(safeColumns).from(connections).where(eq(connections.id, req.params.id));
    if (!row) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    res.json(row);
  } catch (error) {
    console.error('Failed to get connection:', error);
    res.status(500).json({ error: 'Failed to get connection' });
  }
});

// POST /api/connections — Create a new connection
router.post('/', async (req, res) => {
  try {
    const data = CreateConnectionSchema.parse(req.body);

    const [created] = await db
      .insert(connections)
      .values({
        name: data.name,
        endpoint: data.endpoint,
        region: data.region ?? null,
        accessKeyId: encrypt(data.accessKeyId),
        secretAccessKey: encrypt(data.secretAccessKey),
        bucket: data.bucket ?? null,
        pathStyle: data.pathStyle,
      })
      .returning(safeColumns);

    res.status(201).json(created);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.issues });
    }
    console.error('Failed to create connection:', error);
    res.status(500).json({ error: 'Failed to create connection' });
  }
});

// PUT /api/connections/:id — Update a connection
router.put('/:id', async (req, res) => {
  try {
    const data = UpdateConnectionSchema.parse(req.body);

    // Check connection exists
    const [existing] = await db
      .select({ id: connections.id })
      .from(connections)
      .where(eq(connections.id, req.params.id));
    if (!existing) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.endpoint !== undefined) updateData.endpoint = data.endpoint;
    if (data.region !== undefined) updateData.region = data.region;
    if (data.accessKeyId !== undefined) updateData.accessKeyId = encrypt(data.accessKeyId);
    if (data.secretAccessKey !== undefined) updateData.secretAccessKey = encrypt(data.secretAccessKey);
    if (data.bucket !== undefined) updateData.bucket = data.bucket;
    if (data.pathStyle !== undefined) updateData.pathStyle = data.pathStyle;

    const [updated] = await db
      .update(connections)
      .set(updateData)
      .where(eq(connections.id, req.params.id))
      .returning(safeColumns);

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.issues });
    }
    console.error('Failed to update connection:', error);
    res.status(500).json({ error: 'Failed to update connection' });
  }
});

// DELETE /api/connections/:id — Delete a connection
router.delete('/:id', async (req, res) => {
  try {
    const [deleted] = await db
      .delete(connections)
      .where(eq(connections.id, req.params.id))
      .returning({ id: connections.id });

    if (!deleted) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete connection:', error);
    res.status(500).json({ error: 'Failed to delete connection' });
  }
});

// Internal helper: get connection with decrypted credentials (used by S3 routes)
export async function getConnectionWithCredentials(connectionId: string) {
  const [row] = await db.select().from(connections).where(eq(connections.id, connectionId));
  if (!row) return null;
  return {
    ...row,
    accessKeyId: decrypt(row.accessKeyId),
    secretAccessKey: decrypt(row.secretAccessKey),
  };
}

export default router;
