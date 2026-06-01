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
  image: 'text-muted-foreground',
  text: 'text-muted-foreground',
  json: 'text-muted-foreground',
  markdown: 'text-muted-foreground',
  csv: 'text-muted-foreground',
  code: 'text-muted-foreground',
  archive: 'text-muted-foreground',
  unknown: 'text-muted-foreground',
};

export const iconBgClass: Record<FileKind | 'folder', string> = {
  folder: 'bg-primary/10',
  image: 'bg-muted/60',
  text: 'bg-muted/60',
  json: 'bg-muted/60',
  markdown: 'bg-muted/60',
  csv: 'bg-muted/60',
  code: 'bg-muted/60',
  archive: 'bg-muted/60',
  unknown: 'bg-muted/60',
};
