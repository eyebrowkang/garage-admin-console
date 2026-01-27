import { Router } from 'express';
import prisma from '../db.js';
import { encrypt } from '../encryption.js';
import { z } from 'zod';

const router = Router();

// Validation schemas
const CreateClusterSchema = z.object({
    name: z.string().min(1),
    endpoint: z.string().url(),
    region: z.string().optional(),
    adminToken: z.string().min(1),
});

// GET /clusters
router.get('/', async (req, res) => {
    try {
        const clusters = await prisma.cluster.findMany({
            select: {
                id: true,
                name: true,
                endpoint: true,
                region: true,
                // Do not return adminToken
                createdAt: true,
                updatedAt: true,
            }
        });
        res.json(clusters);
    } catch (error) {
        console.error("Error fetching clusters:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// POST /clusters
router.post('/', async (req, res) => {
    try {
        const body = CreateClusterSchema.parse(req.body);

        // Encrypt token
        const encryptedToken = encrypt(body.adminToken);

        const cluster = await prisma.cluster.create({
            data: {
                name: body.name,
                endpoint: body.endpoint,
                region: body.region ?? null,
                adminToken: encryptedToken,
            },
            select: {
                id: true,
                name: true,
                endpoint: true,
                region: true,
                createdAt: true,
            }
        });

        res.status(201).json(cluster);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: error.issues });
        } else {
            console.error("Error creating cluster:", error);
            res.status(500).json({ error: "Internal Server Error" });
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
        console.error("Error deleting cluster:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;
