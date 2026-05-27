import { useEffect, useMemo, useState } from 'react';
import { FileDirectoryIcon, SearchIcon, AlertIcon, SyncIcon } from '@primer/octicons-react';
import { Button } from '@garage/ui';
import { useBrowser } from '../../context';
import { usePrefixQuery } from '../../hooks/usePrefixQuery';
import { Toolbar } from '../toolbar/Toolbar';
import { BulkBar } from '../bulk/BulkBar';
import { ListView } from './ListView';
import { GridView } from './GridView';
import { classifyError, isRecoverable } from '../../types';
import { fileKind } from '@/lib/format';
import type { ListItem } from '../../types';

function sortItems(items: ListItem[], key: string, dir: 'asc' | 'desc'): ListItem[] {
  return [...items].sort((a, b) => {
    // Folders always first
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;

    let cmp = 0;
    if (key === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else if (key === 'size') {
      const sa = a.type === 'file' ? a.object.size : -1;
      const sb = b.type === 'file' ? b.object.size : -1;
      cmp = sa - sb;
    } else if (key === 'modified') {
      const ta =
        a.type === 'file' && a.object.lastModified ? new Date(a.object.lastModified).getTime() : 0;
      const tb =
        b.type === 'file' && b.object.lastModified ? new Date(b.object.lastModified).getTime() : 0;
      cmp = ta - tb;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

export function FolderView() {
  const {
    http,
    currentPrefix,
    filterQuery,
    filterKind,
    setFilterQuery,
    setFilterKind,
    sortState,
    viewMode,
    openUpload,
  } = useBrowser();

  const baseUrl = http.defaults.baseURL ?? '';
  const { items, isLoading, isFetchingNextPage, hasMore, loadMore, error, refetch } =
    usePrefixQuery(http, baseUrl, currentPrefix);

  const [dragOver, setDragOver] = useState(false);

  const filtered = useMemo(() => {
    let result = items;
    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      result = result.filter((it) => it.name.toLowerCase().includes(q));
    }
    if (filterKind !== 'all') {
      result = result.filter((it) => {
        if (filterKind === 'folder') return it.type === 'folder';
        if (it.type === 'folder') return false;
        return fileKind(it.name) === filterKind;
      });
    }
    return result;
  }, [items, filterQuery, filterKind]);

  const sorted = useMemo(
    () => sortItems(filtered, sortState.key, sortState.dir),
    [filtered, sortState],
  );

  const visibleKeys = useMemo(
    () => sorted.map((item) => (item.type === 'folder' ? item.prefix : item.key)),
    [sorted],
  );

  const appErr = error ? classifyError(error) : null;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (filterQuery || filterKind !== 'all') {
        e.preventDefault();
        setFilterQuery('');
        setFilterKind('all');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filterKind, filterQuery, setFilterKind, setFilterQuery]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) {
      openUpload(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card/20">
      <Toolbar totalLoaded={items.length} />

      <BulkBar visibleKeys={visibleKeys} totalLoaded={items.length} />

      <div className="flex shrink-0 items-center gap-3 border-b border-border/50 bg-card/30 px-5 py-2 text-[12px] text-muted-foreground">
        <span>
          <strong className="font-semibold text-foreground">{sorted.length}</strong>{' '}
          {filterQuery || filterKind !== 'all' ? 'matching' : ''} items
        </span>
        {(filterQuery || filterKind !== 'all') && items.length !== sorted.length && (
          <span className="text-[11px]">{items.length} loaded</span>
        )}
        {hasMore && (
          <span className="text-[11px] text-muted-foreground/70">More objects available</span>
        )}
      </div>

      {/* Content area */}
      <div
        className="flex min-h-0 flex-1 flex-col relative"
        data-dragover={dragOver}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={handleDrop}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5">
            <span className="text-sm font-medium text-primary">Drop files to upload</span>
          </div>
        )}

        {isLoading && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <SyncIcon size={24} className="animate-spin" />
            <p className="text-sm">Loading…</p>
          </div>
        )}

        {appErr && !isLoading && (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center text-muted-foreground">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <AlertIcon size={24} />
            </div>
            <div>
              <h3 className="mb-1 text-base font-semibold text-foreground">
                {appErr.status === 403 ? 'Access denied' : 'Failed to load'}
              </h3>
              <p className="text-sm">{appErr.message}</p>
            </div>
            {isRecoverable(appErr) && (
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <SyncIcon size={14} className="mr-1.5" /> Retry
              </Button>
            )}
          </div>
        )}

        {!isLoading && !appErr && sorted.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center text-muted-foreground">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {filterQuery || filterKind !== 'all' ? (
                <SearchIcon size={24} />
              ) : (
                <FileDirectoryIcon size={24} />
              )}
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground mb-1">
                {filterQuery || filterKind !== 'all' ? 'No matches' : 'Empty folder'}
              </h3>
              <p className="text-sm">
                {filterQuery || filterKind !== 'all'
                  ? 'Try a different filter or clear it.'
                  : 'Drop files here or click Upload to add objects'}
              </p>
            </div>
            {(filterQuery || filterKind !== 'all') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilterQuery('');
                  setFilterKind('all');
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        )}

        {!isLoading &&
          !appErr &&
          sorted.length > 0 &&
          (viewMode === 'grid' ? <GridView items={sorted} /> : <ListView items={sorted} />)}
      </div>

      {/* Load more */}
      {hasMore && !isLoading && (
        <div className="flex shrink-0 justify-center border-t border-border/40 py-3">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? (
              <>
                <SyncIcon size={13} className="mr-1.5 animate-spin" /> Loading…
              </>
            ) : (
              'Load more'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
