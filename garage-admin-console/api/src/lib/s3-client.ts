import { getCachedS3Client, readChecksumMode, type S3Client } from '@garage/bucket-api-server';

import type { ResolvedBucketKey } from './garage-keys.js';

// Operator-tunable S3 checksum behavior (default WHEN_REQUIRED). Validated at
// startup; throws on a bad value.
const checksumMode = readChecksumMode();

export function buildS3Client(resolved: ResolvedBucketKey): S3Client {
  return getCachedS3Client({
    region: resolved.s3Region,
    endpoint: resolved.s3Endpoint,
    forcePathStyle: resolved.s3ForcePathStyle,
    credentials: {
      accessKeyId: resolved.accessKeyId,
      secretAccessKey: resolved.secretAccessKey,
    },
    checksumMode,
  });
}
