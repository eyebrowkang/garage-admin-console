/**
 * Compact single-row toolbar for narrow screens — a OneDrive-style controls
 * strip: a search pill, a sort dropdown, and a kebab (select / view / filter).
 * Upload + New folder live on the floating action button (see FolderView).
 */
import { ArrowDown, ArrowUp, LayoutGrid, List as ListIcon } from 'lucide-react';
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@garage/ui';
import { MoreActionIcon, SearchActionIcon, SelectActionIcon } from '@/lib/action-icons';
import { useBrowser } from '../../context';
import type { FilterKind, SortKey } from '../../types';
import { TYPE_OPTIONS } from './Toolbar';

const SORT_LABELS: Record<SortKey, string> = {
  name: 'Name',
  size: 'Size',
  modified: 'Modified',
};

const pillButton =
  'flex h-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors active:bg-muted';

export function MobileToolbar() {
  const {
    filterQuery,
    setFilterQuery,
    filterKind,
    setFilterKind,
    viewMode,
    setViewMode,
    multiSelectMode,
    setMultiSelectMode,
    sortState,
    handleSort,
  } = useBrowser();

  const DirIcon = sortState.dir === 'asc' ? ArrowUp : ArrowDown;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-card/30 px-3 py-2.5">
      {/* Search pill */}
      <div className="relative flex h-10 min-w-0 flex-1 items-center rounded-full border border-border bg-muted/40 px-3.5 transition-colors focus-within:bg-card focus-within:ring-2 focus-within:ring-ring/25">
        <SearchActionIcon size={15} className="mr-2 shrink-0 text-muted-foreground" />
        <input
          className="min-w-0 flex-1 border-0 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          placeholder="Search"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && filterQuery) {
              e.preventDefault();
              setFilterQuery('');
            }
          }}
        />
        {filterQuery && (
          <button
            className="ml-1 shrink-0 text-lg leading-none text-muted-foreground hover:text-foreground"
            onClick={() => setFilterQuery('')}
            tabIndex={-1}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* Sort */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn(pillButton, 'gap-1 px-3 text-[13px] font-medium')} aria-label="Sort">
            <span>{SORT_LABELS[sortState.key]}</span>
            <DirIcon size={14} className="text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {(['name', 'size', 'modified'] as SortKey[]).map((k) => (
            <DropdownMenuItem key={k} onClick={() => handleSort(k)}>
              {SORT_LABELS[k]}
              {sortState.key === k && <DirIcon size={14} className="ml-auto text-muted-foreground" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Kebab */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn(pillButton, 'w-10 text-muted-foreground')} aria-label="More options">
            <MoreActionIcon size={17} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => setMultiSelectMode(!multiSelectMode)}>
            <SelectActionIcon size={15} />
            {multiSelectMode ? 'Exit selection' : 'Select'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}>
            {viewMode === 'grid' ? <ListIcon size={15} /> : <LayoutGrid size={15} />}
            {viewMode === 'grid' ? 'List view' : 'Grid view'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className={cn(filterKind !== 'all' && 'text-primary')}>
              {filterKind === 'all'
                ? 'Filter by type'
                : `Type: ${TYPE_OPTIONS.find((o) => o.value === filterKind)?.label}`}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={filterKind}
                onValueChange={(v) => setFilterKind(v as FilterKind)}
              >
                {TYPE_OPTIONS.map((opt) => (
                  <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
