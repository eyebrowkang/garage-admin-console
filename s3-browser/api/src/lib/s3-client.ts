import { eq } from 'drizzle-orm';
import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';

import db from '../db/index.js';
import { connections } from '../db/schema.js';
import { decrypt } from '../encryption.js';

export interface ResolvedConnection {
  id: string;
  name: string;
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
}

export async function loadConnection(id: string): Promise<ResolvedConnection | null> {
  const [row] = await db.select().from(connections).where(eq(connections.id, id));
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    endpoint: row.endpoint,
    region: row.region,
    forcePathStyle: row.forcePathStyle !== 'false',
    accessKeyId: decrypt(row.accessKeyId),
    secretAccessKey: decrypt(row.secretAccessKey),
  };
}

/**
 * Build an S3 client from a stored connection. Each request gets its own
 * client instance — connection pooling lives inside the underlying HTTP agent.
 */
export function buildS3Client(conn: ResolvedConnection): S3Client {
  const config: S3ClientConfig = {
    region: conn.region,
    endpoint: conn.endpoint,
    forcePathStyle: conn.forcePathStyle,
    credentials: {
      accessKeyId: conn.accessKeyId,
      secretAccessKey: conn.secretAccessKey,
    },
    // AWS SDK v3 defaults to ALWAYS computing a CRC32 streaming checksum,
    // which fails on already-flowing Readable streams (e.g. busboy file
    // streams). Garage doesn't require it; tell the SDK only to add a
    // checksum when the wire protocol mandates one.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  };
  return new S3Client(config);
}

/**
 * Convenience: load + build in one call. Returns `null` if the connection
 * doesn't exist (caller is expected to return 404).
 */
export async function clientForConnection(
  id: string,
): Promise<{ conn: ResolvedConnection; client: S3Client } | null> {
  const conn = await loadConnection(id);
  if (!conn) return null;
  return { conn, client: buildS3Client(conn) };
}
