/**
 * Display formatters shared by both apps. Pure functions — no React, no DOM.
 *
 * `formatBytes` is decimal (1000-based, SI units kB/MB/…), unified from the
 * Admin Console's implementation so cluster capacity and S3 object sizes read
 * identically across the suite. (S3 Browser previously used 1024-based KB/MB.)
 */

const BYTE_UNITS = ['B', 'kB', 'MB', 'GB', 'TB', 'PB'];

export function formatBytes(bytes?: number | null): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '-';
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  const precision = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${BYTE_UNITS[unitIndex]}`;
}

function formatDateTimeParts(date: Date, hour12: boolean): string {
  const d = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const t = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12 });
  return `${d}, ${t}`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDateTimeParts(date, true);
}

export function formatDateTime24h(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDateTimeParts(date, false);
}

export function formatRelativeSeconds(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return '-';
  const totalSeconds = Math.max(0, Math.floor(seconds));
  if (totalSeconds < 60) return `${totalSeconds}s ago`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatShortId(id: string, length = 8): string {
  if (id.length <= length) return id;
  return `${id.slice(0, length)}...`;
}

/** Compact "MMM D, YYYY · HH:MM" used by the S3 file browser. */
export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${date} · ${time}`;
}

export function formatNum(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

/** Last path segment of an S3 key (trailing slash tolerated). */
export function basename(key: string): string {
  const stripped = key.endsWith('/') ? key.slice(0, -1) : key;
  const idx = stripped.lastIndexOf('/');
  return idx === -1 ? stripped : stripped.slice(idx + 1);
}

export type FileKind =
  | 'image'
  | 'text'
  | 'json'
  | 'markdown'
  | 'csv'
  | 'code'
  | 'archive'
  | 'unknown';

export function fileKind(name: string): FileKind {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'ico', 'tiff', 'bmp'].includes(ext))
    return 'image';
  if (['txt', 'log', 'text'].includes(ext)) return 'text';
  if (ext === 'json') return 'json';
  if (['md', 'mdx', 'markdown'].includes(ext)) return 'markdown';
  if (['csv', 'tsv'].includes(ext)) return 'csv';
  if (
    [
      'js',
      'jsx',
      'ts',
      'tsx',
      'py',
      'go',
      'rs',
      'rb',
      'java',
      'c',
      'cpp',
      'h',
      'css',
      'scss',
      'html',
      'xml',
      'yaml',
      'yml',
      'toml',
      'ini',
      'conf',
      'env',
      'sh',
      'bash',
      'zsh',
      'sql',
    ].includes(ext)
  )
    return 'code';
  if (['zip', 'tar', 'gz', 'tgz', 'rar', '7z', 'bz2', 'xz'].includes(ext)) return 'archive';
  return 'unknown';
}

export function isTextLikeKind(kind: FileKind): boolean {
  return ['text', 'json', 'markdown', 'csv', 'code'].includes(kind);
}
