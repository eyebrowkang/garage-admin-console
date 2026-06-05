import { useState } from 'react';

import { useMediaQuery } from '../hooks/use-media-query';
import { cn } from '../lib/cn';
import { CopyValue } from './copy-value';
import { EmptyValue } from './empty-value';
import { Popover } from './popover';

export interface AliasOverflowItem {
  /** React key. */
  key: string;
  /** Displayed + copied text. */
  value: string;
  /** Copy label, e.g. "Global alias". */
  label?: string;
}

interface AliasOverflowProps {
  items: AliasOverflowItem[];
  /** Chips shown inline before collapsing the rest into "+N". */
  maxVisible?: number;
  emptyLabel?: string;
  className?: string;
}

function MoreChip({ count }: { count: number }) {
  return (
    <span className="inline-flex cursor-pointer items-center rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:min-h-11">
      +{count}
    </span>
  );
}

/**
 * Collapses a list of copyable chips (aliases, tags) to a single line: the first
 * `maxVisible` inline, the rest behind a "+N" chip. On desktop "+N" opens a
 * popover listing them all (so the row never grows); on touch — where popover
 * placement is finicky — it expands in place instead.
 */
export function AliasOverflow({
  items,
  maxVisible = 1,
  emptyLabel = 'None',
  className,
}: AliasOverflowProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return <EmptyValue label={emptyLabel} />;

  const chip = (item: AliasOverflowItem) => (
    <CopyValue
      key={item.key}
      value={item.value}
      label={item.label ?? 'Alias'}
      variant="chip"
      className="text-xs"
    >
      {item.value}
    </CopyValue>
  );

  // Touch, expanded: every chip inline (wraps), with a collapse control.
  if (!isDesktop && expanded) {
    return (
      <div className={cn('flex flex-wrap items-center gap-1', className)}>
        {items.map(chip)}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(false);
          }}
          className="rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Show less
        </button>
      </div>
    );
  }

  const visible = items.slice(0, maxVisible);
  const hiddenCount = items.length - visible.length;

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {visible.map(chip)}
      {hiddenCount > 0 &&
        (isDesktop ? (
          <Popover align="start" className="w-60" trigger={<MoreChip count={hiddenCount} />}>
            <div className="mb-1 px-1 text-xs font-medium text-muted-foreground">
              All aliases ({items.length})
            </div>
            <div className="flex flex-wrap gap-1">{items.map(chip)}</div>
          </Popover>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
            }}
          >
            <MoreChip count={hiddenCount} />
          </button>
        ))}
    </div>
  );
}
