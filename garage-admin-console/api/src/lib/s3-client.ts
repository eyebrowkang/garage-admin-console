/**
 * Build an @aws-sdk/client-s3 client from a ResolvedBucketKey (lib/garage-keys).
 * Mirrors s3-browser/api/src/lib/s3-client.ts so the two BFFs have the same
 * SDK quirks (e.g. checksum-mode override needed for streamed uploads).
 */
import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';

import type { ResolvedBucketKey } from './garage-keys.js';

export function buildS3Client(resolved: ResolvedBucketKey): S3Client {
  const config: S3ClientConfig = {
    region: resolved.s3Region,
    endpoint: resolved.s3Endpoint,
    forcePathStyle: resolved.s3ForcePathStyle,
    credentials: {
      accessKeyId: resolved.accessKeyId,
      secretAccessKey: resolved.secretAccessKey,
    },
    // AWS SDK v3 defaults to adding a CRC32 checksum on uploads. Keep this
    // opt-in for S3-compatible endpoints; the upload route already provides
    // a concrete ContentLength so AWS S3 doesn't need chunked checksum mode.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  };
  return new S3Client(config);
}
