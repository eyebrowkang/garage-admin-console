/**
 * Display formatters and file-kind helpers, lifted from the prototype's
 * data.jsx. Pure functions — no React, no DOM.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  Code,
  File as FileIcon,
  FileText,
  Folder,
  Image as ImageIcon,
  Music,
  Settings,
  Video,
} from 'lucide-react';

export type FileKind = 'image' | 'video' | 'audio' | 'archive' | 'code' | 'config' | 'doc' | 'file';

/** Derive a kind from a filename / extension. */
export function fileKind(name: string): FileKind {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'ico', 'tiff', 'bmp'].includes(ext))
    return 'image';
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext)) return 'audio';
  if (['zip', 'tar', 'gz', 'rar', '7z', 'bz2'].includes(ext)) return 'archive';
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
    ].includes(ext)
  )
    return 'code';
  if (['json', 'toml', 'env', 'conf', 'ini'].includes(ext)) return 'config';
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'woff', 'woff2', 'ttf', 'otf'].includes(ext))
    return 'doc';
  return 'file';
}

export function fileIconClass(isFolder: boolean, name: string): string {
  if (isFolder) return 'fname__icon--folder';
  return 'fname__icon--' + fileKind(name);
}

export function getFileIcon(isFolder: boolean, name: string): LucideIcon {
  if (isFolder) return Folder;
  const k = fileKind(name);
  if (k === 'image') return ImageIcon;
  if (k === 'video') return Video;
  if (k === 'audio') return Music;
  if (k === 'archive') return Archive;
  if (k === 'code') return Code;
  if (k === 'config') return Settings;
  if (k === 'doc') return FileText;
  return FileIcon;
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
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDay = diffMs / (1000 * 60 * 60 * 24);
  if (diffDay < 1) {
    const h = Math.floor(diffMs / (1000 * 60 * 60));
    if (h < 1) return Math.max(1, Math.floor(diffMs / (1000 * 60))) + ' min ago';
    return h + ' hour' + (h === 1 ? '' : 's') + ' ago';
  }
  if (diffDay < 7) return Math.floor(diffDay) + ' days ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatNum(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

/** Get the filename portion of a key (last segment of the slash-delimited path). */
export function basename(key: string): string {
  const stripped = key.endsWith('/') ? key.slice(0, -1) : key;
  const idx = stripped.lastIndexOf('/');
  return idx === -1 ? stripped : stripped.slice(idx + 1);
}
