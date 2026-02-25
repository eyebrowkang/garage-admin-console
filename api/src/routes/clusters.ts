import { Router, type Router as ExpressRouter } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db.js';
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
});

const UpdateClusterSchema = z
  .object({
    name: z.string().min(1).optional(),
    endpoint: z.string().url().optional(),
    adminToken: z.string().min(1).optional(),
    metricToken: z.string().min(1).nullable().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

// Safe fields to return (no tokens)
const safeSelect = {
  id: true,
  name: true,
  endpoint: true,
  createdAt: true,
  updatedAt: true,
} as const;

function isNotFoundError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2025';
  }

  if (typeof error === 'object' && error !== null && 'code' in error) {
    return error.code === 'P2025';
  }

  return false;
}

// GET /clusters
router.get('/', async (req, res) => {
  try {
    const clusters = await prisma.cluster.findMany({
      select: safeSelect,
    });
    res.json(clusters);
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

    const cluster = await prisma.cluster.create({
      data: {
        name: body.name,
        endpoint: body.endpoint,
        adminToken: encryptedAdminToken,
        metricToken: encryptedMetricToken,
      },
      select: safeSelect,
    });

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

    const data: Record<string, unknown> = {};

    if (body.name !== undefined) data.name = body.name;
    if (body.endpoint !== undefined) data.endpoint = body.endpoint;
    if (body.adminToken !== undefined) data.adminToken = encrypt(body.adminToken);
    if (body.metricToken !== undefined) {
      data.metricToken = body.metricToken === null ? null : encrypt(body.metricToken);
    }

    const cluster = await prisma.cluster.update({
      where: { id },
      data,
      select: safeSelect,
    });

    res.json(cluster);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
    } else if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Cluster not found' });
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
    await prisma.cluster.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    if (isNotFoundError(error)) {
      res.status(404).json({ error: 'Cluster not found' });
    } else {
      logger.error({ err: error }, 'Error deleting cluster');
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});

export default router;
