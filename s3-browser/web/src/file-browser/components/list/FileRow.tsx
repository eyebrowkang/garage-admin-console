import { createElement } from 'react';
import { cn } from '@garage/ui';
import { fileKind, formatBytes, formatDate, formatDateTime } from '@garage/web-shared';
import { getFileKindIcon, iconBgClass, iconColorClass } from '../../icons';
import { useBrowser } from '../../context';
import type { ListItem } from '../../types';
import { ItemActions } from './ItemActions';

interface FileRowProps {
  item: ListItem;
  isSelected: boolean;
  showCheckbox: boolean;
  visibleKeys: string[];
  style?: React.CSSProperties;
}

function keyForItem(item: ListItem) {
  return item.type === 'folder' ? item.prefix : item.key;
}

export function FileRow({ item, isSelected, showCheckbox, visibleKeys, style }: FileRowProps) {
  const { onPathChange, setActiveFile, activeFileKey, toggleSelection, selectRange, isNarrow } =
    useBrowser();

  const kind = item.type === 'folder' ? 'folder' : fileKind(item.name);
  const Icon = getFileKindIcon(kind, false);
  const isActiveFile = item.type === 'file' && activeFileKey === item.key;
  const itemKey = keyForItem(item);

  const handleSelectionClick = (e: React.MouseEvent | React.ChangeEvent) => {
    const mouseEvent = e as React.MouseEvent;
    if ('shiftKey' in mouseEvent && mouseEvent.shiftKey) {
      selectRange(visibleKeys, itemKey, mouseEvent.metaKey || mouseEvent.ctrlKey);
    } else {
      toggleSelection(itemKey);
    }
  };

  const handleRowClick = (e: React.MouseEvent) => {
    if (showCheckbox) {
      handleSelectionClick(e);
      return;
    }
    if (item.type === 'folder') {
      const segs = item.prefix.replace(/\/$/, '').split('/').filter(Boolean);
      onPathChange(segs);
    } else {
      setActiveFile(item);
    }
  };

  // Mobile: a flat, two-line row (icon · name / "date · size" · ⋯) that never
  // overflows horizontally — mirrors the OneDrive file list.
  if (isNarrow) {
    return (
      <div
        style={style}
        className={cn(
          'group flex h-full cursor-pointer items-center gap-3 border-b border-border/45 px-4 transition-colors',
          isSelected ? 'bg-primary/8' : 'active:bg-muted/50',
          isActiveFile && 'bg-primary/5',
        )}
        onClick={handleRowClick}
      >
        {showCheckbox ? (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => undefined}
            onClick={(e) => {
              e.stopPropagation();
              handleSelectionClick(e);
            }}
            className="h-[18px] w-[18px] shrink-0 rounded accent-primary"
          />
        ) : (
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              iconBgClass[kind],
              iconColorClass[kind],
            )}
          >
            {createElement(Icon, { size: 18 })}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'truncate text-[15px] leading-tight',
              item.type === 'folder' ? 'font-semibold' : 'font-medium',
              'text-foreground',
            )}
            title={item.name}
          >
            {item.name}
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
            {item.type === 'file'
              ? `${formatDate(item.object.lastModified)} · ${formatBytes(item.object.size)}`
              : 'Folder'}
          </div>
        </div>

        <ItemActions item={item} itemKey={itemKey} menuClassName="h-9 w-9" />
      </div>
    );
  }

  return (
    <div
      style={style}
      className={cn(
        'group grid h-full cursor-pointer items-center gap-3 border-b border-border/45 px-5 transition-colors',
        'grid-cols-[34px_minmax(220px,2.4fr)_minmax(110px,0.7fr)_minmax(170px,1fr)_116px]',
        isSelected ? 'bg-primary/8 hover:bg-primary/12' : 'hover:bg-muted/45',
        isActiveFile && 'bg-primary/5 shadow-[inset_3px_0_0_hsl(var(--primary))]',
      )}
      onClick={handleRowClick}
    >
      {/* checkbox / icon */}
      <div className="flex items-center justify-center">
        {showCheckbox ? (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => undefined}
            onClick={(e) => {
              e.stopPropagation();
              handleSelectionClick(e);
            }}
            className="w-4 h-4 rounded accent-primary cursor-pointer"
          />
        ) : (
          <span
            className={cn(
              'w-[22px] h-[22px] rounded-md flex items-center justify-center shrink-0',
              iconBgClass[kind],
              iconColorClass[kind],
            )}
          >
            {createElement(Icon, { size: 12 })}
          </span>
        )}
      </div>

      {/* name */}
      <span
        className={cn(
          'truncate text-[14px] font-medium',
          item.type === 'folder' ? 'text-primary font-semibold' : 'text-foreground',
        )}
        title={item.name}
      >
        {item.name}
        {item.type === 'folder' ? '/' : ''}
      </span>

      {/* size */}
      <span className="font-mono text-[12px] text-muted-foreground">
        {item.type === 'file' ? formatBytes(item.object.size) : '—'}
      </span>

      {/* modified */}
      <span className="text-[12px] text-muted-foreground">
        {item.type === 'file' ? formatDateTime(item.object.lastModified) : '—'}
      </span>

      {/* actions */}
      <ItemActions item={item} itemKey={itemKey} />
    </div>
  );
}
