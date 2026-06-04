import {
  Fragment,
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal, Search } from 'lucide-react';

import { cn } from '../lib/cn';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { Input } from './input';
import { Sheet, SheetContent, SheetTitle } from './sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

/**
 * ResourceList — the one shell every cluster list page renders through.
 *
 * It owns the parts that used to be re-implemented (and quietly drift) on each
 * page: search, sort, multi-select + a bulk-action bar, the empty / search-miss
 * states, and — crucially — the responsive contract. On `md`+ it is a real
 * table; below `md` every row reflows into a stacked label/value card so no
 * column is lost to a horizontal scrollbar on a phone. Pages stay declarative:
 * they describe columns and hand over data, nothing about layout.
 */

export type SortDirection = 'asc' | 'desc';

export interface ResourceListColumn<T> {
  /** Stable id, also used as the sort key. */
  id: string;
  /** Column header (desktop) and default mobile field label. */
  header: ReactNode;
  /** Cell content, shared by the desktop cell and the mobile card value. */
  cell: (item: T) => ReactNode;
  /** Extra className for the desktop `<th>`. */
  headClassName?: string;
  /** Extra className for the desktop `<td>`. */
  cellClassName?: string;
  /** Make the column click-to-sort (desktop header + mobile sort chip). */
  sortable?: boolean;
  /** Sort key accessor; required when `sortable`. Nulls sort last. */
  sortAccessor?: (item: T) => string | number | null | undefined;
  /** Drop this field from the mobile card (e.g. it duplicates the title). */
  mobileHidden?: boolean;
  /** Mobile field label, when `header` is not plain text. Defaults to `header`. */
  mobileLabel?: ReactNode;
  /** Render this field as the mobile card subtitle (directly under the title, no
   *  label) rather than a labeled row — e.g. a secondary id beneath the name. */
  mobileSubtitle?: boolean;
}

export interface ResourceListEmptyState {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Optional CTA, shown only for a genuinely empty list (never for a search miss). */
  action?: ReactNode;
}

export interface ResourceListSelection<T> {
  /** Rows that cannot be selected (checkbox hidden), e.g. an entry with no id. */
  isSelectable?: (item: T) => boolean;
  /** Bulk-action bar content for the live selection. `clear` empties the selection. */
  renderActions: (selected: T[], clear: () => void) => ReactNode;
}

export interface ResourceListProps<T> {
  items: T[];
  columns: ResourceListColumn<T>[];
  getRowId: (item: T) => string;
  /** Identity heading for each mobile card. */
  renderTitle: (item: T) => ReactNode;
  /** Row / card click — typically navigation to a detail page. */
  onRowClick?: (item: T) => void;
  /** Accessible label for a navigable row, e.g. "Open bucket photos". Used as the
   * row's aria-label so keyboard/screen-reader users know where it leads. */
  getRowLabel?: (item: T) => string;
  /** Whether a row participates in click/keyboard navigation. Defaults to true
   * whenever `onRowClick` is set; return false to make a specific row inert. */
  isRowInteractive?: (item: T) => boolean;
  /** Built-in search; the shell renders the field and filters internally. */
  search?: {
    placeholder?: string;
    /** Match predicate. `query` arrives lower-cased and trimmed. */
    predicate: (item: T, query: string) => boolean;
  };
  /** Initial sort; omit to keep the source order until the user sorts. */
  defaultSort?: { columnId: string; direction: SortDirection };
  /** Enable multi-select + bulk actions. */
  selection?: ResourceListSelection<T>;
  /** Trailing per-row actions (e.g. Delete). */
  rowActions?: (item: T) => ReactNode;
  emptyState: ResourceListEmptyState;
  className?: string;
}

function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last, regardless of direction's later flip
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export function ResourceList<T>({
  items,
  columns,
  getRowId,
  renderTitle,
  onRowClick,
  getRowLabel,
  isRowInteractive,
  search,
  defaultSort,
  selection,
  rowActions,
  emptyState,
  className,
}: ResourceListProps<T>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ columnId: string; direction: SortDirection } | null>(
    defaultSort ?? null,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // Mobile: the row whose action sheet is open (no hover affordance on touch).
  const [actionItem, setActionItem] = useState<T | null>(null);

  const columnById = useMemo(() => {
    const map = new Map<string, ResourceListColumn<T>>();
    for (const col of columns) map.set(col.id, col);
    return map;
  }, [columns]);

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!search || !normalizedQuery) return items;
    return items.filter((item) => search.predicate(item, normalizedQuery));
  }, [items, search, normalizedQuery]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columnById.get(sort.columnId);
    if (!col?.sortAccessor) return filtered;
    const accessor = col.sortAccessor;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => dir * compareValues(accessor(a), accessor(b)));
  }, [filtered, sort, columnById]);

  const toggleSort = useCallback((columnId: string) => {
    setSort((prev) =>
      prev?.columnId === columnId
        ? { columnId, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { columnId, direction: 'asc' },
    );
  }, []);

  const isSelectable = useCallback(
    (item: T) => selection?.isSelectable?.(item) ?? true,
    [selection],
  );
  const selectedItems = useMemo(
    () => (selection ? items.filter((item) => selectedIds.has(getRowId(item))) : []),
    [selection, items, selectedIds, getRowId],
  );
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Select-all operates over the rows currently visible (filtered) and selectable.
  const visibleSelectableIds = useMemo(
    () => sorted.filter(isSelectable).map(getRowId),
    [sorted, isSelectable, getRowId],
  );
  const allVisibleSelected =
    visibleSelectableIds.length > 0 && visibleSelectableIds.every((id) => selectedIds.has(id));
  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (visibleSelectableIds.every((id) => next.has(id))) {
        for (const id of visibleSelectableIds) next.delete(id);
      } else {
        for (const id of visibleSelectableIds) next.add(id);
      }
      return next;
    });
  }, [visibleSelectableIds]);

  const sortableColumns = useMemo(() => columns.filter((c) => c.sortable), [columns]);
  // Mobile card body: subtitle fields (no label, under the title) vs labeled rows.
  const mobileSubtitleColumns = useMemo(
    () => columns.filter((c) => !c.mobileHidden && c.mobileSubtitle),
    [columns],
  );
  const mobileLabeledColumns = useMemo(
    () => columns.filter((c) => !c.mobileHidden && !c.mobileSubtitle),
    [columns],
  );
  const totalColumns = (selection ? 1 : 0) + columns.length + (rowActions ? 1 : 0);

  const isTrulyEmpty = items.length === 0;
  const isSearchMiss = !isTrulyEmpty && sorted.length === 0;
  const isEmpty = sorted.length === 0;

  const EmptyIcon = emptyState.icon;
  const emptyBlock = (
    <div className="flex flex-col items-center justify-center space-y-3 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <EmptyIcon className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h3 className="font-medium text-foreground">
          {isSearchMiss ? 'No matches' : emptyState.title}
        </h3>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {isSearchMiss
            ? `No results for “${query.trim()}”. Try a different term.`
            : emptyState.description}
        </p>
      </div>
      {!isSearchMiss && emptyState.action && <div className="pt-2">{emptyState.action}</div>}
    </div>
  );

  const renderSortIcon = (columnId: string) => {
    if (sort?.columnId !== columnId)
      return <ArrowUpDown className="ml-1 inline h-3 w-3 text-muted-foreground/50" />;
    return sort.direction === 'asc' ? (
      <ArrowUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3" />
    );
  };

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  // A row is keyboard/SR-navigable when there's an onRowClick and the row opts in.
  const rowInteractive = (item: T) =>
    Boolean(onRowClick) && (isRowInteractive ? isRowInteractive(item) : true);
  // Activate only when the key lands on the row itself, so Enter on a nested
  // control (Delete, checkbox, copy) doesn't also fire row navigation.
  const onRowKeyDown = (e: KeyboardEvent, item: T) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) {
      e.preventDefault();
      onRowClick?.(item);
    }
  };

  // The floating selection bar stays mounted so it can slide out; while it's
  // sliding away (selection just emptied) we keep showing the last selection so
  // the label/actions don't flicker to "0" mid-animation.
  const selectionVisible = selectedItems.length > 0;
  const lastSelectionRef = useRef<T[]>([]);
  if (selectionVisible) lastSelectionRef.current = selectedItems;
  const barItems = selectionVisible ? selectedItems : lastSelectionRef.current;

  return (
    <div className={cn('space-y-3', className)}>
      {search && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={search.placeholder ?? 'Search...'}
              className="pl-9"
              aria-label={search.placeholder ?? 'Search'}
            />
          </div>
          <span
            className="shrink-0 whitespace-nowrap text-sm tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            {sorted.length} {sorted.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      )}

      {/* Selection actions float over the lower portion of the viewport (not glued
          to the bottom edge) instead of sitting in-flow above the table — so
          showing/hiding them never shifts the list. Kept mounted (when selection
          is enabled) so it can slide in and out. */}
      {selection && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[15vh] z-40 flex justify-center px-4"
          aria-hidden={!selectionVisible}
        >
          <div
            role="region"
            aria-label="Selection actions"
            className={cn(
              'pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-primary/30 bg-card px-2.5 py-2 shadow-lg transition-all duration-200 ease-out motion-reduce:transition-none',
              selectionVisible
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-[calc(100%+1.5rem)] opacity-0',
            )}
          >
            <span className="whitespace-nowrap pl-1.5 text-sm font-medium text-foreground">
              {barItems.length} selected
            </span>
            <div className="flex items-center gap-2">
              {selection.renderActions(barItems, clearSelection)}
            </div>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Desktop: real table */}
      <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {selection && (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select all rows"
                    checked={allVisibleSelected}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
              )}
              {columns.map((col) => (
                <TableHead
                  key={col.id}
                  className={col.headClassName}
                  aria-sort={
                    col.sortable && sort?.columnId === col.id
                      ? sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.id)}
                      className="-mx-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs font-medium uppercase tracking-wide transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {col.header}
                      {renderSortIcon(col.id)}
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              ))}
              {rowActions && (
                <TableHead className="w-0 p-0">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((item) => {
              const id = getRowId(item);
              const selected = selectedIds.has(id);
              const interactive = rowInteractive(item);
              return (
                <TableRow
                  key={id}
                  data-state={selected ? 'selected' : undefined}
                  className={cn(
                    // `group` so the row's actions can reveal on hover / focus-within.
                    'group',
                    // Focus indicator is a background tint, not a ring: <tr> boxes
                    // don't reliably paint outline/box-shadow (the cells cover them).
                    interactive &&
                      'cursor-pointer hover:bg-muted/50 focus-visible:bg-primary/15 focus-visible:outline-none',
                  )}
                  onClick={interactive ? () => onRowClick?.(item) : undefined}
                  role={interactive ? 'link' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  aria-label={interactive ? getRowLabel?.(item) : undefined}
                  onKeyDown={interactive ? (e) => onRowKeyDown(e, item) : undefined}
                >
                  {selection && (
                    <TableCell onClick={stop}>
                      {isSelectable(item) && (
                        <Checkbox
                          aria-label="Select row"
                          checked={selected}
                          onCheckedChange={() => toggleOne(id)}
                        />
                      )}
                    </TableCell>
                  )}
                  {columns.map((col) => (
                    <TableCell key={col.id} className={col.cellClassName}>
                      {col.cell(item)}
                    </TableCell>
                  ))}
                  {rowActions && (
                    // Zero-width cell; the actions float over the row's right edge
                    // and only appear on hover or keyboard focus, so they neither
                    // reserve an empty gutter nor clutter the resting state.
                    <TableCell className="relative w-0 p-0" onClick={stop}>
                      <div className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center rounded-md border bg-card opacity-0 shadow-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                        {rowActions(item)}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {isEmpty && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={totalColumns} className="h-48 p-0">
                  {emptyBlock}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: stacked cards */}
      <div className="space-y-2 md:hidden">
        {sortableColumns.length > 0 && !isEmpty && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">Sort</span>
            {sortableColumns.map((col) => {
              const active = sort?.columnId === col.id;
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => toggleSort(col.id)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors',
                    active
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {col.mobileLabel ?? col.header}
                  {active &&
                    (sort?.direction === 'asc' ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    ))}
                </button>
              );
            })}
          </div>
        )}

        {sorted.map((item) => {
          const id = getRowId(item);
          const selected = selectedIds.has(id);
          const interactive = rowInteractive(item);
          return (
            <div
              key={id}
              data-state={selected ? 'selected' : undefined}
              className={cn(
                'rounded-lg border bg-card p-3 transition-colors data-[state=selected]:border-primary/40 data-[state=selected]:bg-primary/5',
                interactive &&
                  'cursor-pointer active:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              onClick={interactive ? () => onRowClick?.(item) : undefined}
              role={interactive ? 'link' : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={interactive ? getRowLabel?.(item) : undefined}
              onKeyDown={interactive ? (e) => onRowKeyDown(e, item) : undefined}
            >
              {/* Header row: checkbox · title · ⋯ — all aligned on the title line. */}
              <div className="flex items-center gap-3">
                {selection && isSelectable(item) && (
                  <label className="flex shrink-0 cursor-pointer" onClick={stop}>
                    <Checkbox
                      aria-label="Select row"
                      checked={selected}
                      onCheckedChange={() => toggleOne(id)}
                    />
                  </label>
                )}
                <div className="min-w-0 flex-1 font-medium text-foreground">
                  {renderTitle(item)}
                </div>
                {rowActions && (
                  <button
                    type="button"
                    aria-label="Row actions"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActionItem(item);
                    }}
                    className="-mr-1 -my-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:h-11 pointer-coarse:w-11"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Body: subtitle (no label) + labeled fields, indented under the title. */}
              {(mobileSubtitleColumns.length > 0 || mobileLabeledColumns.length > 0) && (
                <div className={cn('mt-2 space-y-1.5', selection && isSelectable(item) && 'pl-7')}>
                  {mobileSubtitleColumns.map((col) => (
                    <div key={col.id} className="min-w-0 text-sm text-muted-foreground">
                      {col.cell(item)}
                    </div>
                  ))}
                  {mobileLabeledColumns.length > 0 && (
                    <dl className="grid grid-cols-[minmax(4rem,auto)_1fr] gap-x-3 gap-y-1 text-sm">
                      {mobileLabeledColumns.map((col) => (
                        <Fragment key={col.id}>
                          <dt className="text-muted-foreground">{col.mobileLabel ?? col.header}</dt>
                          <dd className="min-w-0 text-foreground">{col.cell(item)}</dd>
                        </Fragment>
                      ))}
                    </dl>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {isEmpty && <div className="rounded-lg border bg-card">{emptyBlock}</div>}
      </div>

      {/* Mobile: each card's ⋯ opens this bottom sheet with the row's actions. */}
      {rowActions && (
        <Sheet open={!!actionItem} onOpenChange={(open) => !open && setActionItem(null)}>
          <SheetContent
            side="bottom"
            aria-describedby={undefined}
            className="rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          >
            <SheetTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Actions
            </SheetTitle>
            {actionItem && (
              <div className="mt-1 min-w-0 text-base font-medium text-foreground">
                {renderTitle(actionItem)}
              </div>
            )}
            <div
              className="mt-4 flex flex-col gap-1 [&_button]:w-full [&_button]:justify-start"
              onClick={() => setActionItem(null)}
            >
              {actionItem && rowActions(actionItem)}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
