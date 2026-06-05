/**
 * BucketView — full-bleed shell hosting the federated FileBrowser.
 *
 * Layout intent: the FileBrowser is the page. The shell only carries the back
 * affordance + endpoint hint, and breaks out of the App's max-w-full + padding
 * so the browser can use the full viewport width.
 *
 * The in-bucket path lives in the URL via a splat segment:
 *   /connections/:id/b/:bucket/foo/bar
 *
 * The FileBrowser stays router-free so embedders don't have to pull in
 * react-router — App resolves the splat to path[] and pushes new URLs on
 * navigation, so refresh restores the exact folder the user was in.
 */
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
  InlineLoadingState,
} from '@garage/ui';

import { api, buildBucketBackend } from '@/lib/api';
import { readPersistedString, writePersistedString } from '@/lib/persistence';
import type { Connection } from '@/lib/types';
import { FileBrowser, type FileBrowserViewMode } from '@/file-browser/FileBrowser';

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

  const [viewMode, setViewMode] = useState<FileBrowserViewMode>(() =>
    readPersistedString('s3-browser.fb.viewMode', 'list') === 'grid' ? 'grid' : 'list',
  );

  useEffect(() => {
    writePersistedString('s3-browser.fb.viewMode', viewMode);
  }, [viewMode]);

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
    return (
      <div className="flex h-40 items-center justify-center">
        <InlineLoadingState label="Loading bucket…" />
      </div>
    );
  }

  // Break out of <main>'s max-w-full + padding so the file browser claims the
  // full viewport width / height. Header is h-14 (3.5rem); the footer falls
  // below the fold, which is fine for a file-browser-dominant page.
  return (
    <div className="-mx-4 lg:-mx-8 -my-5 sm:-my-6 flex h-[calc(100vh-3.5rem)] flex-col bg-card">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card/60 px-3 sm:px-4">
        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList className="flex-nowrap text-xs sm:text-xs">
            <BreadcrumbItem>
              <BreadcrumbLink asChild className="shrink-0">
                <Link to="/">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbLink asChild className="max-w-[240px] truncate text-foreground hover:text-primary">
                <Link to={`/connections/${id}`} title={`${connection.name} · ${connection.endpoint}`}>
                  {connection.name}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
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
    </div>
  );
}
