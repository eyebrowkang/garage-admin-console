import {
  FileDirectoryIcon,
  FileDirectoryFillIcon,
  FileDirectoryOpenFillIcon,
  FileIcon,
  FileBinaryIcon,
  FileCodeIcon,
  FileMediaIcon,
  FileZipIcon,
  MarkdownIcon,
  TableIcon,
} from '@primer/octicons-react';
import type { FileKind } from './types';

export function getFileKindIcon(kind: FileKind | 'folder', isOpen = false) {
  if (kind === 'folder') return isOpen ? FileDirectoryOpenFillIcon : FileDirectoryIcon;
  if (kind === 'image') return FileMediaIcon;
  if (kind === 'text') return FileIcon;
  if (kind === 'json') return FileCodeIcon;
  if (kind === 'markdown') return MarkdownIcon;
  if (kind === 'csv') return TableIcon;
  if (kind === 'archive') return FileZipIcon;
  if (kind === 'code') return FileCodeIcon;
  return FileBinaryIcon;
}

export function getFolderIcon(isOpen: boolean) {
  return isOpen ? FileDirectoryOpenFillIcon : FileDirectoryIcon;
}

export { FileDirectoryFillIcon };

export const iconColorClass: Record<FileKind | 'folder', string> = {
  folder: 'text-primary',
  image: 'text-green-700',
  text: 'text-muted-foreground',
  json: 'text-purple-700',
  markdown: 'text-muted-foreground',
  csv: 'text-green-700',
  code: 'text-purple-700',
  archive: 'text-purple-700',
  unknown: 'text-muted-foreground',
};

export const iconBgClass: Record<FileKind | 'folder', string> = {
  folder: 'bg-primary/10',
  image: 'bg-green-50',
  text: 'bg-muted/60',
  json: 'bg-purple-50',
  markdown: 'bg-muted/60',
  csv: 'bg-green-50',
  code: 'bg-purple-50',
  archive: 'bg-purple-50',
  unknown: 'bg-muted/60',
};
