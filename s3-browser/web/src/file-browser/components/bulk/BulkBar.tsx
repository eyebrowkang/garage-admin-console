import { useEffect, useRef } from 'react';
import { CopyActionIcon, DownloadActionIcon, DeleteActionIcon } from '@/lib/action-icons';
import { Button, cn } from '@garage/ui';
import { basename } from '@garage/web-shared';
import { useBrowser } from '../../context';
import { useDownload } from '../../hooks/useDownload';
import type { ListItem } from '../../types';

interface BulkBarProps {
  /** Keys currently rendered in the right list (post-filter). Drives select-all + range. */
  visibleKeys: string[];
  totalLoaded: number;
}

export function BulkBar({ visibleKeys, totalLoaded }: BulkBarProps) {
  const {
    selectedKeys,
    selectAll,
    clearSelection,
    multiSelectMode,
    setMultiSelectMode,
    openDelete,
    http,
    showToast,
    isNarrow,
  } = useBrowser();

  const checkboxRef = useRef<HTMLInputElement>(null);
  const download = useDownload(http, (msg) => showToast('err', msg));

  const allSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selectedKeys.has(k));
  const someSelected = selectedKeys.size > 0 && !allSelected;

  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = someSelected;
  }, [someSelected]);

  if (!multiSelectMode) return null;

  const handleSelectAll = () => {
    if (allSelected || someSelected) clearSelection();
    else selectAll(visibleKeys);
  };

  const handleDownload = async () => {
    let count = 0;
    for (const key of selectedKeys) {
      if (!key.endsWith('/')) {
        await download(key);
        count += 1;
      }
    }
    if (count > 0) showToast('ok', `Downloaded ${count} file${count === 1 ? '' : 's'}`);
  };

  const handleCopyKeys = async () => {
    try {
      await navigator.clipboard.writeText(Array.from(selectedKeys).join('\n'));
      showToast('ok', 'Keys copied');
    } catch {
      showToast('err', 'Clipboard unavailable');
    }
  };

  const selectedItems = (): ListItem[] =>
    Array.from(selectedKeys).map((key) => {
      if (key.endsWith('/')) return { type: 'folder', name: basename(key), prefix: key };
      return {
        type: 'file',
        name: basename(key),
        key,
        object: { key, size: 0, etag: '', lastModified: null, storageClass: null },
      };
    });

  const handleDelete = () => openDelete(selectedItems());

  const handleExit = () => setMultiSelectMode(false);

  const hasSelection = selectedKeys.size > 0;
  const fileCount = Array.from(selectedKeys).filter((k) => !k.endsWith('/')).length;

  // Mobile: compact icon actions instead of labelled buttons, which would
  // overflow the row at phone widths.
  if (isNarrow) {
    const iconBtn =
      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors active:bg-primary/10 disabled:opacity-35';
    return (
      <div className="flex shrink-0 items-center gap-1 border-b border-primary/30 bg-primary/8 px-2 py-1.5">
        <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full active:bg-primary/10">
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={allSelected}
            onChange={handleSelectAll}
            className="h-[18px] w-[18px] cursor-pointer rounded accent-primary"
            aria-label={allSelected ? 'Deselect all' : 'Select all loaded'}
          />
        </label>
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
          {hasSelection ? `${selectedKeys.size} selected` : 'Select items'}
        </span>
        <button
          onClick={handleDownload}
          disabled={fileCount === 0}
          className={cn(iconBtn, 'text-foreground')}
          aria-label="Download selected"
        >
          <DownloadActionIcon size={19} />
        </button>
        <button
          onClick={handleCopyKeys}
          disabled={!hasSelection}
          className={cn(iconBtn, 'text-foreground')}
          aria-label="Copy keys"
        >
          <CopyActionIcon size={19} />
        </button>
        <button
          onClick={handleDelete}
          disabled={!hasSelection}
          className={cn(iconBtn, 'text-destructive')}
          aria-label="Delete selected"
        >
          <DeleteActionIcon size={19} />
        </button>
        <button
          onClick={handleExit}
          className="ml-0.5 shrink-0 rounded-full px-3 py-1.5 text-[14px] font-semibold text-primary active:bg-primary/10"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 border-b border-primary/30 bg-primary/8 px-5 py-2',
      )}
    >
      <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-primary/10">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={allSelected}
          onChange={handleSelectAll}
          className="h-4 w-4 cursor-pointer rounded accent-primary"
          aria-label={allSelected ? 'Deselect all' : 'Select all loaded'}
        />
      </label>

      <span className="text-[13px]">
        {hasSelection ? (
          <>
            <strong className="font-semibold text-foreground">{selectedKeys.size}</strong>
            <span className="text-muted-foreground"> of {totalLoaded} selected</span>
          </>
        ) : (
          <span className="text-muted-foreground">Select items to act on</span>
        )}
      </span>

      <span className="flex-1" />

      <Button
        variant="outline"
        size="sm"
        className="h-8 shadow-sm"
        onClick={handleDownload}
        disabled={fileCount === 0}
        title={fileCount === 0 ? 'No files selected' : `Download ${fileCount} file(s)`}
      >
        <DownloadActionIcon size={13} className="mr-1.5" />
        Download
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="h-8 shadow-sm"
        onClick={handleCopyKeys}
        disabled={!hasSelection}
      >
        <CopyActionIcon size={13} className="mr-1.5" />
        Copy keys
      </Button>

      <Button
        variant="outline"
        size="sm"
        className={cn(
          'h-8 shadow-sm',
          hasSelection &&
            'border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive',
        )}
        onClick={handleDelete}
        disabled={!hasSelection}
      >
        <DeleteActionIcon size={13} className="mr-1.5" />
        Delete
      </Button>

      <Button variant="ghost" size="sm" className="h-8 px-3" onClick={handleExit}>
        Exit
      </Button>
    </div>
  );
}
