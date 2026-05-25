import { Router, type Router as ExpressRouter } from 'express';
import { eq } from 'drizzle-orm';
import db from '../db/index.js';
import { clusters } from '../db/schema.js';
import { encrypt } from '../encryption.js';
import { z } from 'zod';
import { logger } from '../logger.js';

const router: ExpressRouter = Router();

// Validation schemas
const CreateClusterSchema = z.object({
  name: z.string().min(1),
  endpoint: z.string().url(),
  adminToken: z.string().min(1),
  metricToken: z.string().min(1).nullable().optional(),
  // S3-protocol surface for the embedded FileBrowser. Optional because most
  // existing Admin Console workflows don't need it; if missing the bucket
  // browser surfaces a graceful "not configured" message.
  s3Endpoint: z.string().url().nullable().optional(),
  s3Region: z.string().min(1).nullable().optional(),
  s3ForcePathStyle: z.boolean().nullable().optional(),
});

const UpdateClusterSchema = z
  .object({
    name: z.string().min(1).optional(),
    endpoint: z.string().url().optional(),
    adminToken: z.string().min(1).optional(),
    metricToken: z.string().min(1).nullable().optional(),
    s3Endpoint: z.string().url().nullable().optional(),
    s3Region: z.string().min(1).nullable().optional(),
    s3ForcePathStyle: z.boolean().nullable().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

// Safe fields to return (no tokens)
const safeColumns = {
  id: clusters.id,
  name: clusters.name,
  endpoint: clusters.endpoint,
  s3Endpoint: clusters.s3Endpoint,
  s3Region: clusters.s3Region,
  s3ForcePathStyle: clusters.s3ForcePathStyle,
  createdAt: clusters.createdAt,
  updatedAt: clusters.updatedAt,
} as const;

// GET /clusters
router.get('/', async (req, res) => {
  try {
    const result = await db.select(safeColumns).from(clusters);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching clusters');
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /clusters
router.post('/', async (req, res) => {
  try {
    const body = CreateClusterSchema.parse(req.body);

    // Encrypt tokens
    const encryptedAdminToken = encrypt(body.adminToken);
    const encryptedMetricToken =
      body.metricToken === undefined || body.metricToken === null
        ? null
        : encrypt(body.metricToken);

    const [cluster] = await db
      .insert(clusters)
      .values({
        name: body.name,
        endpoint: body.endpoint,
        adminToken: encryptedAdminToken,
        metricToken: encryptedMetricToken,
        s3Endpoint: body.s3Endpoint ?? null,
        s3Region: body.s3Region ?? null,
        s3ForcePathStyle:
          body.s3ForcePathStyle === undefined || body.s3ForcePathStyle === null
            ? null
            : body.s3ForcePathStyle
              ? 'true'
              : 'false',
      })
      .returning(safeColumns);

    res.status(201).json(cluster);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      logger.error({ err: error }, 'Error creating cluster');
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});

// PUT /clusters/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = UpdateClusterSchema.parse(req.body);

    const data: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.name !== undefined) data.name = body.name;
    if (body.endpoint !== undefined) data.endpoint = body.endpoint;
    if (body.adminToken !== undefined) data.adminToken = encrypt(body.adminToken);
    if (body.metricToken !== undefined) {
      data.metricToken = body.metricToken === null ? null : encrypt(body.metricToken);
    }
    if (body.s3Endpoint !== undefined) data.s3Endpoint = body.s3Endpoint;
    if (body.s3Region !== undefined) data.s3Region = body.s3Region;
    if (body.s3ForcePathStyle !== undefined) {
      data.s3ForcePathStyle =
        body.s3ForcePathStyle === null ? null : body.s3ForcePathStyle ? 'true' : 'false';
    }

    const [cluster] = await db
      .update(clusters)
      .set(data)
      .where(eq(clusters.id, id))
      .returning(safeColumns);

    if (!cluster) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }

    res.json(cluster);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else {
      logger.error({ err: error }, 'Error updating cluster');
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});

// DELETE /clusters/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await db
      .delete(clusters)
      .where(eq(clusters.id, id))
      .returning({ id: clusters.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, 'Error deleting cluster');
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
