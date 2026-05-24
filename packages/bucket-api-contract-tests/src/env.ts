/**
 * Env-driven configuration for the conformance suite.
 *
 * The suite skips itself cleanly if mandatory vars are missing, so
 * `pnpm test` works offline without Docker / a real S3 endpoint.
 *
 * Two ways to point the suite at a connection:
 *   - Supply `TEST_CONNECTION_ID` for an existing one.
 *   - Supply `TEST_S3_*` so the suite calls POST /connections to create one.
 */

export interface ContractTestConfig {
  bffUrl: string;
  bffPassword: string;
  bucket: string;
  /** Existing connection id, or null if we should create one. */
  connectionId: string | null;
  /** If `connectionId` is null, these are used to create one. */
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

  const connectionId = process.env.TEST_CONNECTION_ID ?? null;
  if (connectionId) {
    return { bffUrl, bffPassword, bucket, connectionId };
  }

  const endpoint = process.env.TEST_S3_ENDPOINT;
  const accessKeyId = process.env.TEST_S3_ACCESS_KEY;
  const secretAccessKey = process.env.TEST_S3_SECRET_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;

  return {
    bffUrl,
    bffPassword,
    bucket,
    connectionId: null,
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
