import { describe, expect, it } from 'vitest';

import { EMPTY_DIALOGS, reducer, type BrowserState } from '../file-browser/state';
import type { FileItem, ListItem } from '../file-browser/types';

function baseState(overrides: Partial<BrowserState> = {}): BrowserState {
  return {
    activeFile: null,
    multiSelectMode: false,
    selectedKeys: new Set(),
    selectionAnchorKey: null,
    filterQuery: '',
    filterKind: 'all',
    sortState: { key: 'name', dir: 'asc' },
    viewMode: 'list',
    treeCollapsed: false,
    treeDrawerOpen: false,
    dialogs: EMPTY_DIALOGS,
    toast: null,
    ...overrides,
  };
}

const fileItem = (name: string, key: string): FileItem => ({
  type: 'file',
  name,
  key,
  object: { key, size: 1, etag: 'e', lastModified: null, storageClass: null },
});

const folderItem = (name: string, prefix: string): ListItem => ({ type: 'folder', name, prefix });

describe('reducer — selection', () => {
  it('TOGGLE_SELECT adds then removes a key and tracks the anchor', () => {
    const added = reducer(baseState(), { type: 'TOGGLE_SELECT', key: 'a' });
    expect([...added.selectedKeys]).toEqual(['a']);
    expect(added.selectionAnchorKey).toBe('a');

    const removed = reducer(added, { type: 'TOGGLE_SELECT', key: 'a' });
    expect([...removed.selectedKeys]).toEqual([]);
  });

  it('SELECT_RANGE selects the inclusive range between the anchor and the target', () => {
    const state = baseState({ selectionAnchorKey: 'b' });
    const next = reducer(state, {
      type: 'SELECT_RANGE',
      keys: ['a', 'b', 'c', 'd'],
      key: 'd',
      additive: false,
    });
    expect([...next.selectedKeys].sort()).toEqual(['b', 'c', 'd']);
    expect(next.selectionAnchorKey).toBe('d');
  });

  it('SELECT_RANGE merges with the existing selection when additive', () => {
    const state = baseState({ selectionAnchorKey: 'c', selectedKeys: new Set(['x']) });
    const next = reducer(state, {
      type: 'SELECT_RANGE',
      keys: ['a', 'b', 'c', 'd'],
      key: 'a',
      additive: true,
    });
    expect([...next.selectedKeys].sort()).toEqual(['a', 'b', 'c', 'x']);
  });

  it('SELECT_RANGE falls back to a single selection when the anchor is unknown', () => {
    const state = baseState({ selectionAnchorKey: 'gone' });
    const next = reducer(state, {
      type: 'SELECT_RANGE',
      keys: ['a', 'b'],
      key: 'b',
      additive: false,
    });
    expect([...next.selectedKeys]).toEqual(['b']);
  });

  it('SELECT_ALL selects every key and anchors on the last', () => {
    const next = reducer(baseState(), { type: 'SELECT_ALL', keys: ['a', 'b', 'c'] });
    expect([...next.selectedKeys].sort()).toEqual(['a', 'b', 'c']);
    expect(next.selectionAnchorKey).toBe('c');
  });

  it('CLEAR_SELECTION empties the selection and anchor', () => {
    const state = baseState({ selectedKeys: new Set(['a']), selectionAnchorKey: 'a' });
    const next = reducer(state, { type: 'CLEAR_SELECTION' });
    expect(next.selectedKeys.size).toBe(0);
    expect(next.selectionAnchorKey).toBeNull();
  });

  it('SET_MULTI_SELECT(false) clears the current selection', () => {
    const state = baseState({ multiSelectMode: true, selectedKeys: new Set(['a', 'b']) });
    const next = reducer(state, { type: 'SET_MULTI_SELECT', enabled: false });
    expect(next.multiSelectMode).toBe(false);
    expect(next.selectedKeys.size).toBe(0);
  });
});

describe('reducer — sorting', () => {
  it('SET_SORT on a new key sorts ascending', () => {
    const next = reducer(baseState(), { type: 'SET_SORT', key: 'size' });
    expect(next.sortState).toEqual({ key: 'size', dir: 'asc' });
  });

  it('SET_SORT on the active key toggles the direction', () => {
    const asc = baseState({ sortState: { key: 'name', dir: 'asc' } });
    expect(reducer(asc, { type: 'SET_SORT', key: 'name' }).sortState.dir).toBe('desc');
    const desc = baseState({ sortState: { key: 'name', dir: 'desc' } });
    expect(reducer(desc, { type: 'SET_SORT', key: 'name' }).sortState.dir).toBe('asc');
  });
});

describe('reducer — dialogs (mutually exclusive)', () => {
  it('opening a dialog resets any other open dialog', () => {
    const withUpload = reducer(baseState(), { type: 'OPEN_UPLOAD', files: [] });
    expect(withUpload.dialogs.uploadOpen).toBe(true);

    const withDelete = reducer(withUpload, { type: 'OPEN_DELETE', items: [folderItem('f', 'f/')] });
    expect(withDelete.dialogs.uploadOpen).toBe(false); // reset
    expect(withDelete.dialogs.deleteItems).toHaveLength(1);
  });

  it('OPEN_RENAME/OPEN_MOVE/OPEN_COPY each isolate their item', () => {
    const item = fileItem('a.txt', 'a.txt');
    expect(reducer(baseState(), { type: 'OPEN_RENAME', item }).dialogs.renameItem).toBe(item);
    expect(reducer(baseState(), { type: 'OPEN_MOVE', item }).dialogs.moveItem).toBe(item);
    expect(reducer(baseState(), { type: 'OPEN_COPY', item }).dialogs.copyItem).toBe(item);
  });

  it('CLOSE_DELETE clears only the delete items', () => {
    const open = reducer(baseState(), { type: 'OPEN_DELETE', items: [folderItem('f', 'f/')] });
    const closed = reducer(open, { type: 'CLOSE_DELETE' });
    expect(closed.dialogs.deleteItems).toEqual([]);
  });
});

describe('reducer — toast & navigation', () => {
  it('SHOW_TOAST and CLEAR_TOAST set and clear the banner', () => {
    const shown = reducer(baseState(), { type: 'SHOW_TOAST', kind: 'err', message: 'oops' });
    expect(shown.toast).toEqual({ kind: 'err', message: 'oops' });
    expect(reducer(shown, { type: 'CLEAR_TOAST' }).toast).toBeNull();
  });

  it('NAVIGATE clears selection, multi-select, drawer, and active file by default', () => {
    const state = baseState({
      selectedKeys: new Set(['a']),
      selectionAnchorKey: 'a',
      multiSelectMode: true,
      treeDrawerOpen: true,
      activeFile: fileItem('a.txt', 'a.txt'),
    });
    const next = reducer(state, { type: 'NAVIGATE' });
    expect(next.selectedKeys.size).toBe(0);
    expect(next.selectionAnchorKey).toBeNull();
    expect(next.multiSelectMode).toBe(false);
    expect(next.treeDrawerOpen).toBe(false);
    expect(next.activeFile).toBeNull();
  });

  it('NAVIGATE keeps the active file when preserveActiveFile is set', () => {
    const active = fileItem('a.txt', 'a.txt');
    const next = reducer(baseState({ activeFile: active }), {
      type: 'NAVIGATE',
      preserveActiveFile: true,
    });
    expect(next.activeFile).toBe(active);
  });
});
