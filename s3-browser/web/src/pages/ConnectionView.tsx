/**
 * ConnectionView — lists every bucket reachable through a single connection.
 *
 * Mirrors the Admin Console's bucket list: a breadcrumb + connection header,
 * then a searchable / sortable bucket browser with a list ⇄ grid toggle.
 * Buckets only carry a name + creation date, so the controls stay lean.
 * Picking a bucket pushes `/connections/:id/b/:bucket` so refresh restores it.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Database,
  Folder,
  LayoutGrid,
  List as ListIcon,
  RefreshCw,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  CardContent,
  cn,
  DetailPageHeader,
  InlineLoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@garage/ui';

import { api } from '@/lib/api';
import { formatDate } from '@garage/web-shared';
import { connectionProvider } from '@/lib/connection-display';
import { SearchActionIcon } from '@/lib/action-icons';
import type { Bucket as BucketInfo, Connection } from '@/lib/types';

type SortKey = 'name' | 'created';
type ViewMode = 'list' | 'grid';

const toTime = (value?: string | null) => (value ? new Date(value).getTime() : 0);

export function ConnectionView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const connectionsQ = useQuery({
    queryKey: ['connections'],
    queryFn: async () => {
      const res = await api.get<Connection[]>('/connections');
      return res.data;
    },
  });

  const connection = connectionsQ.data?.find((c) => c.id === id) ?? null;

  const list = useQuery({
    queryKey: ['connection-buckets', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await api.get<{ buckets: BucketInfo[] }>(`/connections/${id}/buckets`);
      return res.data.buckets;
    },
  });

  const buckets = useMemo(() => list.data ?? [], [list.data]);
  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = q ? buckets.filter((b) => b.name.toLowerCase().includes(q)) : buckets;
    return [...matched].sort((a, b) => {
      const cmp =
        sortKey === 'name'
          ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
          : toTime(a.creationDate) - toTime(b.creationDate);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [buckets, search, sortKey, sortDir]);

  if (!connectionsQ.isLoading && !connection) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Connection not found</AlertTitle>
        <AlertDescription>
          The connection may have been removed.{' '}
          <button
            onClick={() => navigate('/')}
            className="text-primary underline-offset-2 hover:underline"
          >
            Back to dashboard
          </button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!connection) {
    return (
      <div className="mx-auto flex h-40 w-full max-w-6xl items-center justify-center">
        <InlineLoadingState label="Loading connection…" />
      </div>
    );
  }

  const provider = connectionProvider(connection);
  const open = (name: string) =>
    navigate(`/connections/${connection.id}/b/${encodeURIComponent(name)}`);
  const hasFilter = search.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <DetailPageHeader
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/">Dashboard</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{connection.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        title={connection.name}
        badges={
          <Badge variant="secondary" className="font-normal">
            {provider} · {connection.region}
          </Badge>
        }
        subtitle={connection.endpoint}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => list.refetch()}
            disabled={list.isFetching}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', list.isFetching && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      {list.error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to list buckets</AlertTitle>
          <AlertDescription>{(list.error as Error).message}</AlertDescription>
        </Alert>
      )}

      {/* Toolbar — only meaningful once there are buckets to act on. */}
      {!list.isLoading && buckets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex h-9 min-w-[200px] flex-1 items-center rounded-md border border-border bg-card px-3 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring/30 sm:max-w-[360px]">
            <SearchActionIcon size={14} className="mr-2 shrink-0 text-muted-foreground" />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Filter buckets by name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {hasFilter && (
              <button
                className="ml-1 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch('')}
                aria-label="Clear filter"
                tabIndex={-1}
              >
                ×
              </button>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-9 w-[140px] text-sm shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="created">Created</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shadow-sm"
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              aria-label={sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'}
              title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortDir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </Button>
            <ViewToggle mode={viewMode} onChange={setViewMode} />
          </div>
        </div>
      )}

      {list.isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-border/70">
              <CardContent className="h-20 animate-pulse bg-muted/30" />
            </Card>
          ))}
        </div>
      )}

      {!list.isLoading && buckets.length === 0 && (
        <Card className="border-2 border-dashed bg-muted/30">
          <CardContent className="flex h-56 flex-col items-center justify-center space-y-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Database className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold">No buckets visible</h3>
              <p className="text-sm text-muted-foreground">
                The credentials can authenticate but cannot list any buckets.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!list.isLoading && buckets.length > 0 && sorted.length === 0 && (
        <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          No buckets match “{search}”.{' '}
          <button
            onClick={() => setSearch('')}
            className="text-primary underline-offset-2 hover:underline"
          >
            Clear filter
          </button>
        </div>
      )}

      {!list.isLoading && sorted.length > 0 && (
        <>
          <div className="text-xs text-muted-foreground">
            <strong className="font-semibold text-foreground">{sorted.length}</strong>{' '}
            {hasFilter ? 'matching ' : ''}bucket{sorted.length === 1 ? '' : 's'}
          </div>
          {viewMode === 'grid' ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map((b) => (
                <BucketCard key={b.name} bucket={b} onOpen={() => open(b.name)} />
              ))}
            </div>
          ) : (
            <div className="divide-y overflow-hidden rounded-lg border bg-card">
              {sorted.map((b) => (
                <BucketRow key={b.name} bucket={b} onOpen={() => open(b.name)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  const btn = (target: ViewMode, label: string, icon: React.ReactNode) => (
    <button
      className={cn(
        'flex h-9 w-9 items-center justify-center transition-colors',
        target === 'grid' && 'border-l border-border',
        mode === target
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
      onClick={() => onChange(target)}
      aria-label={label}
      aria-pressed={mode === target}
      title={label}
    >
      {icon}
    </button>
  );
  return (
    <div className="flex items-center overflow-hidden rounded-md border border-border bg-card shadow-sm">
      {btn('list', 'List view', <ListIcon size={15} />)}
      {btn('grid', 'Grid view', <LayoutGrid size={15} />)}
    </div>
  );
}

function BucketRow({ bucket, onOpen }: { bucket: BucketInfo; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Folder className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium transition-colors group-hover:text-primary">
        {bucket.name}
      </span>
      {bucket.creationDate && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatDate(bucket.creationDate)}
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
    </button>
  );
}

function BucketCard({ bucket, onOpen }: { bucket: BucketInfo; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Folder className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold transition-colors group-hover:text-primary">
            {bucket.name}
          </div>
          {bucket.creationDate && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              Created {formatDate(bucket.creationDate)}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
