import { createElement } from 'react';
import { cn } from '@garage/ui';
import { fileKind, formatBytes } from '@garage/web-shared';
import { getFileKindIcon, iconBgClass, iconColorClass } from '../../icons';
import { useBrowser } from '../../context';
import type { ListItem } from '../../types';
import { ItemActions } from './ItemActions';

interface FileCardProps {
  item: ListItem;
  isSelected: boolean;
  showCheckbox: boolean;
  visibleKeys: string[];
}

export function FileCard({ item, isSelected, showCheckbox, visibleKeys }: FileCardProps) {
  const { onPathChange, setActiveFile, activeFileKey, toggleSelection, selectRange } = useBrowser();

  const kind = item.type === 'folder' ? 'folder' : fileKind(item.name);
  const Icon = getFileKindIcon(kind, false);
  const isActiveFile = item.type === 'file' && activeFileKey === item.key;
  const itemKey = item.type === 'folder' ? item.prefix : item.key;

  const handleSelectionClick = (e: React.MouseEvent) => {
    if (e.shiftKey) selectRange(visibleKeys, itemKey, e.metaKey || e.ctrlKey);
    else toggleSelection(itemKey);
  };

  const handleClick = (e: React.MouseEvent) => {
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

  return (
    <div
      className={cn(
        'relative flex cursor-pointer flex-col gap-2 rounded-md border bg-card p-3',
        'transition-[border-color,box-shadow,background-color] duration-100',
        'group',
        isSelected
          ? 'border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.15)] bg-primary/4'
          : 'border-border hover:shadow-sm hover:border-border',
        isActiveFile && 'border-primary bg-primary/4',
      )}
      onClick={handleClick}
      title={item.name}
    >
      <ItemActions
        item={item}
        itemKey={itemKey}
        className={cn(
          'absolute right-2 top-2 z-10 opacity-100 transition-opacity',
          'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100',
        )}
        menuClassName="border border-border/60 bg-card/90 shadow-sm backdrop-blur"
      />

      {/* checkbox */}
      {showCheckbox && (
        <div className="absolute top-2 left-2 z-10">
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
        </div>
      )}

      {/* thumbnail / icon */}
      <div
        className={cn(
          'flex aspect-[4/3] w-full items-center justify-center rounded-md',
          iconBgClass[kind],
          iconColorClass[kind],
        )}
      >
        {createElement(Icon, { size: 24 })}
      </div>

      {/* name */}
      <span
        className={cn(
          'truncate text-xs font-medium',
          item.type === 'folder' ? 'text-primary font-semibold' : 'text-foreground',
        )}
      >
        {item.name}
        {item.type === 'folder' ? '/' : ''}
      </span>
      <span className="truncate font-mono text-[11px] text-muted-foreground">
        {item.type === 'file' ? formatBytes(item.object.size) : 'Folder'}
      </span>
    </div>
  );
}
