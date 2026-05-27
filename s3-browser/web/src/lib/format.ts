/**
 * Display formatters and file-kind helpers. Pure functions — no React, no DOM.
 */

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

export function formatBytes(b: number | null | undefined): string {
  if (b == null) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
  return (b / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

export function formatDate(iso: string | null | undefined): string {
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

export function basename(key: string): string {
  const stripped = key.endsWith('/') ? key.slice(0, -1) : key;
  const idx = stripped.lastIndexOf('/');
  return idx === -1 ? stripped : stripped.slice(idx + 1);
}
