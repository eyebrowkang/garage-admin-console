import { eq } from 'drizzle-orm';
import { getCachedS3Client, type S3Client } from '@garage/bucket-api-server';

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
  bucket: string | null;
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
    bucket: row.bucket ?? null,
  };
}

/**
 * Build an S3 client from a stored connection. Clients are cached and reused
 * across requests (keyed by the connection's full credential identity), so a
 * credential change transparently produces a fresh client.
 */
export function buildS3Client(conn: ResolvedConnection): S3Client {
  return getCachedS3Client({
    region: conn.region,
    endpoint: conn.endpoint,
    forcePathStyle: conn.forcePathStyle,
    credentials: {
      accessKeyId: conn.accessKeyId,
      secretAccessKey: conn.secretAccessKey,
    },
  });
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
