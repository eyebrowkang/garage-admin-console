import { createBucketRouter, BucketAccessError } from '@garage/bucket-api-server';

import { logger } from '../logger.js';
import { resolveBucketKey } from '../lib/garage-keys.js';
import { buildS3Client } from '../lib/s3-client.js';

function getParam(params: Record<string, string | string[] | undefined>, name: string): string {
  const val = params[name];
  if (Array.isArray(val)) return val[0] ?? '';
  return val ?? '';
}

export default createBucketRouter({
  async resolveContext(req) {
    const clusterId = getParam(req.params, 'clusterId');
    const bucket = getParam(req.params, 'bucket');
    if (!clusterId || !bucket) {
      throw new BucketAccessError(400, 'Missing clusterId or bucket');
    }
    try {
      const key = await resolveBucketKey(clusterId, bucket);
      return { client: buildS3Client(key), bucketName: bucket };
    } catch (err) {
      if (err instanceof BucketAccessError) throw err;
      logger.error({ err, clusterId, bucket }, 'failed to resolve bucket key');
      throw new BucketAccessError(502, 'Failed to mint bucket key');
    }
  },
  logger,
});
