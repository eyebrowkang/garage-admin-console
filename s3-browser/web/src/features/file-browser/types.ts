import type { FileKind } from '@garage/web-shared';
import type { S3Object } from '@/lib/types';

// FileKind's single source of truth is @garage/web-shared (its fileKind()
// helper returns this type). Re-exported here so file-browser code can keep
// importing it from the feature-local barrel.
export type { FileKind };

export type ListItem =
  | { type: 'folder'; name: string; prefix: string }
  | { type: 'file'; name: string; key: string; object: S3Object };

export type FolderItem = Extract<ListItem, { type: 'folder' }>;
export type FileItem = Extract<ListItem, { type: 'file' }>;

export type SortKey = 'name' | 'size' | 'modified';
export interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

export type ViewMode = 'list' | 'grid';

export type FilterKind = FileKind | 'all' | 'folder';

export interface AppError {
  message: string;
  status?: number;
}

export function classifyError(err: unknown): AppError {
  if (err && typeof err === 'object' && 'response' in err) {
    const e = err as { response?: { status?: number }; message?: string };
    return { message: e.message ?? 'Request failed', status: e.response?.status };
  }
  return { message: (err as Error)?.message ?? 'Unknown error' };
}

export function isRecoverable(err: AppError): boolean {
  return err.status !== 403;
}

export type TreeNodeData = {
  id: string;
  name: string;
  type: 'bucket' | 'folder' | 'file';
  prefix?: string;
  item?: ListItem;
  loadStatus: 'idle' | 'loading' | 'loaded' | 'error';
  children?: TreeNodeData[];
};
