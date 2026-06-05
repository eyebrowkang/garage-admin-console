import { createHash } from 'node:crypto';
import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';

export type { S3Client } from '@aws-sdk/client-s3';

export interface S3ClientCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface S3ClientOptions {
  region: string;
  endpoint: string;
  forcePathStyle: boolean;
  credentials: S3ClientCredentials;
}

export function createS3Client({
  region,
  endpoint,
  forcePathStyle,
  credentials,
}: S3ClientOptions): S3Client {
  const config: S3ClientConfig = {
    region,
    endpoint,
    forcePathStyle,
    credentials,
    // AWS SDK v3 defaults to adding a CRC32 checksum on uploads. Keep this
    // opt-in for S3-compatible endpoints; the upload route already provides
    // a concrete ContentLength so AWS S3 doesn't need chunked checksum mode.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  };

  return new S3Client(config);
}

// ---------------------------------------------------------------------------
// Cached variant
//
// An S3Client owns a keep-alive HTTP agent and is designed to be long-lived.
// Building a fresh one per request (the old behaviour) meant no connection
// reuse and a steady churn of lingering sockets. getCachedS3Client memoizes by
// a hash of the full connection identity — endpoint, region, path-style and
// credentials — so rotated credentials transparently yield a fresh client and
// the stale one is evicted (and destroyed) on its next lookup past the TTL.
// ---------------------------------------------------------------------------

const CLIENT_TTL_MS = 10 * 60 * 1000;

interface CachedClient {
  client: S3Client;
  expiresAt: number;
}

const clientCache = new Map<string, CachedClient>();

function clientCacheKey(o: S3ClientOptions): string {
  return createHash('sha256')
    .update(
      [
        o.endpoint,
        o.region,
        String(o.forcePathStyle),
        o.credentials.accessKeyId,
        o.credentials.secretAccessKey,
      ].join('\n'),
    )
    .digest('hex');
}

export function getCachedS3Client(options: S3ClientOptions): S3Client {
  const key = clientCacheKey(options);
  const now = Date.now();
  const hit = clientCache.get(key);
  if (hit && hit.expiresAt > now) {
    hit.expiresAt = now + CLIENT_TTL_MS; // sliding window keeps active clients warm
    return hit.client;
  }
  if (hit) hit.client.destroy();
  const client = createS3Client(options);
  clientCache.set(key, { client, expiresAt: now + CLIENT_TTL_MS });
  return client;
}

/** Test hook: destroy and clear all cached clients. Not part of the public API. */
export function _resetS3ClientCacheForTests(): void {
  for (const { client } of clientCache.values()) client.destroy();
  clientCache.clear();
}
