import { createHash } from 'node:crypto';
import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';

import { createTtlSweeper } from './ttl-sweep.js';

export type { S3Client } from '@aws-sdk/client-s3';

export interface S3ClientCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * S3 request/response checksum behavior. 'when_required' (default) is safe for
 * every S3-compatible endpoint including Garage (which doesn't advertise
 * x-amz-checksum, so the SDK's CRC32 default would break direct-to-Garage
 * presigned PUTs); 'when_supported' opts CRC32 in on every op for fully
 * checksum-capable endpoints. Operator-tunable via S3_CHECKSUM_MODE.
 */
export type ChecksumMode = 'when_required' | 'when_supported';

export interface S3ClientOptions {
  region: string;
  endpoint: string;
  forcePathStyle: boolean;
  credentials: S3ClientCredentials;
  checksumMode?: ChecksumMode;
}

export function createS3Client({
  region,
  endpoint,
  forcePathStyle,
  credentials,
  checksumMode = 'when_required',
}: S3ClientOptions): S3Client {
  // AWS SDK v3 defaults to adding a CRC32 checksum on uploads. WHEN_REQUIRED
  // keeps it opt-in for S3-compatible endpoints (the upload route already sends a
  // concrete ContentLength, so AWS S3 doesn't need chunked checksum mode); an
  // operator on a fully checksum-capable endpoint can opt in via 'when_supported'.
  const checksum = checksumMode === 'when_supported' ? 'WHEN_SUPPORTED' : 'WHEN_REQUIRED';
  const config: S3ClientConfig = {
    region,
    endpoint,
    forcePathStyle,
    credentials,
    requestChecksumCalculation: checksum,
    responseChecksumValidation: checksum,
  };

  return new S3Client(config);
}

/**
 * Parse the operator's S3_CHECKSUM_MODE (default 'when_required'). Throws on an
 * unknown value so the BFF fails fast at startup. Shared so both BFFs read it the
 * same way; feed the result into createS3Client / getCachedS3Client.
 */
export function readChecksumMode(
  source: Record<string, string | undefined> = process.env,
): ChecksumMode {
  const raw = source.S3_CHECKSUM_MODE?.trim().toLowerCase();
  if (!raw || raw === 'when_required') return 'when_required';
  if (raw === 'when_supported') return 'when_supported';
  throw new Error("S3_CHECKSUM_MODE must be 'when_required' (default) or 'when_supported'.");
}

// ---------------------------------------------------------------------------
// Cached variant
//
// An S3Client owns a keep-alive HTTP agent and is designed to be long-lived.
// Building a fresh one per request (the old behaviour) meant no connection
// reuse and a steady churn of lingering sockets. getCachedS3Client memoizes by
// a hash of the full connection identity — endpoint, region, path-style and
// credentials — so rotated credentials transparently yield a fresh client.
//
// Eviction (on-access past the TTL, or by the idle sweeper below) only DROPS
// the cache's reference to a client — it never calls S3Client.destroy(). A
// proxied /download or /upload borrows the client for the whole life of the
// stream without re-looking it up, so the sliding TTL can lapse mid-transfer;
// destroying the client then would tear down the in-use keep-alive socket and
// abort a perfectly healthy request. Dropping the reference is safe: the
// in-flight request keeps the client alive through its own closure until the
// stream finishes, after which the unreferenced client is GC'd. Its keep-alive
// sockets are unref'd (they never hold the event loop open) and are reaped by
// the upstream's keep-alive timeout, so nothing leaks.
// ---------------------------------------------------------------------------

const CLIENT_TTL_MS = 10 * 60 * 1000;

interface CachedClient {
  client: S3Client;
  expiresAt: number;
}

const clientCache = new Map<string, CachedClient>();

// Bound the cache: drop entries for connections that are never looked up again
// (e.g. a one-off bucket) so the map can't grow without bound. The sweeper only
// removes map entries — it deliberately does NOT destroy the clients (see the
// note above; they may still be mid-stream). Timer is unref'd and self-stops
// when the cache empties.
const CLIENT_SWEEP_INTERVAL_MS = 60 * 1000;
const sweeper = createTtlSweeper(clientCache, (entry, now) => entry.expiresAt <= now, {
  intervalMs: CLIENT_SWEEP_INTERVAL_MS,
});

function clientCacheKey(o: S3ClientOptions): string {
  return createHash('sha256')
    .update(
      [
        o.endpoint,
        o.region,
        String(o.forcePathStyle),
        o.credentials.accessKeyId,
        o.credentials.secretAccessKey,
        o.checksumMode ?? 'when_required',
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
  // Past the TTL we mint a fresh client; the set() below overwrites the entry,
  // dropping the cache's reference to any stale one without destroying it (it
  // may still be streaming — see the note above). GC reclaims it once no
  // in-flight request holds it.
  const client = createS3Client(options);
  clientCache.set(key, { client, expiresAt: now + CLIENT_TTL_MS });
  sweeper.ensure();
  return client;
}

/** Test hook: destroy and clear all cached clients. Not part of the public API. */
export function _resetS3ClientCacheForTests(): void {
  for (const { client } of clientCache.values()) client.destroy();
  clientCache.clear();
  sweeper.stop();
}

/** Test hook: run one idle-sweep synchronously. Not part of the public API. */
export function _sweepS3ClientCacheForTests(): void {
  sweeper.sweep();
}
