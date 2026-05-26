/**
 * Env-driven configuration for the conformance suite.
 *
 * The suite skips itself cleanly if mandatory vars are missing, so
 * `pnpm test` works offline without Docker / a real S3 endpoint.
 *
 * The same suite runs against BOTH backend-for-frontends:
 *
 *   - `s3-browser/api` (flavor=connections, default):
 *       path template = /connections/{id}/buckets/{bucket}/...
 *       owner id      = an S3 connection row (created on the fly via
 *                       TEST_S3_* if TEST_CONNECTION_ID is unset).
 *
 *   - `garage-admin-console/api` (flavor=clusters):
 *       path template = /clusters/{id}/buckets/{bucket}/...
 *       owner id      = a cluster row that already exists in the BFF's
 *                       DB and has its s3Endpoint configured. We never
 *                       create/teardown clusters from tests.
 */

export type BffFlavor = 'connections' | 'clusters';

export interface ContractTestConfig {
  bffUrl: string;
  bffPassword: string;
  bucket: string;
  flavor: BffFlavor;
  /**
   * The id of the bucket-owning row inside the BFF:
   *   - flavor=connections → S3 connection id
   *   - flavor=clusters    → cluster id
   * If null (only valid for `connections` flavor), the suite will create
   * the connection from TEST_S3_*.
   */
  ownerId: string | null;
  /**
   * clusters flavor only: the access key ID to forward as
   * X-Garage-Access-Key-Id on every bucket request.
   * Required when TEST_BFF_FLAVOR=clusters; sourced from TEST_ACCESS_KEY_ID.
   */
  accessKeyId?: string;
  /** If `ownerId` is null, these are used to create a connection. */
  s3?: {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  };
}

function readConfig(): ContractTestConfig | null {
  const bffUrl = process.env.TEST_BFF_URL;
  const bffPassword = process.env.TEST_BFF_PASSWORD;
  const bucket = process.env.TEST_S3_BUCKET;
  if (!bffUrl || !bffPassword || !bucket) return null;

  const flavor: BffFlavor = process.env.TEST_BFF_FLAVOR === 'clusters' ? 'clusters' : 'connections';

  // For the clusters flavor, the owner id MUST be a pre-existing cluster.
  if (flavor === 'clusters') {
    const ownerId = process.env.TEST_CLUSTER_ID ?? process.env.TEST_CONNECTION_ID;
    const accessKeyId = process.env.TEST_ACCESS_KEY_ID;
    if (!ownerId || !accessKeyId) return null;
    return { bffUrl, bffPassword, bucket, flavor, ownerId, accessKeyId };
  }

  // connections flavor — same flow as before.
  const ownerId = process.env.TEST_CONNECTION_ID ?? null;
  if (ownerId) {
    return { bffUrl, bffPassword, bucket, flavor, ownerId };
  }

  const endpoint = process.env.TEST_S3_ENDPOINT;
  const accessKeyId = process.env.TEST_S3_ACCESS_KEY;
  const secretAccessKey = process.env.TEST_S3_SECRET_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;

  return {
    bffUrl,
    bffPassword,
    bucket,
    flavor,
    ownerId: null,
    s3: {
      endpoint,
      region: process.env.TEST_S3_REGION ?? 'us-east-1',
      accessKeyId,
      secretAccessKey,
      forcePathStyle: (process.env.TEST_S3_FORCE_PATH_STYLE ?? 'true').toLowerCase() !== 'false',
    },
  };
}

export const config: ContractTestConfig | null = readConfig();
