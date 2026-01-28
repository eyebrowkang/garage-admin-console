import { Router, type Request, type Response } from 'express';
import prisma from '../db.js';
import { decrypt } from '../encryption.js';
import axios from 'axios';

const router = Router();

// Proxy middleware to forward to Garage
// Path format: /proxy/:clusterId/path/to/resource
// Example: /proxy/123-uuid/v2/GetClusterStatus
// Express 5 wildcard syntax
router.all('/:clusterId/*splat', async (req: Request, res: Response) => {
  const { clusterId, splat } = req.params;

  // Capture the path after clusterId.
  // splat might be an array in Express 5
  const pathPart = Array.isArray(splat) ? splat.join('/') : splat;

  try {
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId as string },
    });

    if (!cluster) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    // Use metricToken for metrics endpoint if available, otherwise fall back to adminToken
    const token =
      pathPart === 'metrics' && cluster.metricToken
        ? decrypt(cluster.metricToken)
        : decrypt(cluster.adminToken);

    const baseUrl = cluster.endpoint.replace(/\/+$/, '');
    const pathSuffix = pathPart ? `/${pathPart}` : '';
    const targetUrl = `${baseUrl}${pathSuffix}`;
    const contentType = req.header('Content-Type');
    const accept = req.header('Accept');

    // Forward request
    console.log(`[Proxy] ${req.method} ${targetUrl}`);
    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(contentType ? { 'Content-Type': contentType } : {}),
        ...(accept ? { Accept: accept } : {}),
      },
      data: Object.keys(req.body || {}).length > 0 ? req.body : undefined, // Only send body if present
      params: req.query,
      validateStatus: () => true, // Pass all statuses back
    });

    console.log(`[Proxy] Response: ${response.status}`);
    const responseContentType = response.headers['content-type'];
    if (responseContentType) {
      res.setHeader('Content-Type', responseContentType);
    }
    res.status(response.status).send(response.data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Proxy error:', message);
    res.status(502).json({ error: 'Bad Gateway', details: message });
  }
});

export default router;
