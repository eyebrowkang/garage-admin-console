import { useRef } from 'react';
import {
  FileDirectoryIcon,
  SearchIcon,
  ListUnorderedIcon,
  AppsIcon,
  UploadIcon,
  KebabHorizontalIcon,
  ChecklistIcon,
} from '@primer/octicons-react';
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@garage/ui';
import { useBrowser } from '../../context';
import type { FilterKind } from '../../types';

const TYPE_OPTIONS: Array<{ value: FilterKind; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'folder', label: 'Folders' },
  { value: 'image', label: 'Images' },
  { value: 'text', label: 'Text' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'csv', label: 'CSV' },
  { value: 'code', label: 'Code' },
  { value: 'archive', label: 'Archives' },
  { value: 'unknown', label: 'Unknown' },
];

export function Toolbar({ totalLoaded }: { totalLoaded: number }) {
  const {
    filterQuery,
    setFilterQuery,
    filterKind,
    setFilterKind,
    viewMode,
    setViewMode,
    multiSelectMode,
    setMultiSelectMode,
    openUpload,
    openNewFolder,
  } = useBrowser();

  const searchRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-card/20 px-5 py-3">
      <div className="relative flex h-10 min-w-[240px] flex-1 items-center rounded-md border border-border bg-card px-3 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring/30 md:max-w-[440px]">
        <SearchIcon size={14} className="text-muted-foreground mr-2 shrink-0" />
        <input
          ref={searchRef}
          className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder="Filter by name"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (filterQuery) {
                e.preventDefault();
                setFilterQuery('');
              } else {
                e.currentTarget.blur();
              }
            }
          }}
        />
        {filterQuery && (
          <button
            className="ml-1 text-muted-foreground hover:text-foreground"
            onClick={() => setFilterQuery('')}
            tabIndex={-1}
          >
            ×
          </button>
        )}
      </div>

      <Select value={filterKind} onValueChange={(v) => setFilterKind(v as FilterKind)}>
        <SelectTrigger
          className={cn(
            'h-10 w-[160px] rounded-md text-sm shadow-sm',
            filterKind !== 'all' && 'text-primary border-primary/40 bg-primary/5',
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-sm">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex h-10 items-center overflow-hidden rounded-md border border-border bg-card shadow-sm">
        <button
          className={cn(
            'flex h-10 items-center gap-1.5 px-3 text-sm transition-colors',
            viewMode === 'list'
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
          )}
          onClick={() => setViewMode('list')}
          title="List view"
          aria-label="List view"
        >
          <ListUnorderedIcon size={14} />
          <span className="hidden sm:inline">List</span>
        </button>
        <button
          className={cn(
            'flex h-10 items-center gap-1.5 border-l border-border px-3 text-sm transition-colors',
            viewMode === 'grid'
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
          )}
          onClick={() => setViewMode('grid')}
          title="Grid view"
          aria-label="Grid view"
        >
          <AppsIcon size={14} />
          <span className="hidden sm:inline">Grid</span>
        </button>
      </div>

      <div className="flex-1" />

      {/* Partial-filter notice */}
      {filterQuery && totalLoaded > 0 && (
        <span className="hidden text-[11px] text-muted-foreground lg:inline">
          Filtering {totalLoaded} loaded items only
        </span>
      )}

      {/* Upload */}
      <Button
        size="sm"
        onClick={() => openUpload()}
        className="h-10 gap-1.5 rounded-md px-4 text-sm"
      >
        <UploadIcon size={14} />
        <span>Upload</span>
      </Button>

      {/* Kebab menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-10 w-10 rounded-md p-0 shadow-sm">
            <KebabHorizontalIcon size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setMultiSelectMode(!multiSelectMode)}>
            <ChecklistIcon size={14} className="mr-2" />
            {multiSelectMode ? 'Exit multi-select' : 'Select multiple'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openNewFolder()}>
            <FileDirectoryIcon size={14} className="mr-2" />
            New folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
