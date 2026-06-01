import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Tree, type NodeRendererProps, type TreeApi } from 'react-arborist';
import { useQueries } from '@tanstack/react-query';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  KebabHorizontalIcon,
  SyncIcon,
  SidebarExpandIcon,
  XIcon,
} from '@primer/octicons-react';
import { cn } from '@garage/ui';
import { fileKind } from '@garage/web-shared';
import type { ListItem, TreeNodeData } from '../../types';
import { useBrowser } from '../../context';
import { fetchPrefixPages, pagesToItems, treePrefixQueryKey } from '../../hooks/usePrefixQuery';
import { getFileKindIcon, getFolderIcon, iconColorClass } from '../../icons';

const ROOT_ID = '__root__';
const FILE_ID_PREFIX = 'file:';
const DEFAULT_WIDTH = 256;
const MIN_WIDTH = 184;
const MAX_WIDTH = 420;

function prefixToId(prefix: string): string {
  return prefix === '' ? ROOT_ID : prefix;
}

function idToPrefix(id: string): string {
  return id === ROOT_ID ? '' : id;
}

function fileKeyToId(key: string): string {
  return `${FILE_ID_PREFIX}${key}`;
}

function isFileId(id: string): boolean {
  return id.startsWith(FILE_ID_PREFIX);
}

function prefixAncestors(prefix: string): string[] {
  if (!prefix) return [''];
  const parts = prefix.replace(/\/$/, '').split('/').filter(Boolean);
  const out = [''];
  for (let i = 1; i <= parts.length; i += 1) {
    out.push(`${parts.slice(0, i).join('/')}/`);
  }
  return out;
}

function sortTreeItems(items: ListItem[]) {
  return [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function buildTree(
  prefix: string,
  name: string,
  openPrefixes: Set<string>,
  itemsByPrefix: Map<string, ListItem[]>,
  statusMap: Map<string, 'idle' | 'loading' | 'loaded' | 'error'>,
): TreeNodeData {
  const status = statusMap.get(prefix) ?? 'idle';
  const isOpen = openPrefixes.has(prefix);
  const children = isOpen
    ? sortTreeItems(itemsByPrefix.get(prefix) ?? []).map((item) => {
        if (item.type === 'folder') {
          return buildTree(item.prefix, item.name, openPrefixes, itemsByPrefix, statusMap);
        }
        return {
          id: fileKeyToId(item.key),
          name: item.name,
          type: 'file' as const,
          item,
          loadStatus: 'loaded' as const,
        };
      })
    : [];

  return {
    id: prefixToId(prefix),
    name,
    type: prefix === '' ? 'bucket' : 'folder',
    prefix,
    loadStatus: status,
    children,
  };
}

function TreeNodeRow({ node, style }: NodeRendererProps<TreeNodeData>) {
  const { onPathChange, currentPrefix, activeFileKey, setActiveFile } = useBrowser();
  const isFolderish = node.data.type === 'bucket' || node.data.type === 'folder';
  const fileItem =
    node.data.type === 'file' && node.data.item?.type === 'file' ? node.data.item : null;
  const prefix = node.data.prefix ?? '';
  const isActiveFolder = isFolderish && currentPrefix === prefix && !activeFileKey;
  const isActiveFile = activeFileKey === fileItem?.key;
  const isActive = isActiveFolder || isActiveFile;
  const isLoading = node.data.loadStatus === 'loading';
  const isError = node.data.loadStatus === 'error';
  const hasChevron = isFolderish;

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    node.toggle();
  };

  const handleNodeClick = () => {
    if (fileItem) {
      const key = fileItem.key;
      const parent = key.includes('/') ? key.split('/').slice(0, -1) : [];
      if (parent.join('/') + (parent.length ? '/' : '') !== currentPrefix) {
        onPathChange(parent);
      }
      setActiveFile(fileItem);
      return;
    }
    const segs = prefix ? prefix.replace(/\/$/, '').split('/').filter(Boolean) : [];
    onPathChange(segs);
  };

  const kind = node.data.type === 'file' ? fileKind(node.data.name) : 'folder';
  const Icon =
    node.data.type === 'file' ? getFileKindIcon(kind, false) : getFolderIcon(node.isOpen);

  return (
    <div
      style={style}
      className={cn(
        'group relative flex items-center rounded-md text-[14px] leading-none',
        'cursor-pointer select-none transition-colors duration-100',
        isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/55',
      )}
      title={fileItem ? fileItem.key : prefix || node.data.name}
    >
      {isActive && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" />
      )}

      {Array.from({ length: node.level }).map((_, i) => (
        <span key={i} className="relative h-full w-3 shrink-0">
          <span className="absolute left-1/2 top-0 bottom-0 w-px bg-border/70" />
        </span>
      ))}

      <button
        className={cn(
          'ml-1 flex h-6 w-5 shrink-0 items-center justify-center rounded text-muted-foreground',
          'hover:bg-muted hover:text-foreground',
          !hasChevron && 'invisible',
        )}
        onClick={handleChevronClick}
        tabIndex={-1}
        aria-label={node.isOpen ? 'Collapse folder' : 'Expand folder'}
      >
        {isLoading ? (
          <SyncIcon size={11} className="animate-spin" />
        ) : node.isOpen ? (
          <ChevronDownIcon size={12} />
        ) : (
          <ChevronRightIcon size={12} />
        )}
      </button>

      <button
        className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md bg-transparent py-0 pr-2 text-left font-[inherit] text-[inherit] leading-[1.5]"
        onClick={handleNodeClick}
      >
        <span
          className={cn(
            'shrink-0',
            kind === 'folder' ? 'text-primary' : iconColorClass[kind],
            isError && 'text-destructive',
          )}
        >
          {isError ? <KebabHorizontalIcon size={14} /> : createElement(Icon, { size: 15 })}
        </span>
        <span className={cn('truncate', isActive && 'font-semibold')}>
          {node.data.name}
          {node.data.type === 'folder' ? '/' : ''}
        </span>
      </button>
    </div>
  );
}

function readPersistedWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH;
  const raw = window.localStorage.getItem('s3-browser.fb.treeWidth');
  const value = raw ? Number.parseInt(raw, 10) : DEFAULT_WIDTH;
  if (!Number.isFinite(value)) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
}

export function TreePane() {
  const {
    http,
    bucket,
    currentPrefix,
    activeFile,
    activeFileKey,
    treeCollapsed,
    setTreeCollapsed,
    isNarrow,
    treeDrawerOpen,
    setTreeDrawerOpen,
  } = useBrowser();
  const baseUrl = http.defaults.baseURL ?? '';
  const treeRef = useRef<TreeApi<TreeNodeData> | null>(null);
  const [treeDims, setTreeDims] = useState({ width: DEFAULT_WIDTH, height: 400 });
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  // Callback ref re-attaches the ResizeObserver every time the underlying
  // DOM node changes — needed because the tree container lives inside both
  // the inline sidebar and the drawer overlay, which mount different nodes.
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    if (!node) {
      resizeObserverRef.current = null;
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setTreeDims({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      });
    });
    ro.observe(node);
    resizeObserverRef.current = ro;
  }, []);
  const [width, setWidth] = useState(readPersistedWidth);
  const [manualOpenPrefixes, setManualOpenPrefixes] = useState<Set<string>>(() => new Set(['']));
  const dragStart = useRef<{ x: number; width: number } | null>(null);

  const openPrefixes = useMemo(() => {
    const next = new Set(manualOpenPrefixes);
    for (const p of prefixAncestors(currentPrefix)) next.add(p);
    if (activeFile?.key) {
      const parentPrefix = activeFile.key.includes('/')
        ? `${activeFile.key.split('/').slice(0, -1).join('/')}/`
        : '';
      for (const p of prefixAncestors(parentPrefix)) next.add(p);
    }
    return next;
  }, [activeFile, currentPrefix, manualOpenPrefixes]);

  const prefixList = useMemo(() => Array.from(openPrefixes), [openPrefixes]);
  const queries = useQueries({
    queries: prefixList.map((prefix) => ({
      queryKey: treePrefixQueryKey(baseUrl, prefix),
      queryFn: () => fetchPrefixPages(http, prefix, '/'),
      staleTime: 30_000,
      retry: false,
    })),
  });

  const { itemsByPrefix, statusMap } = useMemo(() => {
    const items = new Map<string, ListItem[]>();
    const statuses = new Map<string, 'idle' | 'loading' | 'loaded' | 'error'>();
    prefixList.forEach((prefix, i) => {
      const q = queries[i];
      if (!q) return;
      if (q.isLoading || q.isFetching) statuses.set(prefix, 'loading');
      else if (q.isError) statuses.set(prefix, 'error');
      else if (q.isSuccess) {
        statuses.set(prefix, 'loaded');
        items.set(prefix, pagesToItems(q.data ?? [], prefix));
      } else {
        statuses.set(prefix, 'idle');
      }
    });
    return { itemsByPrefix: items, statusMap: statuses };
  }, [prefixList, queries]);

  // The bucket name lives in the breadcrumb already — render the bucket's
  // children directly as the top-level tree nodes (GitHub-style).
  const treeData = useMemo(
    () => buildTree('', bucket, openPrefixes, itemsByPrefix, statusMap).children ?? [],
    [bucket, itemsByPrefix, openPrefixes, statusMap],
  );

  const rootStatus = statusMap.get('') ?? 'idle';

  // Selection: at bucket root, nothing in the tree should highlight (the
  // root is the implicit "this whole bucket"). Otherwise highlight the
  // active file or current prefix.
  const treeSelection = activeFileKey
    ? fileKeyToId(activeFileKey)
    : currentPrefix === ''
      ? undefined
      : prefixToId(currentPrefix);

  useEffect(() => {
    if (!treeSelection) return;
    treeRef.current?.openParents(treeSelection);
    treeRef.current?.scrollTo(treeSelection, 'smart');
  }, [treeSelection, treeData]);

  const handleToggle = useCallback((id: string) => {
    if (isFileId(id)) return;
    const prefix = idToPrefix(id);
    setManualOpenPrefixes((prev) => {
      if (prev.has(prefix)) return prev;
      const next = new Set(prev);
      next.add(prefix);
      return next;
    });
  }, []);

  const handleResizeStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragStart.current = { x: e.clientX, width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const next = Math.min(
      MAX_WIDTH,
      Math.max(MIN_WIDTH, dragStart.current.width + e.clientX - dragStart.current.x),
    );
    setWidth(next);
  };

  const handleResizeEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    dragStart.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    window.localStorage.setItem('s3-browser.fb.treeWidth', String(width));
  };

  // ---------- Narrow viewport: render as overlay drawer ----------
  if (isNarrow) {
    if (!treeDrawerOpen) return null;

    return (
      <>
        <div
          className="absolute inset-0 z-30 bg-foreground/30 animate-in fade-in duration-150"
          onClick={() => setTreeDrawerOpen(false)}
          aria-hidden="true"
        />
        <aside className="absolute left-0 top-0 z-40 flex h-full w-[min(86vw,360px)] flex-col border-r border-border bg-card shadow-2xl animate-in slide-in-from-left duration-150">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/60 px-4">
            <span className="inline-flex items-center gap-2 text-[14px] font-bold tracking-wider text-muted-foreground">
              Files
            </span>
            <div className="flex items-center gap-0.5">
              <button
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
                onClick={() => setTreeDrawerOpen(false)}
                title="Close file tree"
                aria-label="Close file tree"
              >
                <XIcon size={14} />
              </button>
            </div>
          </div>

          <div ref={containerRef} className="min-h-0 flex-1 px-2 pb-3">
            <Tree<TreeNodeData>
              ref={treeRef}
              data={treeData}
              idAccessor="id"
              childrenAccessor={(d) => d.children ?? null}
              selection={treeSelection}
              disableMultiSelection
              disableDrag
              rowHeight={30}
              indent={14}
              width={treeDims.width}
              height={treeDims.height}
              onToggle={handleToggle}
              openByDefault={false}
            >
              {TreeNodeRow}
            </Tree>
            {treeData.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-muted-foreground">
                {rootStatus === 'loading'
                  ? 'Loading…'
                  : rootStatus === 'error'
                    ? 'Failed to load'
                    : 'Empty bucket'}
              </div>
            )}
          </div>
        </aside>
      </>
    );
  }

  // ---------- Wide viewport: inline sidebar (collapsed or expanded) ----------
  if (treeCollapsed) {
    return null;
  }

  return (
    <aside
      className="relative flex min-w-0 shrink-0 flex-col border-r border-border bg-card/35"
      style={{ width }}
    >
      <div className="flex h-11 shrink-0 items-center px-4 gap-2">
        <button
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          onClick={() => setTreeCollapsed(true)}
          title="Collapse file tree"
          aria-label="Collapse file tree"
        >
          <SidebarExpandIcon size={15} />
        </button>
        <span className="inline-flex items-center gap-2 text-[14px] font-bold tracking-wider text-muted-foreground">
          Files
        </span>
      </div>

      <div ref={containerRef} className="min-h-0 flex-1 px-2 pb-3">
        <Tree<TreeNodeData>
          ref={treeRef}
          data={treeData}
          idAccessor="id"
          childrenAccessor={(d) => d.children ?? null}
          selection={treeSelection}
          disableMultiSelection
          disableDrag
          rowHeight={30}
          indent={14}
          width={treeDims.width}
          height={treeDims.height}
          onToggle={handleToggle}
          openByDefault={false}
        >
          {TreeNodeRow}
        </Tree>
        {treeData.length === 0 && (
          <div className="px-3 py-2 text-[12px] text-muted-foreground">
            {rootStatus === 'loading'
              ? 'Loading…'
              : rootStatus === 'error'
                ? 'Failed to load'
                : 'Empty bucket'}
          </div>
        )}
      </div>

      <div
        className="absolute right-[-3px] top-0 h-full w-1.5 cursor-col-resize touch-none bg-transparent hover:bg-primary/20"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        aria-hidden="true"
      />
    </aside>
  );
}
