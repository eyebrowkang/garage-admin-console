import express, { type Router } from 'express';
import {
  createBucketCorsCacheKey,
  createBucketRouter,
  readMultipartPolicyEnv,
  BucketAccessError,
} from '@garage/bucket-api-server';
import { getParam } from '@garage/server-config';

import { logger } from '../logger.js';
import { resolveBucketKey, getAuthorizedBucketKeys } from '../lib/garage-keys.js';
import { buildS3Client } from '../lib/s3-client.js';

const router: Router = express.Router({ mergeParams: true });

// Browser-direct (large-file) CORS: managed by default, scoped to the app origin.
// Operators can pin origins (S3_CORS_ALLOWED_ORIGINS) or opt out (S3_MANAGE_CORS=false).
const manageCors = process.env.S3_MANAGE_CORS !== 'false';
const corsAllowedOrigins =
  process.env.S3_CORS_ALLOWED_ORIGINS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

// Adaptive multipart part-size policy (tunable via S3_MULTIPART_*). Validated at
// startup; throws on bad config.
const multipartPolicy = readMultipartPolicyEnv();

// ---------------------------------------------------------------------------
// GET /keys — list keys authorized on this bucket.
// Uses the cluster admin token; no S3 access key required from the caller.
// ---------------------------------------------------------------------------
router.get('/keys', async (req, res) => {
  const clusterId = getParam(req.params, 'clusterId');
  const bucket = getParam(req.params, 'bucket');
  if (!clusterId || !bucket) {
    res.status(400).json({ error: 'Missing clusterId or bucket' });
    return;
  }
  try {
    const keys = await getAuthorizedBucketKeys(clusterId, bucket);
    res.json({ keys });
  } catch (err) {
    if (err instanceof BucketAccessError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    logger.error({ err, clusterId, bucket }, 'failed to fetch authorized bucket keys');
    res.status(502).json({ error: 'Failed to fetch bucket keys' });
  }
});

// ---------------------------------------------------------------------------
// Standard Bucket Backend API routes.
// All require X-Garage-Access-Key-Id — the host UI selects the key via the
// default-key fallback chain and injects it as a request header.
// ---------------------------------------------------------------------------
router.use(
  createBucketRouter({
    async resolveContext(req) {
      const clusterId = getParam(req.params, 'clusterId');
      const bucket = getParam(req.params, 'bucket');

      const accessKeyId = req.headers['x-garage-access-key-id'];
      if (!accessKeyId || typeof accessKeyId !== 'string') {
        throw new BucketAccessError(400, 'Missing access key selection');
      }

      if (!clusterId || !bucket) {
        throw new BucketAccessError(400, 'Missing clusterId or bucket');
      }

      try {
        const key = await resolveBucketKey(clusterId, accessKeyId);
        return {
          client: buildS3Client(key),
          bucketName: bucket,
          cacheKey: createBucketCorsCacheKey(
            'garage-admin',
            clusterId,
            key.s3Endpoint,
            key.s3Region,
            key.s3ForcePathStyle,
            key.accessKeyId,
            bucket,
          ),
        };
      } catch (err) {
        if (err instanceof BucketAccessError) throw err;
        logger.error({ err, clusterId, bucket, accessKeyId }, 'failed to resolve bucket key');
        throw new BucketAccessError(502, 'Failed to resolve bucket credentials');
      }
    },
    manageCors,
    corsAllowedOrigins,
    ...multipartPolicy,
    logger,
  }),
);

export default router;
