/**
 * Garage per-bucket S3 credential resolver.
 *
 * Embedded-mode strategy:
 *   1. The host UI picks an access key (from the default-key fallback chain)
 *      and forwards it via the X-Garage-Access-Key-Id request header.
 *   2. The BFF calls Garage GetKeyInfo?showSecretKey=true to retrieve the
 *      secret on-demand — no secrets are ever stored in the local DB.
 *   3. Resolved credentials are cached by (clusterId, accessKeyId) with a
 *      10-minute TTL so repeated FileBrowser calls hit the cache, not Garage.
 *
 * Log-safety contract: this module NEVER logs a secretAccessKey value.
 * All error paths explicitly redact secret fields before forwarding to pino.
 */
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { eq } from 'drizzle-orm';

import db from '../db/index.js';
import { clusters } from '../db/schema.js';
import { decrypt } from '../encryption.js';
import { logger } from '../logger.js';
import { BucketAccessError } from '@garage/bucket-api-server';
export { BucketAccessError };

export interface ResolvedBucketKey {
  /** S3-protocol endpoint, e.g. http://127.0.0.1:3900 */
  s3Endpoint: string;
  s3Region: string;
  s3ForcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface AuthorizedKey {
  accessKeyId: string;
  name: string;
  permissions: { read: boolean; write: boolean; owner: boolean };
}

interface CacheEntry {
  resolved: ResolvedBucketKey;
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, CacheEntry>();

function cacheKey(clusterId: string, accessKeyId: string): string {
  // Encode both parts so a separator character in either can't collide two
  // distinct (clusterId, accessKeyId) pairs onto the same cache key.
  return `${encodeURIComponent(clusterId)}:${encodeURIComponent(accessKeyId)}`;
}

// De-dupes concurrent cache misses for the same key into one GetKeyInfo call.
const inflight = new Map<string, Promise<ResolvedBucketKey>>();

interface ClusterRow {
  id: string;
  endpoint: string;
  adminToken: string;
  s3Endpoint: string | null;
  s3Region: string | null;
  s3ForcePathStyle: string | null;
}

async function loadCluster(clusterId: string): Promise<ClusterRow | null> {
  const [row] = await db
    .select({
      id: clusters.id,
      endpoint: clusters.endpoint,
      adminToken: clusters.adminToken,
      s3Endpoint: clusters.s3Endpoint,
      s3Region: clusters.s3Region,
      s3ForcePathStyle: clusters.s3ForcePathStyle,
    })
    .from(clusters)
    .where(eq(clusters.id, clusterId));
  return row ?? null;
}

function adminClient(cluster: ClusterRow): AxiosInstance {
  return axios.create({
    baseURL: cluster.endpoint.replace(/\/+$/, ''),
    headers: { Authorization: `Bearer ${decrypt(cluster.adminToken)}` },
    timeout: 15_000,
    // Pass all statuses through so we can attach a richer error message.
    validateStatus: () => true,
  });
}

/**
 * Derive a default S3 endpoint from the Garage admin API endpoint by keeping
 * the same hostname and substituting Garage's default S3 port (3900).
 */
function deriveS3Endpoint(adminEndpoint: string): string {
  try {
    const u = new URL(adminEndpoint);
    return `${u.protocol}//${u.hostname}:3900`;
  } catch {
    return adminEndpoint;
  }
}

interface GarageKeyInfo {
  accessKeyId: string;
  name: string;
  secretAccessKey?: string | null;
}

interface GarageBucketKey {
  accessKeyId: string;
  name: string;
  permissions: { read: boolean; write: boolean; owner: boolean };
}

interface GarageBucketInfo {
  id: string;
  keys: GarageBucketKey[];
}

/**
 * Strip secret-looking fields from an error's response.data before logging.
 * Prevents secretAccessKey from leaking into log sinks.
 */
function sanitizeForLog(err: unknown): unknown {
  if (!err || typeof err !== 'object') return err;
  const e = err as Record<string, unknown>;
  if (!e.response || typeof e.response !== 'object') return err;
  const r = e.response as Record<string, unknown>;
  if (!r.data || typeof r.data !== 'object') return err;
  const d = r.data as Record<string, unknown>;
  return {
    ...e,
    response: {
      ...r,
      data: {
        ...d,
        secretAccessKey: '[REDACTED]',
        secretAccessKeyDuplicate: '[REDACTED]',
      },
    },
  };
}

/**
 * Fetch the list of keys authorized on a bucket (via Garage GetBucketInfo).
 * Uses the cluster admin token — no S3 access key required from the caller.
 *
 * Throws BucketAccessError:
 *   - 404: cluster or bucket not found
 *   - 502: Garage admin API error
 */
export async function getAuthorizedBucketKeys(
  clusterId: string,
  bucketName: string,
): Promise<AuthorizedKey[]> {
  const cluster = await loadCluster(clusterId);
  if (!cluster) throw new BucketAccessError(404, 'Cluster not found');

  const http = adminClient(cluster);
  const res = await http.get<GarageBucketInfo>(
    `/v2/GetBucketInfo?globalAlias=${encodeURIComponent(bucketName)}`,
  );

  if (res.status === 404) {
    throw new BucketAccessError(404, `Bucket "${bucketName}" not found`);
  }
  if (res.status !== 200 || !Array.isArray(res.data?.keys)) {
    throw new BucketAccessError(502, `GetBucketInfo failed on cluster (HTTP ${res.status})`);
  }

  return res.data.keys.map((k) => ({
    accessKeyId: k.accessKeyId,
    name: k.name,
    permissions: {
      read: k.permissions.read,
      write: k.permissions.write,
      owner: k.permissions.owner,
    },
  }));
}

/**
 * Resolve (and cache) S3 credentials for the given (clusterId, accessKeyId).
 *
 * Calls Garage GetKeyInfo to retrieve the secret — Garage is the truth source.
 * The DB never holds S3 secrets.
 *
 * The resolved key is cached on (clusterId, accessKeyId); the S3Client built
 * from it is itself cached downstream (see getCachedS3Client), so the same
 * client instance serves all buckets the key has access to.
 *
 * Throws BucketAccessError:
 *   - 404: cluster or access key not found
 *   - 502: Garage admin API error
 */
export async function resolveBucketKey(
  clusterId: string,
  accessKeyId: string,
): Promise<ResolvedBucketKey> {
  const ck = cacheKey(clusterId, accessKeyId);
  const cached = cache.get(ck);
  if (cached && cached.expiresAt > Date.now()) return cached.resolved;

  // Collapse a burst of concurrent misses (e.g. a FileBrowser firing several
  // requests at once after the TTL lapses) into a single GetKeyInfo call.
  const existing = inflight.get(ck);
  if (existing) return existing;

  const work = fetchAndCacheKey(clusterId, accessKeyId, ck);
  inflight.set(ck, work);
  try {
    return await work;
  } finally {
    inflight.delete(ck);
  }
}

async function fetchAndCacheKey(
  clusterId: string,
  accessKeyId: string,
  ck: string,
): Promise<ResolvedBucketKey> {
  const cluster = await loadCluster(clusterId);
  if (!cluster) throw new BucketAccessError(404, 'Cluster not found');

  const http = adminClient(cluster);

  let res: AxiosResponse<GarageKeyInfo>;
  try {
    res = await http.get<GarageKeyInfo>(
      `/v2/GetKeyInfo?id=${encodeURIComponent(accessKeyId)}&showSecretKey=true`,
    );
  } catch (err) {
    // Network / timeout — scrub any partial response data before logging.
    logger.error({ clusterId, accessKeyId, err: sanitizeForLog(err) }, 'GetKeyInfo request failed');
    throw new BucketAccessError(502, 'Failed to contact Garage admin API');
  }

  if (res.status === 404) {
    throw new BucketAccessError(404, `Access key not found`);
  }
  if (res.status !== 200) {
    // Never log res.data here — it may contain secretAccessKey.
    logger.error(
      { clusterId, accessKeyId, status: res.status },
      'GetKeyInfo returned error status',
    );
    throw new BucketAccessError(502, `GetKeyInfo failed (HTTP ${res.status})`);
  }

  const info = res.data as GarageKeyInfo;
  if (!info?.secretAccessKey) {
    logger.error({ clusterId, accessKeyId }, 'GetKeyInfo response missing secretAccessKey');
    throw new BucketAccessError(502, 'GetKeyInfo response missing secret key');
  }

  const resolved: ResolvedBucketKey = {
    s3Endpoint: cluster.s3Endpoint ?? deriveS3Endpoint(cluster.endpoint),
    s3Region: cluster.s3Region ?? 'garage',
    s3ForcePathStyle: cluster.s3ForcePathStyle !== 'false',
    accessKeyId: info.accessKeyId,
    secretAccessKey: info.secretAccessKey,
  };

  cache.set(ck, { resolved, expiresAt: Date.now() + TTL_MS });
  return resolved;
}

/** Test hook: clear the cache so vitest runs are deterministic. No-op in production. */
export function _resetBucketKeyCacheForTests(): void {
  if (process.env.NODE_ENV === 'production') return;
  cache.clear();
  inflight.clear();
}
