import { createS3Client, type S3Client } from '@garage/bucket-api-server';

import type { ResolvedBucketKey } from './garage-keys.js';

export function buildS3Client(resolved: ResolvedBucketKey): S3Client {
  return createS3Client({
    region: resolved.s3Region,
    endpoint: resolved.s3Endpoint,
    forcePathStyle: resolved.s3ForcePathStyle,
    credentials: {
      accessKeyId: resolved.accessKeyId,
      secretAccessKey: resolved.secretAccessKey,
    },
  });
}
