import type { Connection } from './types';

export interface ConnectionDisplayMeta {
  provider: string;
  short: string;
  /**
   * Tailwind classes for the avatar tile (background + text). Active rows
   * override these with the primary palette in the Sidebar.
   */
  iconClass: string;
  status: 'healthy';
}

export function connectionDisplayMeta(connection: Connection): ConnectionDisplayMeta {
  const haystack = `${connection.name} ${connection.endpoint}`.toLowerCase();

  if (haystack.includes('garage')) {
    return {
      provider: 'Garage',
      short: 'GA',
      iconClass: 'bg-primary/10 text-primary',
      status: 'healthy',
    };
  }
  if (haystack.includes('r2.cloudflarestorage') || haystack.includes('cloudflare')) {
    return {
      provider: 'Cloudflare R2',
      short: 'R2',
      iconClass: 'bg-orange-100 text-orange-700',
      status: 'healthy',
    };
  }
  if (haystack.includes('backblaze') || haystack.includes('b2')) {
    return {
      provider: 'Backblaze B2',
      short: 'B2',
      iconClass: 'bg-blue-100 text-blue-700',
      status: 'healthy',
    };
  }
  if (haystack.includes('minio') || haystack.includes('localhost')) {
    return {
      provider: 'MinIO',
      short: 'M',
      iconClass: 'bg-red-100 text-red-700',
      status: 'healthy',
    };
  }
  if (haystack.includes('wasabi')) {
    return {
      provider: 'Wasabi',
      short: 'WA',
      iconClass: 'bg-green-100 text-green-700',
      status: 'healthy',
    };
  }
  if (haystack.includes('amazonaws') || haystack.includes('aws')) {
    return {
      provider: 'AWS S3',
      short: 'AWS',
      iconClass: 'bg-amber-100 text-amber-800',
      status: 'healthy',
    };
  }

  return {
    provider: 'S3-compatible',
    short: 'S3',
    iconClass: 'bg-primary/10 text-primary',
    status: 'healthy',
  };
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
