import type { Connection } from './types';

/**
 * Best-effort provider label inferred from a connection's name/endpoint.
 * Purely cosmetic — shown next to the region in the connection views.
 */
export function connectionProvider(connection: Connection): string {
  const haystack = `${connection.name} ${connection.endpoint}`.toLowerCase();

  if (haystack.includes('garage')) return 'Garage';
  if (haystack.includes('r2.cloudflarestorage') || haystack.includes('cloudflare')) {
    return 'Cloudflare R2';
  }
  if (haystack.includes('backblaze') || haystack.includes('b2')) return 'Backblaze B2';
  if (haystack.includes('minio') || haystack.includes('localhost')) return 'MinIO';
  if (haystack.includes('wasabi')) return 'Wasabi';
  if (haystack.includes('amazonaws') || haystack.includes('aws')) return 'AWS S3';

  return 'S3-compatible';
}
