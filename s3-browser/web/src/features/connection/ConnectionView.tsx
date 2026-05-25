/**
 * ConnectionView — lists every bucket reachable through a single connection.
 *
 * Mirrors the BucketList page in the Admin Console: DetailPageHeader with a
 * back button + connection metadata, then a Card grid of buckets. Picking a
 * bucket hands off to BucketView (which mounts the embedded FileBrowser).
 */
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Database, Folder, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent } from '@garage/ui';

import { api } from '@/lib/api';
import { connectionDisplayMeta, formatShortDate } from '@/lib/connection-display';
import type { Bucket as BucketInfo, Connection } from '@/lib/types';
// No avatar here — DetailPageHeader (admin) stays text-only; the provider
// surface is conveyed via the Badge below.

export function ConnectionView({
  connection,
  onBack,
  onOpenBucket,
}: {
  connection: Connection;
  onBack: () => void;
  onOpenBucket: (bucket: string) => void;
}) {
  const meta = connectionDisplayMeta(connection);

  const list = useQuery({
    queryKey: ['connection-buckets', connection.id],
    queryFn: async () => {
      const res = await api.get<{ buckets: BucketInfo[] }>(`/connections/${connection.id}/buckets`);
      return res.data.buckets;
    },
  });

  return (
    <div className="space-y-6">
      {/* DetailPageHeader-style header */}
      <div className="flex flex-col gap-2 sm:gap-3 border-b border-border/70 pb-3 sm:pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 space-y-0.5 sm:space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight">{connection.name}</h1>
              <Badge variant="secondary" className="font-normal">
                {meta.provider} · {connection.region}
              </Badge>
            </div>
            <p className="break-all text-xs sm:text-sm text-muted-foreground">
              {connection.endpoint}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end pl-10 sm:pl-0">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => list.refetch()}
            disabled={list.isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${list.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {list.error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to list buckets</AlertTitle>
          <AlertDescription>{(list.error as Error).message}</AlertDescription>
        </Alert>
      )}

      {list.isLoading && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-border/70">
              <CardContent className="h-24 animate-pulse bg-muted/30" />
            </Card>
          ))}
        </div>
      )}

      {!list.isLoading && list.data && list.data.length === 0 && (
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

      {!list.isLoading && list.data && list.data.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.data.map((bucket) => (
            <BucketCard
              key={bucket.name}
              bucket={bucket}
              onOpen={() => onOpenBucket(bucket.name)}
            />
          ))}
        </div>
      )}
    </div>
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
              Created {formatShortDate(bucket.creationDate)}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
