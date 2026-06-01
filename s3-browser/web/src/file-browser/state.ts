import type { FileItem, FilterKind, ListItem, SortKey, SortState, ViewMode } from './types';

export interface DialogsState {
  uploadOpen: boolean;
  uploadFiles: File[];
  deleteItems: ListItem[];
  presignItem: (ListItem & { type: 'file' }) | null;
  newFolderOpen: boolean;
  renameItem: ListItem | null;
  moveItem: ListItem | null;
  copyItem: ListItem | null;
}

export interface BrowserState {
  activeFile: FileItem | null;
  multiSelectMode: boolean;
  selectedKeys: Set<string>;
  selectionAnchorKey: string | null;
  filterQuery: string;
  filterKind: FilterKind;
  sortState: SortState;
  viewMode: ViewMode;
  treeCollapsed: boolean;
  treeDrawerOpen: boolean;
  dialogs: DialogsState;
  toast: { kind: 'ok' | 'err'; message: string } | null;
}

export type BrowserAction =
  | { type: 'SET_ACTIVE_FILE'; item: FileItem | null }
  | { type: 'SET_MULTI_SELECT'; enabled: boolean }
  | { type: 'TOGGLE_SELECT'; key: string }
  | { type: 'SELECT_RANGE'; keys: string[]; key: string; additive: boolean }
  | { type: 'SELECT_ALL'; keys: string[] }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SET_FILTER_QUERY'; query: string }
  | { type: 'SET_FILTER_KIND'; kind: FilterKind }
  | { type: 'SET_SORT'; key: SortKey }
  | { type: 'SET_VIEW_MODE'; mode: ViewMode }
  | { type: 'SET_TREE_COLLAPSED'; collapsed: boolean }
  | { type: 'SET_TREE_DRAWER'; open: boolean }
  | { type: 'OPEN_UPLOAD'; files: File[] }
  | { type: 'CLOSE_UPLOAD' }
  | { type: 'OPEN_DELETE'; items: ListItem[] }
  | { type: 'CLOSE_DELETE' }
  | { type: 'OPEN_PRESIGN'; item: ListItem & { type: 'file' } }
  | { type: 'CLOSE_PRESIGN' }
  | { type: 'OPEN_NEW_FOLDER' }
  | { type: 'CLOSE_NEW_FOLDER' }
  | { type: 'OPEN_RENAME'; item: ListItem }
  | { type: 'CLOSE_RENAME' }
  | { type: 'OPEN_MOVE'; item: ListItem }
  | { type: 'CLOSE_MOVE' }
  | { type: 'OPEN_COPY'; item: ListItem }
  | { type: 'CLOSE_COPY' }
  | { type: 'SHOW_TOAST'; kind: 'ok' | 'err'; message: string }
  | { type: 'CLEAR_TOAST' }
  | { type: 'NAVIGATE'; preserveActiveFile?: boolean };

export const EMPTY_DIALOGS: DialogsState = {
  uploadOpen: false,
  uploadFiles: [],
  deleteItems: [],
  presignItem: null,
  newFolderOpen: false,
  renameItem: null,
  moveItem: null,
  copyItem: null,
};

export function reducer(state: BrowserState, action: BrowserAction): BrowserState {
  switch (action.type) {
    case 'SET_ACTIVE_FILE':
      return { ...state, activeFile: action.item };
    case 'SET_MULTI_SELECT':
      return {
        ...state,
        multiSelectMode: action.enabled,
        selectedKeys: action.enabled ? state.selectedKeys : new Set(),
      };
    case 'TOGGLE_SELECT': {
      const next = new Set(state.selectedKeys);
      if (next.has(action.key)) next.delete(action.key);
      else next.add(action.key);
      return { ...state, selectedKeys: next, selectionAnchorKey: action.key };
    }
    case 'SELECT_RANGE': {
      const startKey = state.selectionAnchorKey ?? action.key;
      const start = action.keys.indexOf(startKey);
      const end = action.keys.indexOf(action.key);
      if (start === -1 || end === -1) {
        const next = new Set(action.additive ? state.selectedKeys : []);
        next.add(action.key);
        return { ...state, selectedKeys: next, selectionAnchorKey: action.key };
      }
      const [from, to] = start < end ? [start, end] : [end, start];
      const next = new Set(action.additive ? state.selectedKeys : []);
      for (const key of action.keys.slice(from, to + 1)) next.add(key);
      return { ...state, selectedKeys: next, selectionAnchorKey: action.key };
    }
    case 'SELECT_ALL':
      return {
        ...state,
        selectedKeys: new Set(action.keys),
        selectionAnchorKey: action.keys.at(-1) ?? null,
      };
    case 'CLEAR_SELECTION':
      return { ...state, selectedKeys: new Set(), selectionAnchorKey: null };
    case 'SET_FILTER_QUERY':
      return { ...state, filterQuery: action.query };
    case 'SET_FILTER_KIND':
      return { ...state, filterKind: action.kind };
    case 'SET_SORT': {
      const sameKey = state.sortState.key === action.key;
      return {
        ...state,
        sortState: {
          key: action.key,
          dir: sameKey ? (state.sortState.dir === 'asc' ? 'desc' : 'asc') : 'asc',
        },
      };
    }
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.mode };
    case 'SET_TREE_COLLAPSED':
      return { ...state, treeCollapsed: action.collapsed };
    case 'SET_TREE_DRAWER':
      return { ...state, treeDrawerOpen: action.open };
    case 'OPEN_UPLOAD':
      return {
        ...state,
        dialogs: { ...EMPTY_DIALOGS, uploadOpen: true, uploadFiles: action.files },
      };
    case 'CLOSE_UPLOAD':
      return { ...state, dialogs: { ...state.dialogs, uploadOpen: false } };
    case 'OPEN_DELETE':
      return { ...state, dialogs: { ...EMPTY_DIALOGS, deleteItems: action.items } };
    case 'CLOSE_DELETE':
      return { ...state, dialogs: { ...state.dialogs, deleteItems: [] } };
    case 'OPEN_PRESIGN':
      return { ...state, dialogs: { ...EMPTY_DIALOGS, presignItem: action.item } };
    case 'CLOSE_PRESIGN':
      return { ...state, dialogs: { ...state.dialogs, presignItem: null } };
    case 'OPEN_NEW_FOLDER':
      return { ...state, dialogs: { ...EMPTY_DIALOGS, newFolderOpen: true } };
    case 'CLOSE_NEW_FOLDER':
      return { ...state, dialogs: { ...state.dialogs, newFolderOpen: false } };
    case 'OPEN_RENAME':
      return { ...state, dialogs: { ...EMPTY_DIALOGS, renameItem: action.item } };
    case 'CLOSE_RENAME':
      return { ...state, dialogs: { ...state.dialogs, renameItem: null } };
    case 'OPEN_MOVE':
      return { ...state, dialogs: { ...EMPTY_DIALOGS, moveItem: action.item } };
    case 'CLOSE_MOVE':
      return { ...state, dialogs: { ...state.dialogs, moveItem: null } };
    case 'OPEN_COPY':
      return { ...state, dialogs: { ...EMPTY_DIALOGS, copyItem: action.item } };
    case 'CLOSE_COPY':
      return { ...state, dialogs: { ...state.dialogs, copyItem: null } };
    case 'SHOW_TOAST':
      return { ...state, toast: { kind: action.kind, message: action.message } };
    case 'CLEAR_TOAST':
      return { ...state, toast: null };
    case 'NAVIGATE':
      return {
        ...state,
        selectedKeys: new Set(),
        selectionAnchorKey: null,
        activeFile: action.preserveActiveFile ? state.activeFile : null,
        multiSelectMode: false,
        treeDrawerOpen: false,
      };
  }
}
