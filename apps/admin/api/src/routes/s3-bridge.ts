import { Router, type Router as ExpressRouter } from 'express';
import axios from 'axios';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import db from '../db/index.js';
import { clusters } from '../db/schema.js';
import { decrypt } from '../encryption.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

const router: ExpressRouter = Router();

const connectSchema = z.object({
  bucketId: z.string().min(1),
  accessKeyId: z.string().min(1),
  s3Endpoint: z.string().url().optional(),
});

/**
 * Derive a Garage S3 API endpoint from the admin API endpoint.
 * Garage default ports: S3=3900, Admin=3903.
 */
function deriveS3Endpoint(adminEndpoint: string): string {
  try {
    const url = new URL(adminEndpoint);
    url.port = '3900';
    return url.toString().replace(/\/$/, '');
  } catch {
    return adminEndpoint.replace(/:(\d+)/, ':3900');
  }
}

/**
 * POST /:clusterId/connect
 *
 * Creates or reuses an S3 Browser connection for a bucket, enabling the
 * embedded ObjectBrowser to work seamlessly from the admin console.
 *
 * Flow:
 * 1. Get cluster info from admin DB
 * 2. Get access key secret via Garage Admin API (GetKeyInfo?showSecretKey=true)
 * 3. Get bucket alias via Garage Admin API (GetBucketInfo)
 * 4. Login to S3 Browser API + create/reuse connection
 * 5. Return { connectionId, token, apiBase, bucketName }
 */
router.post('/:clusterId/connect', async (req, res) => {
  try {
    // Validate S3 Browser configuration
    if (!env.s3BrowserApiUrl) {
      return res.status(503).json({
        error:
          'S3 Browser integration not configured. Set S3_BROWSER_API_URL and S3_BROWSER_ADMIN_PASSWORD environment variables.',
      });
    }

    const s3BrowserPassword = env.s3BrowserAdminPassword || env.adminPassword;

    const { clusterId } = req.params;
    const body = connectSchema.parse(req.body);

    // 1. Get cluster from DB
    const [cluster] = await db.select().from(clusters).where(eq(clusters.id, clusterId));
    if (!cluster) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    const adminToken = decrypt(cluster.adminToken);
    const garageApi = axios.create({
      baseURL: cluster.endpoint,
      headers: { Authorization: `Bearer ${adminToken}` },
      timeout: 15000,
    });

    // 2. Get bucket info for alias name
    const bucketRes = await garageApi.get(
      `/v2/GetBucketInfo?id=${encodeURIComponent(body.bucketId)}`,
    );
    const bucketInfo = bucketRes.data;
    const bucketName = bucketInfo.globalAliases?.[0] || body.bucketId;

    // 3. Get key secret
    const keyRes = await garageApi.get(
      `/v2/GetKeyInfo?id=${encodeURIComponent(body.accessKeyId)}&showSecretKey=true`,
    );
    const keyInfo = keyRes.data;
    const secretAccessKey = keyInfo.secretAccessKey;

    if (!secretAccessKey) {
      return res.status(400).json({
        error: 'Could not retrieve secret key. The key may not exist.',
      });
    }

    // 4. Derive or use provided S3 endpoint
    const s3Endpoint = body.s3Endpoint || deriveS3Endpoint(cluster.endpoint);

    // 5. Login to S3 Browser API
    let s3Token: string;
    try {
      const loginRes = await axios.post(`${env.s3BrowserApiUrl}/auth/login`, {
        password: s3BrowserPassword,
      });
      s3Token = loginRes.data.token;
    } catch (err: unknown) {
      const status =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined;

      logger.error({ err, status }, 'Failed to login to S3 Browser API');
      return res.status(502).json({
        error:
          status === 401 || status === 403
            ? 'Failed to authenticate with S3 Browser API'
            : 'Cannot connect to S3 Browser API',
      });
    }

    const s3BrowserClient = axios.create({
      baseURL: env.s3BrowserApiUrl,
      headers: { Authorization: `Bearer ${s3Token}` },
      timeout: 10000,
    });

    // 6. Find or create connection
    const connectionName = `admin-bridge:${clusterId}:${body.bucketId}:${body.accessKeyId}`;
    const connectionsRes = await s3BrowserClient.get('/connections');
    const existing = connectionsRes.data.find(
      (c: { name: string; id: string }) => c.name === connectionName,
    );

    let connectionId: string;
    const connectionPayload = {
      name: connectionName,
      endpoint: s3Endpoint,
      accessKeyId: body.accessKeyId,
      secretAccessKey,
      region: 'garage',
      bucket: bucketName,
      pathStyle: true,
    };

    if (existing) {
      await s3BrowserClient.put(`/connections/${existing.id}`, connectionPayload);
      connectionId = existing.id;
    } else {
      const createRes = await s3BrowserClient.post('/connections', connectionPayload);
      connectionId = createRes.data.id;
    }

    res.json({
      connectionId,
      token: s3Token,
      apiBase: env.s3BrowserApiUrl,
      bucketName,
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: err.issues });
    }

    const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
    if (axiosErr.response) {
      const status = axiosErr.response.status || 500;
      const message = axiosErr.response.data?.error || 'Upstream request failed';
      logger.error({ err, status }, 'S3 bridge upstream error');
      return res.status(status >= 400 && status < 600 ? status : 502).json({ error: message });
    }

    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'S3 bridge error');
    res.status(500).json({ error: message });
  }
});

export default router;
