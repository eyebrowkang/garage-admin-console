import { Router } from 'express';
import prisma from '../db.js';
import { decrypt } from '../encryption.js';
import axios from 'axios';
const router = Router();
// Proxy middleware to forward to Garage
// Path format: /proxy/:clusterId/path/to/resource
// Example: /proxy/123-uuid/v2/GetClusterStatus
// Express 5 wildcard syntax
router.all('/:clusterId/*splat', async (req, res) => {
    const { clusterId, splat } = req.params;
    // Capture the path after clusterId. 
    // splat might be an array in Express 5
    const pathPart = Array.isArray(splat) ? splat.join('/') : splat;
    try {
        const cluster = await prisma.cluster.findUnique({
            where: { id: clusterId },
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
    }
    catch (error) {
        console.error("Proxy error:", error.message);
        res.status(502).json({ error: 'Bad Gateway', details: error.message });
    }
});
export default router;
//# sourceMappingURL=proxy.js.map