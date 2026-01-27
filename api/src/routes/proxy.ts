import { Router, type Request, type Response } from 'express';
import prisma from '../db.js';
import { decrypt } from '../encryption.js';
import axios from 'axios';

const router = Router();

// Proxy middleware to forward to Garage
// Path format: /proxy/:clusterId/path/to/resource
// Example: /proxy/123-uuid/v2/GetClusterStatus
router.all('/:clusterId/*', async (req: Request, res: Response) => {
    const { clusterId } = req.params;
    // Capture the path after clusterId. 
    // req.originalUrl might be /proxy/UUID/v2/GetClusterStatus
    // We want /v2/GetClusterStatus
    // But we mounted at /proxy.

    // A safer way:
    const pathPart = req.params[0]; // Captured by *

    try {
        const cluster = await prisma.cluster.findUnique({
            where: { id: clusterId as string },
        });

        if (!cluster) {
            return res.status(404).json({ error: 'Cluster not found' });
        }

        const token = decrypt(cluster.adminToken);
        const targetUrl = `${cluster.endpoint}/${pathPart}`;
        const contentType = req.header('Content-Type');

        // Forward request
        const response = await axios({
            method: req.method,
            url: targetUrl,
            headers: {
                'Authorization': `Bearer ${token}`,
                ...(contentType ? { 'Content-Type': contentType } : {}),
            },
            data: req.body,
            params: req.query,
            validateStatus: () => true, // Pass all statuses back
        });

        res.status(response.status).json(response.data);
    } catch (error: any) {
        console.error("Proxy error:", error.message);
        res.status(502).json({ error: 'Bad Gateway', details: error.message });
    }
});

export default router;
