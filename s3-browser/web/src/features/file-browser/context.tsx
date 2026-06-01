import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import axios, { type AxiosInstance } from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import type { FileItem, FilterKind, ListItem, SortKey, SortState, ViewMode } from './types';
import { useMediaQuery } from './hooks/useMediaQuery';
import type { FileBrowserProps } from './FileBrowser';
import { readPersistedBool, writePersistedBool } from './persistence';
import { EMPTY_DIALOGS, reducer, type DialogsState } from './state';

const NARROW_QUERY = '(max-width: 767px)';

// ---------------------------------------------------------------------------
// Context value type
// ---------------------------------------------------------------------------
export interface BrowserContextValue {
  http: AxiosInstance;
  bucket: string;
  path: string[];
  onPathChange: (path: string[]) => void;

  activeFile: FileItem | null;
  activeFileKey: string | null;
  setActiveFile: (item: FileItem | null) => void;
  setActiveFileKey: (key: string | null) => void;

  multiSelectMode: boolean;
  setMultiSelectMode: (v: boolean) => void;
  selectedKeys: Set<string>;
  toggleSelection: (key: string) => void;
  selectRange: (keys: string[], key: string, additive?: boolean) => void;
  selectAll: (keys: string[]) => void;
  clearSelection: () => void;

  filterQuery: string;
  setFilterQuery: (q: string) => void;
  filterKind: FilterKind;
  setFilterKind: (k: FilterKind) => void;

  sortState: SortState;
  handleSort: (key: SortKey) => void;

  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;

  treeCollapsed: boolean;
  setTreeCollapsed: (v: boolean) => void;

  /** True when viewport is narrower than the md breakpoint (767px). */
  isNarrow: boolean;
  /** Drawer overlay state used in narrow mode (independent of treeCollapsed). */
  treeDrawerOpen: boolean;
  setTreeDrawerOpen: (v: boolean) => void;

  dialogs: DialogsState;
  openUpload: (files?: File[]) => void;
  closeUpload: () => void;
  openDelete: (items: ListItem[]) => void;
  closeDelete: () => void;
  openPresign: (item: ListItem) => void;
  closePresign: () => void;
  openNewFolder: () => void;
  closeNewFolder: () => void;
  openRename: (item: ListItem) => void;
  closeRename: () => void;
  openMove: (item: ListItem) => void;
  closeMove: () => void;
  openCopy: (item: ListItem) => void;
  closeCopy: () => void;

  toast: { kind: 'ok' | 'err'; message: string } | null;
  showToast: (kind: 'ok' | 'err', message: string) => void;

  refresh: (prefix?: string) => void;
  currentPrefix: string;
}

const BrowserContext = createContext<BrowserContextValue | null>(null);

export function useBrowser(): BrowserContextValue {
  const ctx = useContext(BrowserContext);
  if (!ctx) throw new Error('useBrowser must be used inside BrowserProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function BrowserProvider({
  children,
  props,
}: {
  children: ReactNode;
  props: FileBrowserProps;
}) {
  const { backend, bucket, path, onPathChange, viewMode: viewModeProp, onViewModeChange } = props;

  const backendHeadersKey = JSON.stringify(backend.headers);
  const http = useMemo<AxiosInstance>(
    () =>
      axios.create({
        baseURL: backend.baseUrl,
        headers: {
          Authorization: `Bearer ${backend.authToken}`,
          ...(backend.headers ?? {}),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backend.baseUrl, backend.authToken, backendHeadersKey],
  );

  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    activeFile: null,
    multiSelectMode: false,
    selectedKeys: new Set<string>(),
    selectionAnchorKey: null,
    filterQuery: '',
    filterKind: 'all' as const,
    sortState: { key: 'name' as SortKey, dir: 'asc' as const },
    viewMode: (viewModeProp ??
      (readPersistedBool('s3b.fb.viewGrid', false) ? 'grid' : 'list')) as ViewMode,
    treeCollapsed: readPersistedBool('s3b.fb.treeCollapsed', false),
    treeDrawerOpen: false,
    dialogs: EMPTY_DIALOGS,
    toast: null,
  }));

  const prevPathRef = useRef(path);
  useEffect(() => {
    const prev = prevPathRef.current;
    const changed = prev.length !== path.length || prev.some((s, i) => s !== path[i]);
    if (changed) {
      const nextPrefix = path.length === 0 ? '' : `${path.join('/')}/`;
      const activeParent = state.activeFile?.key.includes('/')
        ? `${state.activeFile.key.split('/').slice(0, -1).join('/')}/`
        : '';
      dispatch({ type: 'NAVIGATE', preserveActiveFile: activeParent === nextPrefix });
      prevPathRef.current = path;
    }
  }, [path, state.activeFile]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!state.toast) return;
    const id = setTimeout(() => dispatch({ type: 'CLEAR_TOAST' }), 2500);
    return () => clearTimeout(id);
  }, [state.toast]);

  const qc = useQueryClient();
  const currentPrefix = path.length === 0 ? '' : path.join('/') + '/';

  const handleSort = useCallback((key: SortKey) => dispatch({ type: 'SET_SORT', key }), []);

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      dispatch({ type: 'SET_VIEW_MODE', mode });
      writePersistedBool('s3b.fb.viewGrid', mode === 'grid');
      onViewModeChange?.(mode);
    },
    [onViewModeChange],
  );

  const setTreeCollapsed = useCallback((collapsed: boolean) => {
    dispatch({ type: 'SET_TREE_COLLAPSED', collapsed });
    writePersistedBool('s3b.fb.treeCollapsed', collapsed);
  }, []);

  const isNarrow = useMediaQuery(NARROW_QUERY);
  // Drawer state lives in the reducer so NAVIGATE can also close it. The
  // "drawer effectively open" derived value also requires isNarrow — closing
  // the drawer on viewport widen is done implicitly by gating render on it.
  const setTreeDrawerOpen = useCallback(
    (open: boolean) => dispatch({ type: 'SET_TREE_DRAWER', open }),
    [],
  );
  const treeDrawerOpen = state.treeDrawerOpen && isNarrow;

  const refresh = useCallback(
    (prefix?: string) => {
      if (prefix !== undefined) {
        qc.invalidateQueries({ queryKey: ['prefix', backend.baseUrl, prefix] });
        qc.invalidateQueries({ queryKey: ['tree-prefix', backend.baseUrl, prefix] });
      } else {
        qc.invalidateQueries({ queryKey: ['prefix', backend.baseUrl] });
        qc.invalidateQueries({ queryKey: ['tree-prefix', backend.baseUrl] });
      }
    },
    [qc, backend.baseUrl],
  );

  const openPresign = useCallback((item: ListItem) => {
    if (item.type !== 'file') return;
    dispatch({ type: 'OPEN_PRESIGN', item: item as ListItem & { type: 'file' } });
  }, []);

  const value: BrowserContextValue = {
    http,
    bucket,
    path,
    onPathChange,
    currentPrefix,

    activeFile: state.activeFile,
    activeFileKey: state.activeFile?.key ?? null,
    setActiveFile: (item) => dispatch({ type: 'SET_ACTIVE_FILE', item }),
    setActiveFileKey: (key) => {
      if (!key) dispatch({ type: 'SET_ACTIVE_FILE', item: null });
    },

    multiSelectMode: state.multiSelectMode,
    setMultiSelectMode: (v) => dispatch({ type: 'SET_MULTI_SELECT', enabled: v }),
    selectedKeys: state.selectedKeys,
    toggleSelection: (key) => dispatch({ type: 'TOGGLE_SELECT', key }),
    selectRange: (keys, key, additive = false) =>
      dispatch({ type: 'SELECT_RANGE', keys, key, additive }),
    selectAll: (keys) => dispatch({ type: 'SELECT_ALL', keys }),
    clearSelection: () => dispatch({ type: 'CLEAR_SELECTION' }),

    filterQuery: state.filterQuery,
    setFilterQuery: (query) => dispatch({ type: 'SET_FILTER_QUERY', query }),
    filterKind: state.filterKind,
    setFilterKind: (kind) => dispatch({ type: 'SET_FILTER_KIND', kind }),

    sortState: state.sortState,
    handleSort,

    viewMode: state.viewMode,
    setViewMode,

    treeCollapsed: state.treeCollapsed,
    setTreeCollapsed,

    isNarrow,
    treeDrawerOpen,
    setTreeDrawerOpen,

    dialogs: state.dialogs,
    openUpload: (files = []) => dispatch({ type: 'OPEN_UPLOAD', files }),
    closeUpload: () => dispatch({ type: 'CLOSE_UPLOAD' }),
    openDelete: (items) => dispatch({ type: 'OPEN_DELETE', items }),
    closeDelete: () => dispatch({ type: 'CLOSE_DELETE' }),
    openPresign,
    closePresign: () => dispatch({ type: 'CLOSE_PRESIGN' }),
    openNewFolder: () => dispatch({ type: 'OPEN_NEW_FOLDER' }),
    closeNewFolder: () => dispatch({ type: 'CLOSE_NEW_FOLDER' }),
    openRename: (item) => dispatch({ type: 'OPEN_RENAME', item }),
    closeRename: () => dispatch({ type: 'CLOSE_RENAME' }),
    openMove: (item) => dispatch({ type: 'OPEN_MOVE', item }),
    closeMove: () => dispatch({ type: 'CLOSE_MOVE' }),
    openCopy: (item) => dispatch({ type: 'OPEN_COPY', item }),
    closeCopy: () => dispatch({ type: 'CLOSE_COPY' }),

    toast: state.toast,
    showToast: (kind, message) => dispatch({ type: 'SHOW_TOAST', kind, message }),

    refresh,
  };

  return <BrowserContext.Provider value={value}>{children}</BrowserContext.Provider>;
}
