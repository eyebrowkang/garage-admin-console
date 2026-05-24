/**
 * <FileBrowser/> — the embedded component exposed via Module Federation.
 *
 * Honors §2.5 of designs/mf-integration-plan.md:
 *   - props-driven path, NO internal router
 *   - NEVER imports @aws-sdk/*
 *   - NEVER reads auth tokens or credentials from localStorage/window/env
 *   - All S3-protocol details live in the BFF behind props.backend.baseUrl
 *
 * Ported faithfully from designs/s3-browser/project/src/Browser.jsx
 * (list / details / grid views + preview pane + bulk bar + drag-drop +
 *  breadcrumbs + lazy tree + search + sort).
 */
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import axios, { type AxiosInstance } from 'axios';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Columns,
  Copy as CopyIcon,
  Download,
  Edit,
  Eye,
  Filter as FilterIcon,
  Folder,
  FolderOpen,
  Grid,
  Link as LinkIcon,
  List as ListIcon,
  Lock,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';

import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
} from '@garage/ui';

import type { ListResult, PresignResult, S3Object, UploadResult } from '@/lib/types';
import {
  basename,
  fileIconClass,
  fileKind,
  formatBytes,
  formatDate,
  getFileIcon,
} from '@/lib/format';

/**
 * Render a file/folder icon. Wrapping the lookup in createElement avoids the
 * "Cannot create components during render" lint rule that fires when a
 * PascalCase const is assigned a component reference inside render.
 */
function FileTypeIcon({
  isFolder,
  name,
  size = 14,
}: {
  isFolder: boolean;
  name: string;
  size?: number;
}) {
  return createElement(getFileIcon(isFolder, name), { size });
}

import './FileBrowser.css';

// ---------------------------------------------------------------------------
// Public contract — §2.5
// ---------------------------------------------------------------------------

export interface FileBrowserProps {
  /** Bucket Backend API endpoint. baseUrl already encodes the bucket. */
  backend: {
    baseUrl: string;
    authToken: string;
  };
  /** Display-only — baseUrl already encodes which bucket we're in. */
  bucket: string;
  /** Path segments (empty array = bucket root). Controlled by parent. */
  path: string[];
  onPathChange: (path: string[]) => void;
  viewMode?: 'list' | 'details' | 'grid';
  density?: 'compact' | 'comfortable';
  showPreview?: boolean;
  onSelect?: (items: S3Object[]) => void;
  onError?: (err: Error) => void;
}

// ---------------------------------------------------------------------------
// Top-level wrapper — owns the embedded QueryClient (per §2.6: not shared)
// ---------------------------------------------------------------------------

export function FileBrowser(props: FileBrowserProps) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false, staleTime: 5_000 },
        },
      }),
    [],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <FileBrowserInner {...props} />
    </QueryClientProvider>
  );
}

export default FileBrowser;

// ---------------------------------------------------------------------------
// Inner component
// ---------------------------------------------------------------------------

type ListItem =
  | { type: 'folder'; name: string; prefix: string }
  | { type: 'file'; name: string; key: string; object: S3Object };

type SortKey = 'name' | 'size' | 'modified' | 'class';
interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

function FileBrowserInner({
  backend,
  bucket,
  path,
  onPathChange,
  viewMode = 'list',
  showPreview = true,
  onSelect,
  onError,
}: FileBrowserProps) {
  // Stable axios instance for this backend + token.
  const http = useMemo<AxiosInstance>(
    () =>
      axios.create({
        baseURL: backend.baseUrl,
        headers: { Authorization: `Bearer ${backend.authToken}` },
        // Allow large multipart uploads to stream through axios.
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }),
    [backend.baseUrl, backend.authToken],
  );

  const qc = useQueryClient();
  const currentPrefix = path.length === 0 ? '' : path.join('/') + '/';

  // ---- list query (current folder) ----
  const listQuery = useQuery({
    queryKey: ['list', backend.baseUrl, currentPrefix],
    queryFn: async (): Promise<ListResult> => {
      const res = await http.get<ListResult>('/list', {
        params: { prefix: currentPrefix, delimiter: '/' },
      });
      return res.data;
    },
  });

  // Surface listing errors to the parent.
  useEffect(() => {
    if (listQuery.error) onError?.(listQuery.error as Error);
  }, [listQuery.error, onError]);

  // ---- normalized items ----
  const items: ListItem[] = useMemo(() => {
    const data = listQuery.data;
    if (!data) return [];
    const out: ListItem[] = [];
    for (const p of data.prefixes) {
      // Strip leading currentPrefix and trailing slash.
      const inner = p.startsWith(currentPrefix) ? p.slice(currentPrefix.length) : p;
      const name = inner.replace(/\/$/, '');
      if (!name) continue;
      out.push({ type: 'folder', name, prefix: p });
    }
    for (const o of data.objects) {
      const inner = o.key.startsWith(currentPrefix) ? o.key.slice(currentPrefix.length) : o.key;
      // Skip "directory placeholder" objects (keys ending in /).
      if (!inner || inner.endsWith('/')) continue;
      out.push({ type: 'file', name: inner, key: o.key, object: o });
    }
    return out;
  }, [listQuery.data, currentPrefix]);

  // ---- search + sort ----
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter((it) => it.name.toLowerCase().includes(q));
  }, [items, query]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      let av: string | number = '';
      let bv: string | number = '';
      if (sort.key === 'name') {
        av = a.name;
        bv = b.name;
      } else if (sort.key === 'size') {
        av = a.type === 'file' ? a.object.size : 0;
        bv = b.type === 'file' ? b.object.size : 0;
      } else if (sort.key === 'modified') {
        av = a.type === 'file' ? a.object.lastModified || '' : '';
        bv = b.type === 'file' ? b.object.lastModified || '' : '';
      } else if (sort.key === 'class') {
        av = a.type === 'file' ? a.object.storageClass || '' : '';
        bv = b.type === 'file' ? b.object.storageClass || '' : '';
      }
      if (av < bv) return sort.dir === 'asc' ? -1 : 1;
      if (av > bv) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sort]);

  const handleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );
  };

  // ---- selection ----
  // Selection state — keyed on the current location so we get fresh sets
  // whenever the user navigates without needing an effect-driven reset.
  const locationKey = `${bucket}::${currentPrefix}`;
  const [selectionState, setSelectionState] = useState<{
    key: string;
    selected: Set<string>;
    focused: string | null;
  }>({ key: locationKey, selected: new Set(), focused: null });
  const current =
    selectionState.key === locationKey
      ? selectionState
      : { key: locationKey, selected: new Set<string>(), focused: null };
  const selected = current.selected;
  const focused = current.focused;
  const setSelected = useCallback(
    (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      setSelectionState((prev) => {
        const base =
          prev.key === locationKey
            ? prev
            : { key: locationKey, selected: new Set<string>(), focused: null };
        const next = typeof updater === 'function' ? updater(base.selected) : updater;
        return { ...base, selected: next };
      });
    },
    [locationKey],
  );
  const setFocused = useCallback(
    (name: string | null) => {
      setSelectionState((prev) => {
        const base =
          prev.key === locationKey
            ? prev
            : { key: locationKey, selected: new Set<string>(), focused: null };
        return { ...base, focused: name };
      });
    },
    [locationKey],
  );

  // Notify parent on selection change.
  useEffect(() => {
    if (!onSelect) return;
    const picked: S3Object[] = [];
    for (const it of sorted) {
      if (it.type === 'file' && selected.has(it.name)) picked.push(it.object);
    }
    onSelect(picked);
  }, [selected, sorted, onSelect]);

  const toggleSel = (name: string, e?: MouseEvent | ReactMouseEvent | KeyboardEvent) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (e?.shiftKey && focused) {
        const i1 = sorted.findIndex((c) => c.name === focused);
        const i2 = sorted.findIndex((c) => c.name === name);
        const [a, b] = i1 < i2 ? [i1, i2] : [i2, i1];
        for (let i = a; i <= b; i++) next.add(sorted[i]!.name);
      } else if (e && (e.metaKey || e.ctrlKey)) {
        if (next.has(name)) next.delete(name);
        else next.add(name);
      } else {
        if (next.has(name) && next.size === 1) {
          next.delete(name);
        } else {
          next.clear();
          next.add(name);
        }
      }
      return next;
    });
    setFocused(name);
  };

  const toggleSelAll = () => {
    setSelected((prev) => {
      if (prev.size === sorted.length) return new Set();
      return new Set(sorted.map((c) => c.name));
    });
  };

  const allSelected = sorted.length > 0 && selected.size === sorted.length;
  const someSelected = selected.size > 0 && !allSelected;

  const focusedItem = useMemo(() => {
    if (focused) {
      const m = sorted.find((c) => c.name === focused);
      if (m) return m;
    }
    if (selected.size === 1) {
      const only = sorted.find((c) => selected.has(c.name));
      if (only) return only;
    }
    return null;
  }, [sorted, focused, selected]);

  const openItem = (item: ListItem) => {
    if (item.type === 'folder') {
      onPathChange([...path, item.name]);
    } else {
      setSelected(new Set([item.name]));
      setFocused(item.name);
    }
  };

  // ---- tree state ----
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['']));

  const toggleFolder = (prefix: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  };

  // ---- modals ----
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [presignOpen, setPresignOpen] = useState(false);
  const [presignItem, setPresignItem] = useState<ListItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteItems, setDeleteItems] = useState<ListItem[]>([]);

  const openUpload = (files: File[] | null) => {
    setUploadFiles(files ?? []);
    setUploadOpen(true);
  };
  const openPresign = (item: ListItem | null) => {
    setPresignItem(item);
    setPresignOpen(true);
  };
  const openDelete = (item: ListItem | null) => {
    if (item) {
      setDeleteItems([item]);
    } else {
      // Use current selection.
      const picked = sorted.filter((c) => selected.has(c.name));
      setDeleteItems(picked);
    }
    setDeleteOpen(true);
  };

  // ---- drag-and-drop upload ----
  const [dragOver, setDragOver] = useState(false);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) {
      openUpload(Array.from(e.dataTransfer.files));
    }
  };

  // ---- mutations: refresh listing after writes ----
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['list', backend.baseUrl] });
    qc.invalidateQueries({ queryKey: ['tree', backend.baseUrl] });
  };

  // ---- footer totals (current folder only — no recursive walk) ----
  const totals = useMemo(() => {
    let count = 0;
    let size = 0;
    for (const it of sorted) {
      if (it.type === 'file') {
        count += 1;
        size += it.object.size;
      }
    }
    return { count, size };
  }, [sorted]);

  return (
    <div className="fb-root">
      <div className="main">
        <Toolbar
          bucket={bucket}
          path={path}
          onPathChange={onPathChange}
          query={query}
          setQuery={setQuery}
          viewMode={viewMode}
          onOpenUpload={() => openUpload(null)}
        />

        <div className="browser" data-preview={showPreview && focusedItem?.type === 'file'}>
          <TreePane
            http={http}
            bucket={bucket}
            currentPrefix={currentPrefix}
            expanded={expandedFolders}
            onToggle={toggleFolder}
            onPathChange={onPathChange}
          />

          <div className="flist">
            <div className="flist__bar">
              <div className="flist__sel">
                <input
                  type="checkbox"
                  className="ckbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleSelAll}
                  aria-label="Select all"
                />
                {selected.size > 0 ? (
                  <span>
                    <strong>{selected.size}</strong> selected
                  </span>
                ) : (
                  <span>
                    <strong>{sorted.length}</strong> items
                  </span>
                )}
              </div>
              <div className="spacer" />
              <Button variant="ghost" size="sm">
                <FilterIcon /> Filter
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleSort(sort.key)}>
                <ArrowUpDown /> {sort.dir === 'asc' ? 'Asc' : 'Desc'}
              </Button>
            </div>

            <div
              className="flist__body"
              data-dragging={dragOver}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setDragOver(false);
              }}
              onDrop={onDrop}
            >
              {listQuery.isLoading && (
                <div className="fempty">
                  <p>Loading…</p>
                </div>
              )}

              {listQuery.error && !listQuery.isLoading && (
                <div className="fempty">
                  <h3>Failed to list objects</h3>
                  <p>{(listQuery.error as Error).message}</p>
                  <Button variant="outline" onClick={() => listQuery.refetch()}>
                    Retry
                  </Button>
                </div>
              )}

              {!listQuery.isLoading && !listQuery.error && (
                <>
                  {viewMode === 'grid' ? (
                    <GridView
                      items={sorted}
                      selected={selected}
                      focused={focused}
                      onToggle={toggleSel}
                      onOpen={openItem}
                    />
                  ) : (
                    <ListView
                      compact={viewMode === 'details'}
                      items={sorted}
                      selected={selected}
                      focused={focused}
                      onToggle={toggleSel}
                      onOpen={openItem}
                      sort={sort}
                      onSort={handleSort}
                      onShare={(it) => {
                        setSelected(new Set([it.name]));
                        setFocused(it.name);
                        openPresign(it);
                      }}
                      onDelete={(it) => {
                        setSelected(new Set([it.name]));
                        setFocused(it.name);
                        openDelete(it);
                      }}
                    />
                  )}

                  {sorted.length === 0 && (
                    <div className="fempty">
                      <div className="fempty__icon">
                        {query ? <Search size={28} /> : <FolderOpen size={28} />}
                      </div>
                      {query ? (
                        <>
                          <h3>No matches for &ldquo;{query}&rdquo;</h3>
                          <p>Try a different search or clear the filter.</p>
                          <Button variant="outline" onClick={() => setQuery('')}>
                            Clear search
                          </Button>
                        </>
                      ) : (
                        <>
                          <h3>This folder is empty</h3>
                          <p>Drag files here to upload, or use the upload button.</p>
                          <Button onClick={() => openUpload(null)}>
                            <UploadCloud /> Upload files
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {selected.size > 1 && (
                    <BulkBar
                      count={selected.size}
                      onClear={() => setSelected(new Set())}
                      onShare={() => openPresign(null)}
                      onDelete={() => openDelete(null)}
                    />
                  )}
                </>
              )}
            </div>

            <div className="flist__status">
              <span>
                <strong>{totals.count.toLocaleString()}</strong> objects
              </span>
              <span className="sep">·</span>
              <span>
                <strong>{formatBytes(totals.size)}</strong> in this folder
              </span>
              <div className="spacer" />
              <span className="mono">
                {bucket}/{currentPrefix}
              </span>
            </div>
          </div>

          {showPreview && focusedItem?.type === 'file' && (
            <PreviewPane
              item={focusedItem}
              bucket={bucket}
              path={path}
              onShare={() => openPresign(focusedItem)}
              onDelete={() => openDelete(focusedItem)}
              http={http}
            />
          )}
        </div>
      </div>

      <UploadDialog
        open={uploadOpen}
        files={uploadFiles}
        prefix={currentPrefix}
        http={http}
        onClose={() => setUploadOpen(false)}
        onComplete={refresh}
      />

      <PresignDialog
        open={presignOpen}
        item={presignItem}
        http={http}
        onClose={() => setPresignOpen(false)}
      />

      <DeleteDialog
        open={deleteOpen}
        items={deleteItems}
        http={http}
        onClose={() => setDeleteOpen(false)}
        onComplete={() => {
          setSelected(new Set());
          refresh();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar (breadcrumbs + search + view toggle + upload)
// ---------------------------------------------------------------------------

function Toolbar({
  bucket,
  path,
  onPathChange,
  query,
  setQuery,
  onOpenUpload,
}: {
  bucket: string;
  path: string[];
  onPathChange: (p: string[]) => void;
  query: string;
  setQuery: (q: string) => void;
  viewMode: 'list' | 'details' | 'grid';
  onOpenUpload: () => void;
}) {
  return (
    <div className="tbar">
      <div className="crumb">
        <button className="crumb__item crumb__root" onClick={() => onPathChange([])}>
          <Folder size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
          {bucket}
        </button>
        {path.map((seg, i) => (
          <span key={`${i}:${seg}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <span className="crumb__sep">
              <ChevronRight size={13} />
            </span>
            <button
              className={cn('crumb__item', i === path.length - 1 && 'crumb__item--current')}
              onClick={() => {
                if (i < path.length - 1) onPathChange(path.slice(0, i + 1));
              }}
            >
              {seg}
            </button>
          </span>
        ))}
      </div>

      <div className="search">
        <Search size={14} className="search__icon" />
        <input
          placeholder="Filter in this folder…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>⌘F</kbd>
      </div>

      <Button variant="outline">
        <Plus /> New folder
      </Button>
      <Button onClick={onOpenUpload}>
        <UploadCloud /> Upload
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree pane (lazy-loaded folders)
// ---------------------------------------------------------------------------

function TreePane({
  http,
  bucket,
  currentPrefix,
  expanded,
  onToggle,
  onPathChange,
}: {
  http: AxiosInstance;
  bucket: string;
  currentPrefix: string;
  expanded: Set<string>;
  onToggle: (prefix: string) => void;
  onPathChange: (p: string[]) => void;
}) {
  return (
    <div className="tree">
      <div className="tree__head">Folders</div>
      <TreeNode
        http={http}
        prefix=""
        label={bucket}
        depth={0}
        currentPrefix={currentPrefix}
        expanded={expanded}
        onToggle={onToggle}
        onPathChange={onPathChange}
      />
    </div>
  );
}

function TreeNode({
  http,
  prefix,
  label,
  depth,
  currentPrefix,
  expanded,
  onToggle,
  onPathChange,
}: {
  http: AxiosInstance;
  prefix: string;
  label: string;
  depth: number;
  currentPrefix: string;
  expanded: Set<string>;
  onToggle: (p: string) => void;
  onPathChange: (p: string[]) => void;
}) {
  const isOpen = expanded.has(prefix);

  // Only fetch children when this node is open (lazy expansion).
  const q = useQuery({
    queryKey: ['tree', http.defaults.baseURL, prefix],
    enabled: isOpen,
    queryFn: async () => {
      const res = await http.get<ListResult>('/list', {
        params: { prefix, delimiter: '/', maxKeys: 1000 },
      });
      return res.data.prefixes;
    },
  });

  const isActive = currentPrefix === prefix;
  const hasChildren = (q.data?.length ?? 0) > 0 || !q.isFetched;

  const handleSelect = () => {
    const segs = prefix ? prefix.replace(/\/$/, '').split('/') : [];
    onPathChange(segs);
  };

  return (
    <div>
      <button
        className={cn('tnode', isActive && 'tnode--active')}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={handleSelect}
        onDoubleClick={() => onToggle(prefix)}
      >
        <span
          className={cn(
            'tnode__chev',
            isOpen && 'tnode__chev--open',
            !hasChildren && 'tnode__chev--empty',
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(prefix);
          }}
        >
          <ChevronRight size={11} />
        </span>
        <span className="tnode__icon">
          {depth === 0 ? (
            <Folder size={14} />
          ) : isOpen ? (
            <FolderOpen size={14} />
          ) : (
            <Folder size={14} />
          )}
        </span>
        <span className="tnode__name">{label}</span>
      </button>
      {isOpen &&
        (q.data ?? []).map((childPrefix) => {
          const inner = childPrefix.startsWith(prefix)
            ? childPrefix.slice(prefix.length)
            : childPrefix;
          const name = inner.replace(/\/$/, '');
          if (!name) return null;
          return (
            <TreeNode
              key={childPrefix}
              http={http}
              prefix={childPrefix}
              label={name}
              depth={depth + 1}
              currentPrefix={currentPrefix}
              expanded={expanded}
              onToggle={onToggle}
              onPathChange={onPathChange}
            />
          );
        })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List + Details views (details is the same with `--rowH` override)
// ---------------------------------------------------------------------------

function ListView({
  compact,
  items,
  selected,
  focused,
  onToggle,
  onOpen,
  sort,
  onSort,
  onShare,
  onDelete,
}: {
  compact: boolean;
  items: ListItem[];
  selected: Set<string>;
  focused: string | null;
  onToggle: (name: string, e?: ReactMouseEvent) => void;
  onOpen: (item: ListItem) => void;
  sort: SortState;
  onSort: (key: SortKey) => void;
  onShare: (it: ListItem) => void;
  onDelete: (it: ListItem) => void;
}) {
  return (
    <div style={{ ['--rowH' as string]: compact ? '32px' : '40px' } as React.CSSProperties}>
      <div className="flist__head">
        <span />
        <button data-sorted={sort.key === 'name'} onClick={() => onSort('name')}>
          Name{' '}
          {sort.key === 'name' &&
            (sort.dir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
        </button>
        <button data-sorted={sort.key === 'modified'} onClick={() => onSort('modified')}>
          Modified{' '}
          {sort.key === 'modified' &&
            (sort.dir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
        </button>
        <button data-sorted={sort.key === 'size'} onClick={() => onSort('size')}>
          Size{' '}
          {sort.key === 'size' &&
            (sort.dir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
        </button>
        <button data-sorted={sort.key === 'class'} onClick={() => onSort('class')}>
          Class
        </button>
        <span />
      </div>
      {items.map((item) => (
        <FileRow
          key={item.name}
          item={item}
          selected={selected.has(item.name)}
          focused={focused === item.name}
          onToggle={onToggle}
          onOpen={onOpen}
          onShare={onShare}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function FileRow({
  item,
  selected,
  focused,
  onToggle,
  onOpen,
  onShare,
  onDelete,
}: {
  item: ListItem;
  selected: boolean;
  focused: boolean;
  onToggle: (name: string, e?: ReactMouseEvent) => void;
  onOpen: (item: ListItem) => void;
  onShare: (it: ListItem) => void;
  onDelete: (it: ListItem) => void;
}) {
  const iconCls = fileIconClass(item.type === 'folder', item.name);
  const meta = item.type === 'file' ? item.object : null;
  return (
    <div
      className="flist__row"
      data-selected={selected}
      data-focused={focused}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, input')) return;
        onToggle(item.name, e);
      }}
      onDoubleClick={() => onOpen(item)}
    >
      <input
        type="checkbox"
        className="ckbox"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          onToggle(item.name, e.nativeEvent as unknown as ReactMouseEvent);
        }}
        aria-label={`Select ${item.name}`}
      />
      <div className="fname">
        <span className={'fname__icon ' + iconCls}>
          <FileTypeIcon isFolder={item.type === 'folder'} name={item.name} size={13} />
        </span>
        <span className={cn('fname__text', item.type === 'folder' && 'fname__text--folder')}>
          {item.name}
        </span>
      </div>
      <span className="fmeta">{meta ? formatDate(meta.lastModified) : '—'}</span>
      <span className="fmeta mono">{meta ? formatBytes(meta.size) : '—'}</span>
      <span>
        {meta && (
          <span
            className={cn(
              'fclass',
              meta.storageClass === 'STANDARD_IA' && 'fclass--ia',
              meta.storageClass === 'GLACIER' && 'fclass--glacier',
            )}
          >
            {meta.storageClass === 'STANDARD_IA'
              ? 'IA'
              : meta.storageClass === 'GLACIER'
                ? 'Glacier'
                : 'Standard'}
          </span>
        )}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => e.stopPropagation()}
            aria-label="Actions"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {item.type === 'file' && (
            <>
              <DropdownMenuItem>
                <Download /> Download
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onShare(item)}>
                <LinkIcon /> Share link…
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Eye /> Open in preview
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem>
            <Edit /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem>
            <CopyIcon /> Copy path
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => onDelete(item)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grid view
// ---------------------------------------------------------------------------

function GridView({
  items,
  selected,
  focused,
  onToggle,
  onOpen,
}: {
  items: ListItem[];
  selected: Set<string>;
  focused: string | null;
  onToggle: (name: string, e?: ReactMouseEvent) => void;
  onOpen: (item: ListItem) => void;
}) {
  return (
    <div className="fgrid">
      {items.map((item) => {
        const iconCls = fileIconClass(item.type === 'folder', item.name);
        const meta = item.type === 'file' ? item.object : null;
        return (
          <div
            key={item.name}
            className="fcard"
            data-selected={selected.has(item.name)}
            data-focused={focused === item.name}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('input')) return;
              onToggle(item.name, e);
            }}
            onDoubleClick={() => onOpen(item)}
          >
            <input
              type="checkbox"
              className="ckbox fcard__ck"
              checked={selected.has(item.name)}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onToggle(item.name, e.nativeEvent as unknown as ReactMouseEvent)}
              aria-label={`Select ${item.name}`}
            />
            <div className="fcard__thumb">
              <span
                className={'fname__icon ' + iconCls}
                style={{ width: 44, height: 44, borderRadius: 10 }}
              >
                <FileTypeIcon isFolder={item.type === 'folder'} name={item.name} size={22} />
              </span>
            </div>
            <div className="fcard__name">{item.name}</div>
            <div className="fcard__meta">{meta ? formatBytes(meta.size) : 'folder'}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview pane
// ---------------------------------------------------------------------------

function PreviewPane({
  item,
  bucket,
  path,
  onShare,
  onDelete,
  http,
}: {
  item: ListItem;
  bucket: string;
  path: string[];
  onShare: () => void;
  onDelete: () => void;
  http: AxiosInstance;
}) {
  if (item.type !== 'file') return null;
  const file = item.object;
  const kind = fileKind(item.name);
  const fullPath = [bucket, ...path, item.name].join('/');

  const download = async () => {
    try {
      const res = await http.post<PresignResult>('/presign', {
        key: file.key,
        operation: 'getObject',
        expiresIn: 300,
      });
      window.open(res.data.url, '_blank', 'noopener,noreferrer');
    } catch {
      // swallow — toast wiring lives at the standalone-app layer.
    }
  };

  return (
    <aside className="preview">
      <div className="preview__head">
        <h3 title={item.name}>{item.name}</h3>
      </div>
      <div className="preview__body">
        <div className="preview__thumb">
          <PreviewIcon kind={kind} />
        </div>
        <div className="preview__title">{item.name}</div>
        <div className="preview__path">{fullPath}</div>

        <div className="preview__actions" style={{ marginBottom: 18 }}>
          <Button onClick={onShare}>
            <LinkIcon /> Generate share link
          </Button>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="outline" onClick={download} style={{ flex: 1 }}>
              <Download /> Download
            </Button>
            <Button variant="outline" onClick={onDelete} style={{ flex: 1 }}>
              <Trash2 /> Delete
            </Button>
          </div>
        </div>

        <div className="preview__section">
          <div className="preview__label">Properties</div>
          <dl className="preview__kv">
            <dt>Size</dt>
            <dd>{formatBytes(file.size)}</dd>
            <dt>Modified</dt>
            <dd>{formatDate(file.lastModified)}</dd>
            <dt>Class</dt>
            <dd>{file.storageClass ?? 'STANDARD'}</dd>
            <dt>ETag</dt>
            <dd className="mono" style={{ fontSize: 11 }}>
              &quot;{file.etag}&quot;
            </dd>
          </dl>
        </div>

        <div className="preview__section">
          <div className="preview__label">Permissions</div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span className="pill pill--neutral">
              <Lock size={11} /> Private
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function PreviewIcon({ kind }: { kind: ReturnType<typeof fileKind> }) {
  // Use the same lucide icon set as the list view. Routed through
  // createElement so the React 19 lint rule on PascalCase component refs
  // stays happy.
  return createElement(getFileIcon(false, `_.${kind === 'file' ? 'bin' : kind}`), { size: 48 });
}

// ---------------------------------------------------------------------------
// Bulk action bar
// ---------------------------------------------------------------------------

function BulkBar({
  count,
  onClear,
  onShare,
  onDelete,
}: {
  count: number;
  onClear: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bulkbar">
      <strong>{count}</strong>
      <span style={{ opacity: 0.7 }}>selected</span>
      <span className="bulkbar__divider" />
      <button onClick={onShare}>
        <LinkIcon size={14} /> Share
      </button>
      <button className="danger" onClick={onDelete}>
        <Trash2 size={14} /> Delete
      </button>
      <span className="bulkbar__divider" />
      <button onClick={onClear} title="Clear selection (Esc)">
        ✕
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modals — kept in-file so the embedded surface is self-contained
// ---------------------------------------------------------------------------

interface UploadDialogProps {
  open: boolean;
  files: File[];
  prefix: string;
  http: AxiosInstance;
  onClose: () => void;
  onComplete: () => void;
}

function UploadDialog(props: UploadDialogProps) {
  // Render nothing when closed so internal state resets via unmount/remount.
  // Avoids the React 19 "setState in effect" lint rule.
  if (!props.open) return null;
  return <UploadDialogBody {...props} />;
}

function UploadDialogBody({ open, files, prefix, http, onClose, onComplete }: UploadDialogProps) {
  const [picked, setPicked] = useState<File[]>(files);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setPicked(Array.from(e.target.files));
  };

  const handleUpload = async () => {
    if (picked.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      if (prefix) form.append('prefix', prefix.replace(/\/$/, ''));
      for (const f of picked) form.append('file', f, f.name);
      await http.post<UploadResult>('/upload', form, {
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      onComplete();
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !uploading && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload files</DialogTitle>
          <DialogDescription>
            Uploading to <span className="mono">{prefix || '/ (bucket root)'}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input type="file" multiple onChange={onFileInput} disabled={uploading} />
          {picked.length > 0 && (
            <div className="text-sm text-muted-foreground">
              <strong>{picked.length}</strong> file{picked.length === 1 ? '' : 's'} ·{' '}
              {formatBytes(picked.reduce((sum, f) => sum + f.size, 0))}
            </div>
          )}
          {uploading && (
            <div>
              <div style={{ height: 6, background: 'hsl(var(--muted))', borderRadius: 999 }}>
                <div
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: 'hsl(var(--primary))',
                    borderRadius: 999,
                    transition: 'width 120ms linear',
                  }}
                />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{progress}%</div>
            </div>
          )}
          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={picked.length === 0 || uploading}>
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PresignDialogProps {
  open: boolean;
  item: ListItem | null;
  http: AxiosInstance;
  onClose: () => void;
}

function PresignDialog(props: PresignDialogProps) {
  if (!props.open) return null;
  return <PresignDialogBody {...props} />;
}

function PresignDialogBody({ open, item, http, onClose }: PresignDialogProps) {
  const [expiresIn, setExpiresIn] = useState(900);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    if (!item || item.type !== 'file') return;
    setLoading(true);
    setError(null);
    try {
      const res = await http.post<PresignResult>('/presign', {
        key: item.object.key,
        operation: 'getObject',
        expiresIn,
      });
      setUrl(res.data.url);
    } catch (err) {
      setError((err as Error).message || 'Failed to generate URL');
    } finally {
      setLoading(false);
    }
  }, [http, item, expiresIn]);

  const copy = () => {
    if (!url) return;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share link</DialogTitle>
          <DialogDescription>
            {item?.type === 'file' ? (
              <>
                Pre-signed download URL for <span className="mono">{item.object.key}</span>
              </>
            ) : (
              'Select a single file to share.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Expires in (seconds)</Label>
            <Input
              type="number"
              value={expiresIn}
              onChange={(e) => setExpiresIn(parseInt(e.target.value, 10) || 0)}
              style={{ width: 120 }}
              min={60}
              max={86400}
            />
            <Button variant="outline" onClick={generate} disabled={loading || !item}>
              {loading ? 'Generating…' : url ? 'Regenerate' : 'Generate'}
            </Button>
          </div>
          {url && (
            <div className="flex items-center gap-2">
              <Input value={url} readOnly onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}
          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteDialogProps {
  open: boolean;
  items: ListItem[];
  http: AxiosInstance;
  onClose: () => void;
  onComplete: () => void;
}

function DeleteDialog(props: DeleteDialogProps) {
  if (!props.open) return null;
  return <DeleteDialogBody {...props} />;
}

function DeleteDialogBody({ open, items, http, onClose, onComplete }: DeleteDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keys = items
    .filter((it): it is Extract<ListItem, { type: 'file' }> => it.type === 'file')
    .map((it) => it.key);

  const confirm = async () => {
    if (keys.length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await http.delete('/objects', { data: { keys } });
      onComplete();
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Delete {keys.length} object{keys.length === 1 ? '' : 's'}?
          </DialogTitle>
          <DialogDescription>
            This cannot be undone. Folders are not deleted (only the objects they contain).
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-64 overflow-y-auto text-sm text-muted-foreground space-y-1 py-2">
          {keys.slice(0, 20).map((k) => (
            <li key={k} className="mono">
              {basename(k)}
            </li>
          ))}
          {keys.length > 20 && <li>… and {keys.length - 20} more</li>}
        </ul>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={busy || keys.length === 0}>
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Local helper for the toolbar ViewToggle render — exported separately so the
// composition can hoist the view-mode toggle into its own chrome if it wants
// to. Not required by §2.5.
export function FileBrowserViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: 'list' | 'details' | 'grid';
  onChange: (m: 'list' | 'details' | 'grid') => void;
}): ReactNode {
  const opts: Array<{ value: 'list' | 'details' | 'grid'; icon: ReactNode; label: string }> = [
    { value: 'list', icon: <ListIcon size={15} />, label: 'List' },
    { value: 'details', icon: <Columns size={15} />, label: 'Details' },
    { value: 'grid', icon: <Grid size={15} />, label: 'Grid' },
  ];
  return (
    <div className="tbar__group">
      {opts.map((o) => (
        <button
          key={o.value}
          className={cn('iconbtn', viewMode === o.value && 'iconbtn--active')}
          onClick={() => onChange(o.value)}
          title={o.label}
          aria-label={o.label}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
