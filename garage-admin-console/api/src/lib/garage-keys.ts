/**
 * Garage per-bucket S3 key manager.
 *
 * Embedded-mode strategy:
 *   1. Use the cluster admin token to call Garage CreateKey + AllowBucketKey
 *      and mint a short-lived S3 keypair scoped to a single bucket.
 *   2. Cache the keypair in-process keyed on (clusterId, bucketName) with a
 *      10-minute TTL so subsequent FileBrowser requests don't fan out.
 *   3. On TTL expiry the next request mints a fresh keypair; we don't
 *      proactively delete the old one (Garage will GC; the operator can
 *      reap via the existing key list UI if desired).
 *
 * Persistence is intentionally in-memory only — process restart re-mints.
 */
import axios, { type AxiosInstance } from 'axios';
import { eq } from 'drizzle-orm';

import db from '../db/index.js';
import { clusters } from '../db/schema.js';
import { decrypt } from '../encryption.js';
import { logger } from '../logger.js';
import { BucketAccessError } from '@garage/bucket-api-server';
export { BucketAccessError };

export interface ResolvedBucketKey {
  /** S3-protocol endpoint, e.g. http://192.168.88.62:3900 */
  s3Endpoint: string;
  s3Region: string;
  s3ForcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  /** Internal Garage bucket id (hex). For debugging only. */
  bucketId: string;
}

interface CacheEntry {
  resolved: ResolvedBucketKey;
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, CacheEntry>();

function cacheKey(clusterId: string, bucket: string): string {
  return `${clusterId}::${bucket}`;
}

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

interface GarageBucket {
  id: string;
  globalAliases?: string[];
  localAliases?: { alias: string; accessKeyId?: string }[];
}

async function resolveBucketId(http: AxiosInstance, bucketName: string): Promise<string | null> {
  const res = await http.get<GarageBucket[]>('/v2/ListBuckets');
  if (res.status !== 200 || !Array.isArray(res.data)) {
    throw new BucketAccessError(502, `Failed to list buckets on cluster (HTTP ${res.status})`);
  }
  for (const b of res.data) {
    if (b.globalAliases?.includes(bucketName)) return b.id;
    if (b.localAliases?.some((a) => a.alias === bucketName)) return b.id;
  }
  return null;
}

interface GarageKey {
  accessKeyId: string;
  secretAccessKey: string;
}

async function mintKey(
  http: AxiosInstance,
  clusterId: string,
  bucketName: string,
  bucketId: string,
): Promise<GarageKey> {
  const name = `admin-console:${bucketName}:${Date.now().toString(36)}`;
  const createRes = await http.post<GarageKey>(
    '/v2/CreateKey',
    { name },
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (createRes.status !== 200 || !createRes.data?.accessKeyId) {
    throw new BucketAccessError(502, `CreateKey failed on cluster (HTTP ${createRes.status})`);
  }
  const key = createRes.data;

  const allowRes = await http.post(
    '/v2/AllowBucketKey',
    {
      bucketId,
      accessKeyId: key.accessKeyId,
      permissions: { read: true, write: true, owner: false },
    },
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (allowRes.status !== 200) {
    // Best-effort cleanup of the orphan key.
    void http
      .post(`/v2/DeleteKey?id=${encodeURIComponent(key.accessKeyId)}`)
      .catch(() => undefined);
    throw new BucketAccessError(502, `AllowBucketKey failed on cluster (HTTP ${allowRes.status})`);
  }

  logger.info(
    { clusterId, bucketName, bucketId, accessKeyId: key.accessKeyId },
    'minted bucket-scoped S3 key',
  );
  return key;
}

/**
 * Derive a default S3 endpoint from the Garage admin API endpoint by keeping
 * the same hostname and substituting Garage's default S3 port (3900).
 *
 * Examples:
 *   http://192.168.1.10:3903  →  http://192.168.1.10:3900
 *   https://garage.example.com  →  https://garage.example.com:3900
 */
function deriveS3Endpoint(adminEndpoint: string): string {
  try {
    const u = new URL(adminEndpoint);
    return `${u.protocol}//${u.hostname}:3900`;
  } catch {
    return adminEndpoint;
  }
}

/**
 * Resolve (and cache) an S3 keypair scoped to (clusterId, bucketName). The
 * caller can plug the returned credentials straight into @aws-sdk/client-s3.
 *
 * Throws BucketAccessError with a status hint on:
 *   - 404: cluster or bucket not found
 *   - 502: Garage admin API rejected one of the calls
 *
 * When the cluster has no explicit s3Endpoint configured, derives one from
 * the admin API endpoint by replacing the port with Garage's default (3900).
 */
export async function resolveBucketKey(
  clusterId: string,
  bucketName: string,
): Promise<ResolvedBucketKey> {
  const key = cacheKey(clusterId, bucketName);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.resolved;
  }

  const cluster = await loadCluster(clusterId);
  if (!cluster) throw new BucketAccessError(404, 'Cluster not found');

  const http = adminClient(cluster);
  const bucketId = await resolveBucketId(http, bucketName);
  if (!bucketId) throw new BucketAccessError(404, `Bucket "${bucketName}" not found`);

  const minted = await mintKey(http, clusterId, bucketName, bucketId);

  const resolved: ResolvedBucketKey = {
    s3Endpoint: cluster.s3Endpoint ?? deriveS3Endpoint(cluster.endpoint),
    s3Region: cluster.s3Region ?? 'garage',
    s3ForcePathStyle: cluster.s3ForcePathStyle !== 'false',
    accessKeyId: minted.accessKeyId,
    secretAccessKey: minted.secretAccessKey,
    bucketId,
  };
  cache.set(key, { resolved, expiresAt: now + TTL_MS });
  return resolved;
}

/** Test hook: clear the cache so vitest runs are deterministic. */
export function _resetBucketKeyCacheForTests(): void {
  cache.clear();
}
