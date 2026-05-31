/**
 * FileBrowser — the embedded component exposed via Module Federation.
 *
 * Conventions:
 *   - props-driven path; no internal router
 *   - no @aws-sdk/* imports — all S3 details live in the BFF behind props.backend.baseUrl
 *   - no reads of auth tokens or credentials from localStorage/window/env
 */
import { useMemo } from 'react';
import { AlertFillIcon, AppsIcon, CheckIcon, ListUnorderedIcon } from '@primer/octicons-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cn } from '@garage/ui';
import { BrowserProvider, useBrowser } from './context';
import { TreePane } from './components/tree/TreePane';
import { Breadcrumb } from './components/breadcrumb/Breadcrumb';
import { FolderView } from './components/list/FolderView';
import { PreviewPane } from './components/preview/PreviewPane';
import { UploadDialog } from './components/dialogs/UploadDialog';
import { DeleteDialog } from './components/dialogs/DeleteDialog';
import { NewFolderDialog } from './components/dialogs/NewFolderDialog';
import { RenameDialog } from './components/dialogs/RenameDialog';
import { MoveDialog } from './components/dialogs/MoveDialog';
import { CopyDialog } from './components/dialogs/CopyDialog';
import { PresignDialog } from './components/dialogs/PresignDialog';

// ---------------------------------------------------------------------------
// Public API surface (preserved for MF compatibility)
// ---------------------------------------------------------------------------

export type FileBrowserViewMode = 'list' | 'grid';

export interface FileBrowserProps {
  /** Bucket Backend API endpoint. baseUrl already encodes the bucket. */
  backend: {
    baseUrl: string;
    authToken: string;
    headers?: Record<string, string>;
  };
  /** Display-only name — baseUrl already encodes which bucket we're in. */
  bucket: string;
  /** Path segments (empty array = bucket root). Controlled by parent. */
  path: string[];
  onPathChange: (path: string[]) => void;
  viewMode?: FileBrowserViewMode;
  onViewModeChange?: (mode: FileBrowserViewMode) => void;
  density?: 'compact' | 'comfortable';
  showPreview?: boolean;
  onSelect?: (items: unknown[]) => void;
  onError?: (err: Error) => void;
}

// ---------------------------------------------------------------------------
// Entry — owns the QueryClient so it doesn't depend on the host's instance
// ---------------------------------------------------------------------------

export function FileBrowser(props: FileBrowserProps) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
        },
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserProvider props={props}>
        <FileBrowserLayout />
      </BrowserProvider>
    </QueryClientProvider>
  );
}

export default FileBrowser;

// ---------------------------------------------------------------------------
// Exported view-toggle (consumed by BucketView and similar hosts)
// ---------------------------------------------------------------------------
export function FileBrowserViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: FileBrowserViewMode;
  onChange: (m: FileBrowserViewMode) => void;
}) {
  return (
    <div className="flex h-8 items-center overflow-hidden rounded-md border border-border bg-card shadow-sm">
      <button
        className={cn(
          'flex h-8 w-8 items-center justify-center text-sm transition-colors',
          viewMode === 'list'
            ? 'text-primary bg-primary/10'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
        )}
        onClick={() => onChange('list')}
        title="List view"
      >
        <ListUnorderedIcon size={14} />
      </button>
      <button
        className={cn(
          'flex h-8 w-8 items-center justify-center border-l border-border text-sm transition-colors',
          viewMode === 'grid'
            ? 'text-primary bg-primary/10'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
        )}
        onClick={() => onChange('grid')}
        title="Grid view"
      >
        <AppsIcon size={14} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
function FileBrowserLayout() {
  const { activeFileKey, toast } = useBrowser();

  return (
    <div
      className="flex flex-col h-full min-h-0 overflow-hidden text-sm font-sans"
      style={{ fontFamily: 'Manrope, ui-sans-serif, system-ui, -apple-system, sans-serif' }}
    >
      {/* Breadcrumb */}
      <Breadcrumb />

      {/* Main content */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        <TreePane />

        {/* Right panel */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 bg-card relative">
          {activeFileKey ? <PreviewPane /> : <FolderView />}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            'fixed left-1/2 bottom-5 -translate-x-1/2 z-50',
            'inline-flex items-center gap-2 rounded-full border border-border bg-popover px-4 py-2 text-xs font-medium text-foreground shadow-lg',
            'pointer-events-none animate-in slide-in-from-bottom-2 duration-200',
          )}
        >
          {toast.kind === 'ok' ? (
            <CheckIcon size={14} className="text-success" />
          ) : (
            <AlertFillIcon size={14} className="text-destructive" />
          )}
          {toast.message}
        </div>
      )}

      {/* Dialogs */}
      <UploadDialog />
      <DeleteDialog />
      <NewFolderDialog />
      <RenameDialog />
      <MoveDialog />
      <CopyDialog />
      <PresignDialog />
    </div>
  );
}
