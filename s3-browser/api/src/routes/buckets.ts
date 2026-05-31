import { createBucketRouter, BucketAccessError } from '@garage/bucket-api-server';
import { getParam } from '@garage/server-config';

import { logger } from '../logger.js';
import { clientForConnection } from '../lib/s3-client.js';

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
      cacheKey: `${connId}:${bucket}`,
    };
  },
  logger,
});
