import {
  createBucketCorsCacheKey,
  createBucketRouter,
  BucketAccessError,
} from '@garage/bucket-api-server';
import { getParam } from '@garage/server-config';

import { logger } from '../logger.js';
import { clientForConnection } from '../lib/s3-client.js';

// Browser-direct (large-file) CORS: managed by default, scoped to the app origin.
// Operators can pin origins (S3_CORS_ALLOWED_ORIGINS) or opt out (S3_MANAGE_CORS=false).
const manageCors = process.env.S3_MANAGE_CORS !== 'false';
const corsAllowedOrigins =
  process.env.S3_CORS_ALLOWED_ORIGINS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

export default createBucketRouter({
  async resolveContext(req) {
    const connId = getParam(req.params, 'connId');
    const bucket = getParam(req.params, 'bucket');
    if (!connId || !bucket) {
      throw new BucketAccessError(400, 'Missing connId or bucket');
    }
    const resolved = await clientForConnection(connId);
    if (!resolved) throw new BucketAccessError(404, 'Connection not found');
    return {
      client: resolved.client,
      bucketName: bucket,
      cacheKey: createBucketCorsCacheKey(
        's3-browser',
        resolved.conn.id,
        resolved.conn.endpoint,
        resolved.conn.region,
        resolved.conn.forcePathStyle,
        resolved.conn.accessKeyId,
        bucket,
      ),
    };
  },
  manageCors,
  corsAllowedOrigins,
  logger,
});
