/**
 * <FileBrowser/> — the embedded component exposed via Module Federation.
 *
 * Conventions worth preserving so the component stays embeddable:
 *   - props-driven path; no internal router
 *   - no `@aws-sdk/*` imports — all S3 details live in the BFF behind
 *     props.backend.baseUrl
 *   - no reads of auth tokens or credentials from localStorage/window/env
 *
 * Features: list / grid views, preview pane, bulk bar, drag-drop upload,
 * breadcrumbs, lazy folder tree (collapsible, optional file leaves),
 * search + filter by kind, keyboard navigation, inline preview by file type.
 */
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  Check,
  ChevronLeft,
  ChevronRight,
  Copy as CopyIcon,
  Download,
  Edit,
  Eye,
  File as FileGeneric,
  Filter as FilterIcon,
  Folder,
  FolderOpen,
  FolderPlus,
  Grid,
  Link as LinkIcon,
  List as ListIcon,
  Lock,
  MoreHorizontal,
  MoveRight,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  X as XIcon,
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
} from '@garage/ui';

import type { ListResult, PresignResult, S3Object, UploadResult } from '@/lib/types';
import {
  basename,
  type FileKind,
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

/**
 * Boolean state that survives reloads via localStorage. Falls back to
 * in-memory state when storage is unavailable (SSR, private browsing edge
 * cases, embedded sandboxes).
 */
function usePersistedBool(
  key: string,
  initial: boolean,
): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValue] = useState<boolean>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === '1') return true;
      if (raw === '0') return false;
    } catch {
      // ignore — fall through to initial
    }
    return initial;
  });
  const update = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        try {
          window.localStorage.setItem(key, resolved ? '1' : '0');
        } catch {
          // ignore quota / disabled storage
        }
        return resolved;
      });
    },
    [key],
  );
  return [value, update];
}

// ---------------------------------------------------------------------------
// Public component surface
// ---------------------------------------------------------------------------

export type FileBrowserViewMode = 'list' | 'grid';

export interface FileBrowserProps {
  /** Bucket Backend API endpoint. baseUrl already encodes the bucket. */
  backend: {
    baseUrl: string;
    authToken: string;
    /** Extra headers forwarded on every BFF request (e.g. X-Garage-Access-Key-Id). */
    headers?: Record<string, string>;
  };
  /** Display-only — baseUrl already encodes which bucket we're in. */
  bucket: string;
  /** Path segments (empty array = bucket root). Controlled by parent. */
  path: string[];
  onPathChange: (path: string[]) => void;
  viewMode?: FileBrowserViewMode;
  onViewModeChange?: (mode: FileBrowserViewMode) => void;
  density?: 'compact' | 'comfortable';
  showPreview?: boolean;
  onSelect?: (items: S3Object[]) => void;
  onError?: (err: Error) => void;
}

// ---------------------------------------------------------------------------
// Top-level wrapper — owns an embedded QueryClient so it doesn't depend on
// the host's TanStack Query instance.
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
  onViewModeChange,
  density = 'comfortable',
  showPreview: showPreviewInitial = true,
  onSelect,
  onError,
}: FileBrowserProps) {
  // Internal preview-open state, seeded from the prop. Dropdown "Open in
  // preview" + the toolbar Eye toggle both flip this. A user toggle persists
  // in localStorage and beats the initial prop on subsequent mounts.
  const [previewOpen, setPreviewOpen] = usePersistedBool('s3b.fb.previewOpen', showPreviewInitial);
  const backendHeadersKey = JSON.stringify(backend.headers);
  // Stable axios instance for this backend + token.
  // Re-created when baseUrl, authToken, or extra headers change so callers
  // (e.g. the host key-selector) can swap credentials by updating the prop.
  const http = useMemo<AxiosInstance>(
    () =>
      axios.create({
        baseURL: backend.baseUrl,
        headers: {
          Authorization: `Bearer ${backend.authToken}`,
          ...(backend.headers ?? {}),
        },
        // Allow large multipart uploads to stream through axios.
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backend.baseUrl, backend.authToken, backendHeadersKey],
  );

  const qc = useQueryClient();
  const currentPrefix = path.length === 0 ? '' : path.join('/') + '/';

  // ---- list query (first page) ----
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

  // ---- Load More pagination ----
  // State key includes both location AND the base query's last-updated timestamp
  // so that navigating or refreshing auto-discards any accumulated extra pages
  // without needing a useEffect.
  const locationKey = `${bucket}::${currentPrefix}`;
  const extraKey = `${locationKey}::${listQuery.dataUpdatedAt}`;
  const [extraState, setExtraState] = useState<{
    key: string;
    pages: ListResult[];
    loading: boolean;
  }>({ key: extraKey, pages: [], loading: false });
  const extra =
    extraState.key === extraKey ? extraState : { key: extraKey, pages: [], loading: false };

  const nextContinuationToken =
    extra.pages.length > 0
      ? extra.pages[extra.pages.length - 1]?.nextContinuationToken
      : listQuery.data?.nextContinuationToken;
  const hasMore = !!nextContinuationToken;
  const isLoadingMore = extra.loading;

  const loadMore = useCallback(async () => {
    const token =
      extra.pages.length > 0
        ? extra.pages[extra.pages.length - 1]?.nextContinuationToken
        : listQuery.data?.nextContinuationToken;
    if (!token) return;
    setExtraState((prev) => {
      const base = prev.key === extraKey ? prev : { key: extraKey, pages: [], loading: false };
      return { ...base, loading: true };
    });
    try {
      const res = await http.get<ListResult>('/list', {
        params: { prefix: currentPrefix, delimiter: '/', continuationToken: token },
      });
      setExtraState((prev) => {
        const base = prev.key === extraKey ? prev : { key: extraKey, pages: [], loading: false };
        return { ...base, loading: false, pages: [...base.pages, res.data] };
      });
    } catch {
      setExtraState((prev) => {
        const base = prev.key === extraKey ? prev : { key: extraKey, pages: [], loading: false };
        return { ...base, loading: false };
      });
    }
  }, [http, currentPrefix, extraKey, listQuery.data, extra.pages]);

  // ---- normalized items (all loaded pages) ----
  const items: ListItem[] = useMemo(() => {
    const pages: ListResult[] = [];
    if (listQuery.data) pages.push(listQuery.data);
    pages.push(...extra.pages);
    if (pages.length === 0) return [];

    const seenPrefixes = new Set<string>();
    const seenKeys = new Set<string>();
    const out: ListItem[] = [];

    for (const data of pages) {
      for (const p of data.prefixes) {
        if (seenPrefixes.has(p)) continue;
        seenPrefixes.add(p);
        const inner = p.startsWith(currentPrefix) ? p.slice(currentPrefix.length) : p;
        const name = inner.replace(/\/$/, '');
        if (!name) continue;
        out.push({ type: 'folder', name, prefix: p });
      }
      for (const o of data.objects) {
        if (seenKeys.has(o.key)) continue;
        seenKeys.add(o.key);
        const inner = o.key.startsWith(currentPrefix) ? o.key.slice(currentPrefix.length) : o.key;
        // Skip directory-placeholder keys ("foo/") and our own folder markers
        // — see NewFolderDialog where we PUT a zero-byte ".keep" so S3 surfaces
        // the prefix in subsequent /list calls.
        if (!inner || inner.endsWith('/') || inner === '.keep') continue;
        out.push({ type: 'file', name: inner, key: o.key, object: o });
      }
    }
    return out;
  }, [listQuery.data, extra.pages, currentPrefix]);

  // ---- search + sort + kind filter ----
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });
  // Empty set = no filter; otherwise only show files whose kind is in the set
  // (folders are always shown).
  const [kindFilter, setKindFilter] = useState<Set<FileKind>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q && kindFilter.size === 0) return items;
    return items.filter((it) => {
      if (q && !it.name.toLowerCase().includes(q)) return false;
      if (kindFilter.size > 0 && it.type === 'file' && !kindFilter.has(fileKind(it.name)))
        return false;
      return true;
    });
  }, [items, query, kindFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const cmpName = (a: ListItem, b: ListItem) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    arr.sort((a, b) => {
      // Folders always first regardless of sort field.
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      let primary = 0;
      if (sort.key === 'name') {
        primary = cmpName(a, b);
      } else if (sort.key === 'size') {
        const av = a.type === 'file' ? a.object.size : 0;
        const bv = b.type === 'file' ? b.object.size : 0;
        primary = av - bv;
      } else if (sort.key === 'modified') {
        const av = a.type === 'file' ? a.object.lastModified || '' : '';
        const bv = b.type === 'file' ? b.object.lastModified || '' : '';
        primary = av < bv ? -1 : av > bv ? 1 : 0;
      } else if (sort.key === 'class') {
        const av = a.type === 'file' ? a.object.storageClass || '' : '';
        const bv = b.type === 'file' ? b.object.storageClass || '' : '';
        primary = av.localeCompare(bv);
      }
      if (sort.dir === 'desc') primary = -primary;
      // Tiebreak on name (asc) so equal-key rows keep a deterministic order.
      return primary !== 0 ? primary : cmpName(a, b);
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
  // (locationKey is already defined above for pagination)
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

  // Row body click — VS-Code/Finder semantics with click-to-toggle:
  //   plain click   → focus row, selection := {name}; clicking the row again
  //                   when it's the only selected item clears the selection
  //   shift+click   → focus row, range-extend selection from previous focus
  //   cmd/ctrl+click → focus row, toggle membership without clearing rest
  const selectRow = (name: string, e?: ReactMouseEvent) => {
    let deselected = false;
    setSelected((prev) => {
      if (e?.shiftKey && focused) {
        const i1 = sorted.findIndex((c) => c.name === focused);
        const i2 = sorted.findIndex((c) => c.name === name);
        if (i1 < 0 || i2 < 0) return new Set([name]);
        const [a, b] = i1 < i2 ? [i1, i2] : [i2, i1];
        const next = new Set(prev);
        for (let i = a; i <= b; i++) next.add(sorted[i]!.name);
        return next;
      }
      if (e && (e.metaKey || e.ctrlKey)) {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return next;
      }
      // Plain click: if this row is already the only selected item, toggle it
      // off so a second click acts as a deselect.
      if (prev.size === 1 && prev.has(name)) {
        deselected = true;
        return new Set();
      }
      return new Set([name]);
    });
    setFocused(deselected ? null : name);
  };

  // Checkbox click — additive multi-select; does NOT move focus.
  const toggleCheckbox = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
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
  const [treeCollapsed, setTreeCollapsed] = usePersistedBool('s3b.fb.treeCollapsed', false);
  const [treeShowFiles, setTreeShowFiles] = usePersistedBool('s3b.fb.treeShowFiles', false);

  const toggleFolder = (prefix: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  };

  // Tree → focus a file. Navigate to its parent folder if we aren't already
  // there, then select the file in the main listing.
  const focusFileFromTree = useCallback(
    (key: string) => {
      const lastSlash = key.lastIndexOf('/');
      const parent = lastSlash >= 0 ? key.slice(0, lastSlash) : '';
      const name = lastSlash >= 0 ? key.slice(lastSlash + 1) : key;
      const parentSegs = parent ? parent.split('/').filter(Boolean) : [];
      const samePath =
        parentSegs.length === path.length && parentSegs.every((s, i) => s === path[i]);
      if (!samePath) onPathChange(parentSegs);
      setSelected(new Set([name]));
      setFocused(name);
    },
    [path, onPathChange, setSelected, setFocused],
  );

  // ---- modals ----
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [presignOpen, setPresignOpen] = useState(false);
  const [presignItem, setPresignItem] = useState<ListItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteItems, setDeleteItems] = useState<ListItem[]>([]);
  const [renameItem, setRenameItem] = useState<ListItem | null>(null);
  const [moveItem, setMoveItem] = useState<ListItem | null>(null);
  const [copyItem, setCopyItem] = useState<ListItem | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);

  // Auto-dismiss toast after 2.4s.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(id);
  }, [toast]);

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
  const openMove = (item: ListItem) => setMoveItem(item);
  const openCopy = (item: ListItem) => setCopyItem(item);

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
    // extraKey will auto-reset when listQuery.dataUpdatedAt changes after invalidation.
    qc.invalidateQueries({ queryKey: ['list', backend.baseUrl] });
    qc.invalidateQueries({ queryKey: ['tree', backend.baseUrl] });
  };

  // Download via BFF proxy — fetches through the authenticated axios instance and
  // creates a transient blob URL to trigger the save dialog. The entire file is
  // buffered in the browser; large-file optimisation is deferred.
  const downloadItem = useCallback(
    async (item: ListItem) => {
      if (item.type !== 'file') return;
      try {
        const res = await http.get('/download', {
          params: { key: item.object.key },
          responseType: 'blob',
        });
        const url = URL.createObjectURL(res.data as Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = basename(item.object.key);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        setToast({ kind: 'err', message: (err as Error).message || 'Download failed' });
      }
    },
    [http],
  );

  // Bulk download — fetches each file in sequence through the BFF.
  const downloadSelected = useCallback(async () => {
    const picked = sorted.filter(
      (it): it is Extract<ListItem, { type: 'file' }> =>
        it.type === 'file' && selected.has(it.name),
    );
    if (picked.length === 0) return;
    for (const it of picked) {
      try {
        const res = await http.get('/download', {
          params: { key: it.object.key },
          responseType: 'blob',
        });
        const url = URL.createObjectURL(res.data as Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = basename(it.object.key);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        setToast({
          kind: 'err',
          message: `Failed to download ${it.name}: ${(err as Error).message}`,
        });
        return;
      }
    }
    setToast({
      kind: 'ok',
      message: `Downloaded ${picked.length} file${picked.length === 1 ? '' : 's'}`,
    });
  }, [http, sorted, selected]);

  const copyPath = useCallback(
    async (item: ListItem) => {
      const key = item.type === 'file' ? item.object.key : item.prefix;
      const full = `${bucket}/${key}`;
      try {
        await navigator.clipboard.writeText(full);
        setToast({ kind: 'ok', message: 'Path copied' });
      } catch {
        setToast({ kind: 'err', message: 'Clipboard unavailable' });
      }
    },
    [bucket],
  );

  const openInPreview = useCallback(
    (item: ListItem) => {
      if (item.type !== 'file') return;
      setSelected(new Set([item.name]));
      setFocused(item.name);
      setPreviewOpen(true);
    },
    [setSelected, setFocused, setPreviewOpen],
  );

  // ---- keyboard navigation ----
  // Listen window-level but bail out when the user is typing in an input or
  // when no modal is open above the browser — keeps the keys from fighting
  // global app shortcuts.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      // Cmd/Ctrl+F → focus the in-folder search (intercept the browser's
      // page find for the duration of this surface).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        if (
          !rootRef.current?.contains(document.activeElement) &&
          !document.activeElement?.isEqualNode(document.body)
        )
          return;
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      // Skip if a modal/dropdown trapped focus elsewhere or the user is
      // typing into an input.
      if (isTypingTarget(e.target)) return;
      if (
        uploadOpen ||
        presignOpen ||
        deleteOpen ||
        renameItem ||
        moveItem ||
        copyItem ||
        newFolderOpen
      )
        return;
      if (sorted.length === 0) return;

      const focusedIdx = focused ? sorted.findIndex((c) => c.name === focused) : -1;
      const move = (next: number) => {
        const clamped = Math.max(0, Math.min(sorted.length - 1, next));
        const item = sorted[clamped];
        if (!item) return;
        setFocused(item.name);
        setSelected(new Set([item.name]));
        // Scroll the newly-focused row into view if it sits off-screen.
        // requestAnimationFrame so we run after React commits the new
        // data-focused attribute on the target row.
        requestAnimationFrame(() => {
          const root = rootRef.current;
          if (!root) return;
          const escaped = CSS.escape(item.name);
          const row = root.querySelector(
            `.flist__row[data-name="${escaped}"], .fcard[data-name="${escaped}"]`,
          );
          if (row instanceof HTMLElement) {
            row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }
        });
      };
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          move(focusedIdx < 0 ? 0 : focusedIdx + 1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          move(focusedIdx < 0 ? sorted.length - 1 : focusedIdx - 1);
          break;
        case 'Home':
          e.preventDefault();
          move(0);
          break;
        case 'End':
          e.preventDefault();
          move(sorted.length - 1);
          break;
        case 'Enter': {
          const item = focusedIdx >= 0 ? sorted[focusedIdx] : null;
          if (!item) break;
          e.preventDefault();
          if (item.type === 'folder') onPathChange([...path, item.name]);
          else openInPreview(item);
          break;
        }
        case 'Backspace':
          if (path.length > 0) {
            e.preventDefault();
            onPathChange(path.slice(0, -1));
          }
          break;
        case 'Escape':
          if (selected.size > 0) {
            e.preventDefault();
            setSelected(new Set());
            setFocused(null);
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    sorted,
    focused,
    selected,
    path,
    onPathChange,
    setFocused,
    setSelected,
    openInPreview,
    uploadOpen,
    presignOpen,
    deleteOpen,
    renameItem,
    moveItem,
    copyItem,
    newFolderOpen,
  ]);

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
    <div className="fb-root" data-density={density} ref={rootRef}>
      <div className="main">
        <Toolbar
          path={path}
          onPathChange={onPathChange}
          query={query}
          setQuery={setQuery}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          kindFilter={kindFilter}
          onKindFilterChange={setKindFilter}
          previewOpen={previewOpen}
          onTogglePreview={() => setPreviewOpen((v) => !v)}
          onOpenUpload={() => openUpload(null)}
          onOpenNewFolder={() => setNewFolderOpen(true)}
          searchInputRef={searchInputRef}
        />

        <div
          className="browser"
          data-preview={previewOpen && focusedItem?.type === 'file'}
          data-tree-collapsed={treeCollapsed}
        >
          <TreePane
            http={http}
            bucket={bucket}
            currentPrefix={currentPrefix}
            expanded={expandedFolders}
            onToggle={toggleFolder}
            onPathChange={onPathChange}
            collapsed={treeCollapsed}
            onToggleCollapsed={() => setTreeCollapsed((v) => !v)}
            showFiles={treeShowFiles}
            onToggleShowFiles={() => setTreeShowFiles((v) => !v)}
            onFocusFile={focusFileFromTree}
            focusedName={focused}
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
                  <div className="fempty__icon">
                    <RefreshCw size={24} className="animate-spin" />
                  </div>
                  <p>Loading objects…</p>
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
                      onSelectRow={selectRow}
                      onToggleCheckbox={toggleCheckbox}
                      onOpen={openItem}
                    />
                  ) : (
                    <ListView
                      items={sorted}
                      selected={selected}
                      focused={focused}
                      onSelectRow={selectRow}
                      onToggleCheckbox={toggleCheckbox}
                      onOpen={openItem}
                      sort={sort}
                      onSort={handleSort}
                      onShare={(it) => openPresign(it)}
                      onDelete={(it) => openDelete(it)}
                      onDownload={downloadItem}
                      onPreview={openInPreview}
                      onCopyPath={copyPath}
                      onRename={(it) => setRenameItem(it)}
                      onMove={openMove}
                      onCopyFile={openCopy}
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

                  {hasMore && (
                    <div className="flist__more">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isLoadingMore}
                        onClick={loadMore}
                      >
                        {isLoadingMore ? (
                          <>
                            <RefreshCw size={13} className="animate-spin" /> Loading…
                          </>
                        ) : (
                          'Load more'
                        )}
                      </Button>
                    </div>
                  )}

                  {selected.size > 1 && (
                    <BulkBar
                      count={selected.size}
                      onClear={() => setSelected(new Set())}
                      onShare={() => openPresign(null)}
                      onDelete={() => openDelete(null)}
                      onDownload={downloadSelected}
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
            </div>
          </div>

          {previewOpen && focusedItem?.type === 'file' && (
            <PreviewPane
              item={focusedItem}
              bucket={bucket}
              path={path}
              onShare={() => openPresign(focusedItem)}
              onDelete={() => openDelete(focusedItem)}
              onClose={() => setPreviewOpen(false)}
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

      <RenameDialog
        open={renameItem !== null}
        item={renameItem}
        prefix={currentPrefix}
        http={http}
        onClose={() => setRenameItem(null)}
        onComplete={(newName) => {
          setRenameItem(null);
          setSelected(new Set([newName]));
          setFocused(newName);
          refresh();
        }}
        onError={(msg) => setToast({ kind: 'err', message: msg })}
      />

      <MoveDialog
        open={moveItem !== null}
        item={moveItem}
        currentPrefix={currentPrefix}
        http={http}
        onClose={() => setMoveItem(null)}
        onComplete={() => {
          setMoveItem(null);
          setSelected(new Set());
          refresh();
          setToast({ kind: 'ok', message: 'File moved' });
        }}
        onError={(msg) => setToast({ kind: 'err', message: msg })}
      />

      <CopyDialog
        open={copyItem !== null}
        item={copyItem}
        currentPrefix={currentPrefix}
        http={http}
        onClose={() => setCopyItem(null)}
        onComplete={() => {
          setCopyItem(null);
          refresh();
          setToast({ kind: 'ok', message: 'File copied' });
        }}
        onError={(msg) => setToast({ kind: 'err', message: msg })}
      />

      <NewFolderDialog
        open={newFolderOpen}
        prefix={currentPrefix}
        existing={items}
        http={http}
        onClose={() => setNewFolderOpen(false)}
        onComplete={() => {
          setNewFolderOpen(false);
          refresh();
          setToast({ kind: 'ok', message: 'Folder created' });
        }}
      />

      {toast && (
        <div className={cn('fb-toast', toast.kind === 'err' && 'fb-toast--err')} role="status">
          {toast.kind === 'ok' ? <Check size={14} /> : <XIcon size={14} />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar (breadcrumbs + search + view toggle + upload)
// ---------------------------------------------------------------------------

const KIND_OPTIONS: Array<{ value: FileKind; label: string }> = [
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audio' },
  { value: 'doc', label: 'Documents' },
  { value: 'code', label: 'Code' },
  { value: 'config', label: 'Config' },
  { value: 'archive', label: 'Archives' },
  { value: 'file', label: 'Other' },
];

function Toolbar({
  path,
  onPathChange,
  query,
  setQuery,
  viewMode,
  onViewModeChange,
  kindFilter,
  onKindFilterChange,
  previewOpen,
  onTogglePreview,
  onOpenUpload,
  onOpenNewFolder,
  searchInputRef,
}: {
  path: string[];
  onPathChange: (p: string[]) => void;
  query: string;
  setQuery: (q: string) => void;
  viewMode: FileBrowserViewMode;
  onViewModeChange?: (m: FileBrowserViewMode) => void;
  kindFilter: Set<FileKind>;
  onKindFilterChange: (next: Set<FileKind>) => void;
  previewOpen: boolean;
  onTogglePreview: () => void;
  onOpenUpload: () => void;
  onOpenNewFolder: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="tbar">
      <div className="crumb">
        <button
          className={cn('crumb__item crumb__root', path.length === 0 && 'crumb__item--current')}
          onClick={() => onPathChange([])}
          aria-label="Bucket root"
          title="Bucket root"
        >
          <Folder size={14} />
          <span className="crumb__slash">/</span>
        </button>
        {path.map((seg, i) => (
          <span key={`${i}:${seg}`} className="crumb__chip">
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
          ref={searchInputRef}
          placeholder="Filter in this folder…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (query) {
                e.preventDefault();
                setQuery('');
              } else {
                e.currentTarget.blur();
              }
            }
          }}
        />
        <kbd>⌘F</kbd>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn('btn--responsive-label', kindFilter.size > 0 && 'fb-filter--active')}
          >
            <FilterIcon />
            <span>Filter{kindFilter.size > 0 ? ` (${kindFilter.size})` : ''}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>File type</DropdownMenuLabel>
          {KIND_OPTIONS.map((opt) => (
            <DropdownMenuCheckboxItem
              key={opt.value}
              checked={kindFilter.has(opt.value)}
              onCheckedChange={(checked) => {
                const next = new Set(kindFilter);
                if (checked) next.add(opt.value);
                else next.delete(opt.value);
                onKindFilterChange(next);
              }}
              onSelect={(e) => e.preventDefault()}
            >
              {opt.label}
            </DropdownMenuCheckboxItem>
          ))}
          {kindFilter.size > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onKindFilterChange(new Set())}>
                Clear filters
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {onViewModeChange && (
        <FileBrowserViewToggle viewMode={viewMode} onChange={onViewModeChange} />
      )}

      <button
        className={cn('iconbtn', previewOpen && 'iconbtn--active')}
        onClick={onTogglePreview}
        title={previewOpen ? 'Hide preview pane' : 'Show preview pane'}
        aria-label="Toggle preview pane"
        aria-pressed={previewOpen}
      >
        <Eye size={15} />
      </button>

      <Button variant="outline" className="btn--responsive-label" onClick={onOpenNewFolder}>
        <FolderPlus /> New folder
      </Button>
      <Button onClick={onOpenUpload} className="btn--responsive-label">
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
  collapsed,
  onToggleCollapsed,
  showFiles,
  onToggleShowFiles,
  onFocusFile,
  focusedName,
}: {
  http: AxiosInstance;
  bucket: string;
  currentPrefix: string;
  expanded: Set<string>;
  onToggle: (prefix: string) => void;
  onPathChange: (p: string[]) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  showFiles: boolean;
  onToggleShowFiles: () => void;
  onFocusFile: (key: string) => void;
  focusedName: string | null;
}) {
  if (collapsed) {
    return (
      <div className="tree tree--collapsed">
        <button
          className="tree__expand"
          onClick={onToggleCollapsed}
          title="Expand folder tree"
          aria-label="Expand folder tree"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="tree">
      <div className="tree__head">
        <span className="tree__head-label">Explorer</span>
        <div className="tree__head-actions">
          <button
            className={cn('tree__head-btn', showFiles && 'tree__head-btn--active')}
            onClick={onToggleShowFiles}
            title={showFiles ? 'Hide files in tree' : 'Show files in tree'}
            aria-pressed={showFiles}
          >
            <FileGeneric size={12} />
          </button>
          <button
            className="tree__head-btn"
            onClick={onToggleCollapsed}
            title="Collapse folder tree"
            aria-label="Collapse folder tree"
          >
            <ChevronLeft size={12} />
          </button>
        </div>
      </div>
      <div className="tree__body">
        <TreeNode
          http={http}
          prefix=""
          label={bucket}
          depth={0}
          currentPrefix={currentPrefix}
          expanded={expanded}
          onToggle={onToggle}
          onPathChange={onPathChange}
          showFiles={showFiles}
          onFocusFile={onFocusFile}
          focusedName={focusedName}
        />
      </div>
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
  showFiles,
  onFocusFile,
  focusedName,
}: {
  http: AxiosInstance;
  prefix: string;
  label: string;
  depth: number;
  currentPrefix: string;
  expanded: Set<string>;
  onToggle: (p: string) => void;
  onPathChange: (p: string[]) => void;
  showFiles: boolean;
  onFocusFile: (key: string) => void;
  focusedName: string | null;
}) {
  const isOpen = expanded.has(prefix);

  // Lazy-fetch this node's contents when it opens. We always fetch prefixes;
  // files are optional via showFiles but kept in the same query so toggling
  // the file visibility doesn't refetch.
  const q = useQuery({
    queryKey: ['tree', http.defaults.baseURL, prefix],
    enabled: isOpen,
    queryFn: async () => {
      const res = await http.get<ListResult>('/list', {
        params: { prefix, delimiter: '/', maxKeys: 1000 },
      });
      return res.data;
    },
  });

  const isActive = currentPrefix === prefix;
  const childPrefixes = q.data?.prefixes ?? [];
  const childFiles = useMemo(() => {
    const objs = q.data?.objects ?? [];
    return objs
      .map((o) => {
        const inner = o.key.startsWith(prefix) ? o.key.slice(prefix.length) : o.key;
        // skip directory markers and our own .keep folder placeholders
        if (!inner || inner.endsWith('/') || inner === '.keep') return null;
        return { name: inner, key: o.key };
      })
      .filter((x): x is { name: string; key: string } => x !== null);
  }, [q.data, prefix]);

  const hasChildren =
    childPrefixes.length > 0 || (showFiles && childFiles.length > 0) || !q.isFetched;

  const handleSelect = () => {
    const segs = prefix ? prefix.replace(/\/$/, '').split('/') : [];
    onPathChange(segs);
  };

  return (
    <div>
      <div
        className={cn('tnode', isActive && 'tnode--active')}
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        <button
          className={cn(
            'tnode__chev',
            isOpen && 'tnode__chev--open',
            !hasChildren && 'tnode__chev--empty',
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(prefix);
          }}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          <ChevronRight size={11} />
        </button>
        <button
          className="tnode__main"
          onClick={handleSelect}
          onDoubleClick={() => onToggle(prefix)}
          title={prefix || label}
        >
          <span className="tnode__icon">
            {depth === 0 ? (
              <Folder size={13} />
            ) : isOpen ? (
              <FolderOpen size={13} />
            ) : (
              <Folder size={13} />
            )}
          </span>
          <span className="tnode__name">{label}</span>
        </button>
      </div>
      {isOpen && (
        <>
          {childPrefixes.map((childPrefix) => {
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
                showFiles={showFiles}
                onFocusFile={onFocusFile}
                focusedName={focusedName}
              />
            );
          })}
          {showFiles &&
            childFiles.map((f) => (
              <TreeFile
                key={f.key}
                name={f.name}
                fullKey={f.key}
                depth={depth + 1}
                active={isActive && focusedName === f.name}
                onSelect={() => onFocusFile(f.key)}
              />
            ))}
        </>
      )}
    </div>
  );
}

function TreeFile({
  name,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fullKey: _fullKey,
  depth,
  active,
  onSelect,
}: {
  name: string;
  fullKey: string;
  depth: number;
  active: boolean;
  onSelect: () => void;
}) {
  const iconCls = fileIconClass(false, name);
  return (
    <div className={cn('tnode tnode--file', active && 'tnode--active')}>
      <button
        className="tnode__main"
        style={{ paddingLeft: 6 + depth * 12 + 16 /* chevron space */ }}
        onClick={onSelect}
        title={name}
      >
        <span className={cn('tnode__icon tnode__icon--file', iconCls)}>
          <FileTypeIcon isFolder={false} name={name} size={12} />
        </span>
        <span className="tnode__name">{name}</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List + Details views (details is the same with `--rowH` override)
// ---------------------------------------------------------------------------

interface RowActions {
  onShare: (it: ListItem) => void;
  onDelete: (it: ListItem) => void;
  onDownload: (it: ListItem) => void;
  onPreview: (it: ListItem) => void;
  onCopyPath: (it: ListItem) => void;
  onRename: (it: ListItem) => void;
  onMove: (it: ListItem) => void;
  onCopyFile: (it: ListItem) => void;
}

function ListView({
  items,
  selected,
  focused,
  onSelectRow,
  onToggleCheckbox,
  onOpen,
  sort,
  onSort,
  ...actions
}: {
  items: ListItem[];
  selected: Set<string>;
  focused: string | null;
  onSelectRow: (name: string, e?: ReactMouseEvent) => void;
  onToggleCheckbox: (name: string) => void;
  onOpen: (item: ListItem) => void;
  sort: SortState;
  onSort: (key: SortKey) => void;
} & RowActions) {
  return (
    <div>
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
          onSelectRow={onSelectRow}
          onToggleCheckbox={onToggleCheckbox}
          onOpen={onOpen}
          {...actions}
        />
      ))}
    </div>
  );
}

function FileRow({
  item,
  selected,
  focused,
  onSelectRow,
  onToggleCheckbox,
  onOpen,
  onShare,
  onDelete,
  onDownload,
  onPreview,
  onCopyPath,
  onRename,
  onMove,
  onCopyFile,
}: {
  item: ListItem;
  selected: boolean;
  focused: boolean;
  onSelectRow: (name: string, e?: ReactMouseEvent) => void;
  onToggleCheckbox: (name: string) => void;
  onOpen: (item: ListItem) => void;
} & RowActions) {
  const iconCls = fileIconClass(item.type === 'folder', item.name);
  const meta = item.type === 'file' ? item.object : null;
  return (
    <div
      className="flist__row"
      data-selected={selected}
      data-focused={focused}
      data-name={item.name}
      onClick={(e) => {
        // Don't trigger row-select when clicking buttons, inputs or labels —
        // those have their own semantics (checkbox toggles selection, the
        // action menu shouldn't grab focus, etc.).
        if ((e.target as HTMLElement).closest('button, input, label')) return;
        onSelectRow(item.name, e);
      }}
      onDoubleClick={() => onOpen(item)}
    >
      <label
        className="flist__ckwrap"
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${item.name}`}
      >
        <input
          type="checkbox"
          className="ckbox"
          checked={selected}
          onChange={() => onToggleCheckbox(item.name)}
        />
      </label>
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
              <DropdownMenuItem onSelect={() => onDownload(item)}>
                <Download /> Download
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onShare(item)}>
                <LinkIcon /> Share link…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onPreview(item)}>
                <Eye /> Open in preview
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onRename(item)}>
                <Edit /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onMove(item)}>
                <MoveRight /> Move to…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onCopyFile(item)}>
                <CopyIcon /> Copy to…
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onSelect={() => onCopyPath(item)}>
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
  onSelectRow,
  onToggleCheckbox,
  onOpen,
}: {
  items: ListItem[];
  selected: Set<string>;
  focused: string | null;
  onSelectRow: (name: string, e?: ReactMouseEvent) => void;
  onToggleCheckbox: (name: string) => void;
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
            data-name={item.name}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('input, label')) return;
              onSelectRow(item.name, e);
            }}
            onDoubleClick={() => onOpen(item)}
          >
            <label className="fcard__ckwrap" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                className="ckbox fcard__ck"
                checked={selected.has(item.name)}
                onChange={() => onToggleCheckbox(item.name)}
                aria-label={`Select ${item.name}`}
              />
            </label>
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
  onClose,
  http,
}: {
  item: ListItem;
  bucket: string;
  path: string[];
  onShare: () => void;
  onDelete: () => void;
  onClose: () => void;
  http: AxiosInstance;
}) {
  const file = item.type === 'file' ? item.object : null;
  const kind = fileKind(item.name);
  const fullPath = [bucket, ...path, item.name].join('/');

  // Fetch the file through the BFF and expose it as a local blob URL so that
  // <img>, <video>, <audio>, <iframe>, and TextPreview never open a direct
  // connection to the S3 endpoint. All hooks are called unconditionally
  // (before the early return) to satisfy React's rules-of-hooks.
  type BlobState = { url: string | null; loading: boolean; error: Error | null };
  const [blobState, setBlobState] = useState<BlobState>({ url: null, loading: false, error: null });

  useEffect(() => {
    if (!file) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    // Single atomic setState — reset + enter loading in one update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBlobState({ url: null, loading: true, error: null });

    http
      .get('/download', { params: { key: file.key }, responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data as Blob);
        setBlobState({ url: objectUrl, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setBlobState({ url: null, loading: false, error: err });
      });

    return () => {
      cancelled = true;
      // Revoke the object URL when the file changes or the pane unmounts to
      // release the underlying ArrayBuffer from browser memory.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // file?.key is the correct granular dep — including `file` would re-run
    // the effect on every render since the object reference is unstable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [http, file?.key]);

  if (!file) return null;

  const download = async () => {
    try {
      const res = await http.get('/download', {
        params: { key: file.key },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = basename(file.key);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // swallow — toast wiring lives at the standalone-app layer.
    }
  };

  return (
    <aside className="preview">
      <div className="preview__head">
        <h3 title={item.name}>{item.name}</h3>
        <button
          className="iconbtn iconbtn--sm"
          onClick={onClose}
          aria-label="Close preview pane"
          title="Close preview"
        >
          <XIcon size={14} />
        </button>
      </div>
      <div className="preview__body">
        <div className="preview__thumb" data-kind={previewSlot(item.name, kind)}>
          <PreviewContent
            url={blobState.url}
            loading={blobState.loading}
            error={blobState.error}
            kind={kind}
            name={item.name}
            size={file.size}
          />
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

// Map a file to the preview "slot" — controls how the .preview__thumb
// container sizes itself. Image/video/audio/file slot stays 4:3; text and
// pdf get a taller scrollable surface.
function previewSlot(name: string, kind: FileKind): 'media' | 'text' | 'pdf' | 'icon' {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (ext === 'pdf') return 'pdf';
  if (TEXT_PREVIEW_EXTS.has(ext)) return 'text';
  if (kind === 'image' || kind === 'video' || kind === 'audio') return 'media';
  return 'icon';
}

function PreviewIcon({ kind }: { kind: ReturnType<typeof fileKind> }) {
  // Use the same lucide icon set as the list view. Routed through
  // createElement so the React 19 lint rule on PascalCase component refs
  // stays happy.
  return createElement(getFileIcon(false, `_.${kind === 'file' ? 'bin' : kind}`), { size: 48 });
}

// Max bytes we'll fetch for an inline text preview. Larger files fall back to
// "download to view" — we don't want to stream a 100 MB log into the DOM.
const TEXT_PREVIEW_MAX_BYTES = 1_000_000;
const TEXT_PREVIEW_EXTS = new Set([
  'txt',
  'md',
  'json',
  'csv',
  'tsv',
  'log',
  'yaml',
  'yml',
  'toml',
  'env',
  'conf',
  'ini',
  'xml',
  'html',
  'css',
  'scss',
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
  'sh',
  'sql',
]);

function PreviewContent({
  url,
  loading,
  error,
  kind,
  name,
  size,
}: {
  url: string | null;
  loading: boolean;
  error: Error | null;
  kind: FileKind;
  name: string;
  size: number;
}) {
  if (loading) {
    return (
      <div className="preview__placeholder">
        <RefreshCw size={24} className="preview__spin" />
      </div>
    );
  }
  if (error || !url) {
    return (
      <div className="preview__placeholder preview__placeholder--err">
        <PreviewIcon kind={kind} />
        <p className="preview__placeholder-msg">Preview unavailable</p>
      </div>
    );
  }

  // Image — straight <img>.
  if (kind === 'image') {
    return <img className="preview__media" src={url} alt={name} loading="lazy" />;
  }

  // Video — HTML5 player.
  if (kind === 'video') {
    return (
      <video className="preview__media" src={url} controls preload="metadata">
        Your browser does not support video playback.
      </video>
    );
  }

  // Audio — HTML5 player. Render the icon as a backdrop so the pane keeps
  // its aspect ratio.
  if (kind === 'audio') {
    return (
      <div className="preview__audio">
        <PreviewIcon kind={kind} />
        <audio className="preview__audio-el" src={url} controls preload="metadata">
          Your browser does not support audio playback.
        </audio>
      </div>
    );
  }

  // PDF — iframe.
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (ext === 'pdf') {
    return <iframe className="preview__pdf" src={url} title={name} />;
  }

  // Text-ish content — fetch and render in a <pre>.
  if (TEXT_PREVIEW_EXTS.has(ext)) {
    if (size > TEXT_PREVIEW_MAX_BYTES) {
      return (
        <div className="preview__placeholder">
          <PreviewIcon kind={kind} />
          <p className="preview__placeholder-msg">
            File too large ({formatBytes(size)}) — download to view.
          </p>
        </div>
      );
    }
    return <TextPreview url={url} kind={kind} ext={ext} />;
  }

  // Fallback — show the lucide icon.
  return (
    <div className="preview__placeholder">
      <PreviewIcon kind={kind} />
    </div>
  );
}

function TextPreview({ url, kind, ext }: { url: string; kind: FileKind; ext: string }) {
  // `url` is a blob: URL created from the BFF-fetched content — `fetch(url)`
  // reads from browser memory, never from the S3 endpoint.
  const q = useQuery({
    queryKey: ['preview-text', url],
    queryFn: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      // Decode as UTF-8 with replacement so binary files don't explode the
      // browser if they sneak past the extension whitelist.
      return new TextDecoder('utf-8', { fatal: false }).decode(buf);
    },
    retry: false,
    staleTime: 60_000,
  });

  if (q.isLoading) {
    return (
      <div className="preview__placeholder">
        <RefreshCw size={24} className="preview__spin" />
      </div>
    );
  }
  if (q.error || q.data == null) {
    return (
      <div className="preview__placeholder preview__placeholder--err">
        <PreviewIcon kind={kind} />
        <p className="preview__placeholder-msg">Couldn&rsquo;t load text preview.</p>
      </div>
    );
  }
  // Try to pretty-print JSON, else show raw.
  let body = q.data;
  if (ext === 'json') {
    try {
      body = JSON.stringify(JSON.parse(q.data), null, 2);
    } catch {
      // leave raw
    }
  }
  return <pre className="preview__code">{body}</pre>;
}

// ---------------------------------------------------------------------------
// Bulk action bar
// ---------------------------------------------------------------------------

function BulkBar({
  count,
  onClear,
  onShare,
  onDelete,
  onDownload,
}: {
  count: number;
  onClear: () => void;
  onShare: () => void;
  onDelete: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="bulkbar">
      <strong>{count}</strong>
      <span style={{ opacity: 0.7 }}>selected</span>
      <span className="bulkbar__divider" />
      <button onClick={onDownload}>
        <Download size={14} /> Download
      </button>
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
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    if (arr.length === 0) return;
    setPicked((prev) => {
      // Dedupe by name+size+lastModified — close enough for client-side use.
      const sig = (f: File) => `${f.name}::${f.size}::${f.lastModified}`;
      const seen = new Set(prev.map(sig));
      return [...prev, ...arr.filter((f) => !seen.has(sig(f)))];
    });
  };

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    // Reset so the same file can be picked again after removal.
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (idx: number) => {
    setPicked((prev) => prev.filter((_, i) => i !== idx));
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

  const totalBytes = picked.reduce((sum, f) => sum + f.size, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !uploading && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Upload files</DialogTitle>
          <DialogDescription>
            Uploading to <span className="mono">{prefix || '/ (bucket root)'}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div
            className={cn('fb-dropzone', dragOver && 'fb-dropzone--over')}
            onDragOver={(e) => {
              e.preventDefault();
              if (!uploading) setDragOver(true);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!uploading && e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
            }}
            onClick={() => !uploading && inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!uploading) inputRef.current?.click();
              }
            }}
            aria-disabled={uploading}
          >
            <UploadCloud className="fb-dropzone__icon" size={28} />
            <div className="fb-dropzone__title">Drop files here or click to browse</div>
            <div className="fb-dropzone__hint">Multiple files supported · any size</div>
            <input
              ref={inputRef}
              type="file"
              multiple
              onChange={onFileInput}
              disabled={uploading}
              className="fb-dropzone__input"
              tabIndex={-1}
            />
          </div>

          {picked.length > 0 && (
            <div className="fb-filelist">
              <div className="fb-filelist__head">
                <span>
                  <strong>{picked.length}</strong> file{picked.length === 1 ? '' : 's'} ·{' '}
                  {formatBytes(totalBytes)}
                </span>
                {!uploading && (
                  <button
                    className="fb-filelist__clear"
                    type="button"
                    onClick={() => setPicked([])}
                  >
                    Clear all
                  </button>
                )}
              </div>
              <ul className="fb-filelist__items">
                {picked.map((f, i) => (
                  <li key={`${f.name}::${i}`} className="fb-filelist__item">
                    <FileGeneric size={14} className="fb-filelist__icon" />
                    <span className="fb-filelist__name" title={f.name}>
                      {f.name}
                    </span>
                    <span className="fb-filelist__size">{formatBytes(f.size)}</span>
                    {!uploading && (
                      <button
                        type="button"
                        className="fb-filelist__remove"
                        onClick={() => removeFile(i)}
                        aria-label={`Remove ${f.name}`}
                      >
                        <XIcon size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {uploading && (
            <div className="fb-progress">
              <div className="fb-progress__bar">
                <div className="fb-progress__fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="fb-progress__label">Uploading… {progress}%</div>
            </div>
          )}
          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={picked.length === 0 || uploading}>
            {uploading
              ? 'Uploading…'
              : `Upload ${picked.length || ''} file${picked.length === 1 ? '' : 's'}`.trim()}
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

// ---------------------------------------------------------------------------
// Rename dialog — file rename via /copy + DELETE /objects.
// Folder rename intentionally not supported (would require a recursive walk).
// ---------------------------------------------------------------------------

interface RenameDialogProps {
  open: boolean;
  item: ListItem | null;
  prefix: string;
  http: AxiosInstance;
  onClose: () => void;
  onComplete: (newName: string) => void;
  onError: (message: string) => void;
}

function RenameDialog(props: RenameDialogProps) {
  if (!props.open || !props.item) return null;
  return <RenameDialogBody {...props} item={props.item} />;
}

function RenameDialogBody({
  open,
  item,
  prefix,
  http,
  onClose,
  onComplete,
  onError,
}: RenameDialogProps & { item: ListItem }) {
  const [value, setValue] = useState(item.name);
  const [busy, setBusy] = useState(false);

  const isFile = item.type === 'file';
  const trimmed = value.trim();
  const canSubmit = isFile && trimmed.length > 0 && trimmed !== item.name && !trimmed.includes('/');

  const submit = async () => {
    if (!canSubmit || item.type !== 'file') return;
    setBusy(true);
    try {
      const srcKey = item.key;
      const dstKey = `${prefix}${trimmed}`;
      await http.post('/copy', { src: srcKey, dst: dstKey });
      await http.delete('/objects', { data: { keys: [srcKey] } });
      onComplete(trimmed);
    } catch (err) {
      onError((err as Error).message || 'Rename failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Rename file</DialogTitle>
          <DialogDescription>
            {isFile ? (
              <>
                Renaming <span className="mono">{item.name}</span> via copy + delete.
              </>
            ) : (
              'Folder rename is not supported.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="rename-input">New name</Label>
            <Input
              id="rename-input"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) submit();
              }}
              disabled={busy || !isFile}
            />
            {trimmed.includes('/') && (
              <p className="text-xs text-destructive">Name cannot contain a slash.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || busy}>
            {busy ? 'Renaming…' : 'Rename'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// New folder dialog — creates a zero-byte object with key `${prefix}${name}/`.
// Uses /presign putObject + a direct PUT to the S3 endpoint so we don't need
// a new BFF route.
// ---------------------------------------------------------------------------

interface NewFolderDialogProps {
  open: boolean;
  prefix: string;
  existing: ListItem[];
  http: AxiosInstance;
  onClose: () => void;
  onComplete: () => void;
}

function NewFolderDialog(props: NewFolderDialogProps) {
  if (!props.open) return null;
  return <NewFolderDialogBody {...props} />;
}

function NewFolderDialogBody({
  open,
  prefix,
  existing,
  http,
  onClose,
  onComplete,
}: NewFolderDialogProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const folderNames = new Set(existing.filter((it) => it.type === 'folder').map((it) => it.name));
  const hasSlash = trimmed.includes('/');
  const conflict = folderNames.has(trimmed);
  const canSubmit = trimmed.length > 0 && !hasSlash && !conflict;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      // S3 has no real folders — create a zero-byte ".keep" marker inside
      // the new folder via the existing /upload endpoint. We route through
      // the BFF (rather than a presigned PUT) so this works regardless of
      // the S3 endpoint's CORS setup.
      const form = new FormData();
      const newPrefix = `${prefix.replace(/\/$/, '')}${prefix ? '/' : ''}${trimmed}`;
      form.append('prefix', newPrefix);
      form.append('file', new Blob([], { type: 'application/octet-stream' }), '.keep');
      await http.post('/upload', form);
      onComplete();
    } catch (err) {
      setError((err as Error).message || 'Failed to create folder');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
          <DialogDescription>
            Create a folder inside <span className="mono">{prefix || '/ (bucket root)'}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="new-folder-input">Folder name</Label>
            <Input
              id="new-folder-input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) submit();
              }}
              placeholder="my-folder"
              disabled={busy}
            />
            {hasSlash && <p className="text-xs text-destructive">Name cannot contain a slash.</p>}
            {conflict && (
              <p className="text-xs text-destructive">A folder with this name already exists.</p>
            )}
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || busy}>
            {busy ? 'Creating…' : 'Create folder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Move dialog — copy to destination then delete source (same bucket).
// ---------------------------------------------------------------------------

interface MoveDialogProps {
  open: boolean;
  item: ListItem | null;
  currentPrefix: string;
  http: AxiosInstance;
  onClose: () => void;
  onComplete: () => void;
  onError: (message: string) => void;
}

function MoveDialog(props: MoveDialogProps) {
  if (!props.open || !props.item) return null;
  return <MoveDialogBody {...props} item={props.item} />;
}

function MoveDialogBody({
  open,
  item,
  currentPrefix,
  http,
  onClose,
  onComplete,
  onError,
}: MoveDialogProps & { item: ListItem }) {
  const [dest, setDest] = useState(currentPrefix + (item.type === 'file' ? item.name : ''));
  const [busy, setBusy] = useState(false);

  if (item.type !== 'file') return null;
  const srcKey = item.key;
  const trimmed = dest.trim();
  const canSubmit = trimmed.length > 0 && trimmed !== srcKey;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await http.post('/copy', { src: srcKey, dst: trimmed });
      await http.delete('/objects', { data: { keys: [srcKey] } });
      onComplete();
    } catch (err) {
      onError((err as Error).message || 'Move failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Move file</DialogTitle>
          <DialogDescription>
            Moving <span className="mono">{item.name}</span> — enter the destination key (path
            within this bucket).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="move-dest">Destination key</Label>
            <Input
              id="move-dest"
              autoFocus
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) submit();
              }}
              placeholder="folder/new-name.txt"
              disabled={busy}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || busy}>
            {busy ? 'Moving…' : 'Move'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Copy dialog — copy to destination, source unchanged.
// ---------------------------------------------------------------------------

interface CopyDialogProps {
  open: boolean;
  item: ListItem | null;
  currentPrefix: string;
  http: AxiosInstance;
  onClose: () => void;
  onComplete: () => void;
  onError: (message: string) => void;
}

function CopyDialog(props: CopyDialogProps) {
  if (!props.open || !props.item) return null;
  return <CopyDialogBody {...props} item={props.item} />;
}

function CopyDialogBody({
  open,
  item,
  currentPrefix,
  http,
  onClose,
  onComplete,
  onError,
}: CopyDialogProps & { item: ListItem }) {
  const [dest, setDest] = useState(currentPrefix + (item.type === 'file' ? item.name : ''));
  const [busy, setBusy] = useState(false);

  if (item.type !== 'file') return null;
  const srcKey = item.key;
  const trimmed = dest.trim();
  const canSubmit = trimmed.length > 0 && trimmed !== srcKey;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await http.post('/copy', { src: srcKey, dst: trimmed });
      onComplete();
    } catch (err) {
      onError((err as Error).message || 'Copy failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Copy file</DialogTitle>
          <DialogDescription>
            Copying <span className="mono">{item.name}</span> — enter the destination key (path
            within this bucket).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="copy-dest">Destination key</Label>
            <Input
              id="copy-dest"
              autoFocus
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) submit();
              }}
              placeholder="folder/copy-of-file.txt"
              disabled={busy}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || busy}>
            {busy ? 'Copying…' : 'Copy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Local helper for the toolbar ViewToggle render — exported separately so the
// composition can hoist the view-mode toggle into its own chrome if it wants.
export function FileBrowserViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: FileBrowserViewMode;
  onChange: (m: FileBrowserViewMode) => void;
}): ReactNode {
  const opts: Array<{ value: FileBrowserViewMode; icon: ReactNode; label: string }> = [
    { value: 'list', icon: <ListIcon size={15} />, label: 'List' },
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
