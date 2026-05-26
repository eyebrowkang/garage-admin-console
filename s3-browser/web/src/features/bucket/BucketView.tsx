/**
 * BucketView — DetailPageHeader breadcrumb + the federated FileBrowser inside
 * a card that matches Admin Console's surface (rounded-xl border bg-card).
 *
 * The in-bucket path lives in the URL via a splat segment:
 *   /connections/:id/b/:bucket/foo/bar
 *
 * The FileBrowser stays router-free so embedders don't have to pull in
 * react-router — App resolves the splat to path[] and pushes new URLs on
 * navigation, so refresh restores the exact folder the user was in.
 */
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { Alert, AlertDescription, AlertTitle, Badge, Button } from '@garage/ui';

import { api, buildBucketBackend } from '@/lib/api';
import { connectionDisplayMeta } from '@/lib/connection-display';
import type { Connection } from '@/lib/types';
import { FileBrowser, type FileBrowserViewMode } from '@/features/file-browser/FileBrowser';

export function BucketView() {
  const { id, bucket, '*': splat = '' } = useParams<{ id: string; bucket: string; '*': string }>();
  const navigate = useNavigate();
  const bucketName = bucket ? decodeURIComponent(bucket) : '';

  // path[] is reconstructed from the URL splat — every navigation pushes a
  // new URL so back/forward + refresh work for free.
  const path = splat ? splat.split('/').filter(Boolean).map(decodeURIComponent) : [];

  const onPathChange = useCallback(
    (next: string[]) => {
      const encoded = next.map(encodeURIComponent).join('/');
      const base = `/connections/${id}/b/${encodeURIComponent(bucketName)}`;
      navigate(encoded ? `${base}/${encoded}` : base);
    },
    [id, bucketName, navigate],
  );

  const connectionsQ = useQuery({
    queryKey: ['connections'],
    queryFn: async () => {
      const res = await api.get<Connection[]>('/connections');
      return res.data;
    },
  });
  const connection = connectionsQ.data?.find((c) => c.id === id) ?? null;

  const [viewMode, setViewMode] = useState<FileBrowserViewMode>('list');

  if (!connectionsQ.isLoading && !connection) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Connection not found</AlertTitle>
        <AlertDescription>
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
  if (!connection || !id || !bucketName) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const meta = connectionDisplayMeta(connection);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:gap-3 border-b border-border/70 pb-3 sm:pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => navigate(`/connections/${id}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 space-y-0.5 sm:space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight">{bucketName}</h1>
              <Badge variant="secondary" className="font-normal">
                {meta.provider}
              </Badge>
            </div>
            <p className="break-all text-xs sm:text-sm text-muted-foreground">
              {connection.name} · {connection.endpoint}
            </p>
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="h-[min(720px,calc(100vh-220px))] min-h-[520px]">
          <FileBrowser
            key={`${connection.id}/${bucketName}`}
            backend={buildBucketBackend(connection.id, bucketName)}
            bucket={bucketName}
            path={path}
            onPathChange={onPathChange}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            density="comfortable"
            showPreview={false}
          />
        </div>
      </section>
    </div>
  );
}
