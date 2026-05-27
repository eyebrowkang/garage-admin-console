/**
 * BucketView — full-bleed shell hosting the federated FileBrowser.
 *
 * Layout intent: the FileBrowser is the page. The shell only carries the back
 * affordance + endpoint hint, and breaks out of the App's max-w-7xl + padding
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
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { Alert, AlertDescription, AlertTitle, Button } from '@garage/ui';

import { api, buildBucketBackend } from '@/lib/api';
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

  const [viewMode, setViewMode] = useState<FileBrowserViewMode>(() => {
    if (typeof window === 'undefined') return 'list';
    try {
      const stored = window.localStorage.getItem('s3b.fb.viewMode');
      return stored === 'grid' ? 'grid' : 'list';
    } catch {
      return 'list';
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('s3b.fb.viewMode', viewMode);
    } catch {
      // ignore
    }
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
      <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading bucket…
      </div>
    );
  }

  // Break out of <main>'s max-w-7xl + padding so the file browser claims the
  // full viewport width / height. Header is h-14 (3.5rem); the footer falls
  // below the fold, which is fine for a file-browser-dominant page.
  return (
    <div className="-mx-4 lg:-mx-8 -my-5 sm:-my-6 flex h-[calc(100vh-3.5rem)] flex-col bg-card">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card/60 px-2 sm:px-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => {
            // Prefer history back so single-bucket users who skipped the
            // ConnectionView step return straight to the Dashboard instead of
            // landing on a one-row bucket list. Fresh-tab deep links land
            // here without history — fall back to ConnectionView in that case.
            if (window.history.state?.idx > 0) navigate(-1);
            else navigate(`/connections/${id}`);
          }}
          aria-label="Back"
          title="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span
          className="truncate font-mono text-[12px] text-muted-foreground"
          title={`${connection.name} · ${connection.endpoint}`}
        >
          {connection.endpoint}
        </span>
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
