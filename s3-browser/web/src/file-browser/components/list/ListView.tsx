import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@garage/ui';
import { useBrowser } from '../../context';
import { FileRow } from './FileRow';
import type { ListItem, SortKey } from '../../types';

interface ListViewProps {
  items: ListItem[];
}

function SortButton({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
  title,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  dir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  title?: string;
}) {
  const isActive = currentKey === sortKey;
  return (
    <button
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-semibold tracking-wider uppercase',
        'transition-colors',
        isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
      onClick={() => onSort(sortKey)}
      title={title}
    >
      {label}
      {isActive ? (
        dir === 'asc' ? (
          <ArrowUp size={10} />
        ) : (
          <ArrowDown size={10} />
        )
      ) : (
        <ArrowUpDown size={10} className="opacity-30" />
      )}
    </button>
  );
}

export function ListView({ items }: ListViewProps) {
  const { sortState, handleSort, multiSelectMode, selectedKeys, selectAll, isNarrow } =
    useBrowser();
  const parentRef = useRef<HTMLDivElement>(null);
  const ROW_HEIGHT = isNarrow ? 64 : 58;
  const visibleKeys = items.map((item) => (item.type === 'folder' ? item.prefix : item.key));
  const allSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selectedKeys.has(key));

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is the list virtualizer for this surface.
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const scrollArea = (
    <div ref={parentRef} className={cn('min-h-0 flex-1 overflow-y-auto', isNarrow && 'pb-24')}>
      <div style={{ height: rowVirtualizer.getTotalSize() }} className="relative">
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          if (!item) return null;
          const key = item.type === 'folder' ? item.prefix : item.key;
          return (
            <div
              key={key}
              style={{
                position: 'absolute',
                top: virtualRow.start,
                left: 0,
                right: 0,
                height: virtualRow.size,
              }}
            >
              <FileRow
                item={item}
                isSelected={selectedKeys.has(key)}
                showCheckbox={multiSelectMode}
                visibleKeys={visibleKeys}
              />
            </div>
          );
        })}
      </div>
    </div>
  );

  // Mobile: flat, edge-to-edge list — no card chrome, no column header (sort
  // lives in the mobile controls bar). Just the virtualized rows.
  if (isNarrow) {
    return <div className="flex min-h-0 flex-1 flex-col">{scrollArea}</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-4">
      <div className="flex min-h-0 max-h-full flex-col overflow-hidden rounded-md border border-border bg-card shadow-sm">
        <div
          className={cn(
            'grid h-11 shrink-0 items-center gap-3 border-b border-border bg-muted/25 px-5',
            'grid-cols-[34px_minmax(220px,2.4fr)_minmax(110px,0.7fr)_minmax(170px,1fr)_116px]',
          )}
        >
          <div className="flex justify-center">
            {multiSelectMode && (
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => selectAll(allSelected ? [] : visibleKeys)}
                className="h-4 w-4 cursor-pointer rounded accent-primary"
                aria-label="Select all loaded items"
              />
            )}
          </div>
          <SortButton
            label="Name"
            sortKey="name"
            currentKey={sortState.key}
            dir={sortState.dir}
            onSort={handleSort}
          />
          <SortButton
            label="Size"
            sortKey="size"
            currentKey={sortState.key}
            dir={sortState.dir}
            onSort={handleSort}
            title="Sorted on loaded items only"
          />
          <SortButton
            label="Last Modified"
            sortKey="modified"
            currentKey={sortState.key}
            dir={sortState.dir}
            onSort={handleSort}
            title="Sorted on loaded items only"
          />
          <span className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Actions
          </span>
        </div>

        {scrollArea}
      </div>
    </div>
  );
}
