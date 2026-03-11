import { Router, type Request, type Response, type Router as ExpressRouter } from 'express';
import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

const router: ExpressRouter = Router();

/**
 * Proxy /s3-api/* → S3 Browser API.
 *
 * In development, the Vite dev proxy handles this. In production, this Express
 * route ensures the embedded ObjectBrowser can reach the S3 Browser API via
 * same-origin requests, avoiding CORS issues.
 *
 * The caller provides the S3 Browser JWT token in the Authorization header
 * (obtained from the s3-bridge connect flow).
 */
router.all('/*splat', async (req: Request, res: Response) => {
  if (!env.s3BrowserApiUrl) {
    return res.status(503).json({ error: 'S3 Browser integration not configured' });
  }

  const splat = req.params.splat;
  const pathPart = Array.isArray(splat) ? splat.join('/') : (splat ?? '');
  const targetUrl = `${env.s3BrowserApiUrl}/${pathPart}`;

  try {
    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: {
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
        ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {}),
      },
      data: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      params: req.query,
      timeout: 30000,
      validateStatus: () => true,
      // Stream response for downloads
      responseType: 'arraybuffer',
    });

    const passthroughHeaders = [
      'content-type',
      'content-disposition',
      'content-length',
      'cache-control',
      'etag',
    ];
    for (const header of passthroughHeaders) {
      const value = response.headers[header];
      if (value) {
        res.setHeader(header, value);
      }
    }
    res.status(response.status).send(response.data);
  } catch (error: unknown) {
    logger.error({ err: error }, 'S3 API proxy error');
    res.status(502).json({ error: 'S3 Browser API unreachable' });
  }
});

export default router;
