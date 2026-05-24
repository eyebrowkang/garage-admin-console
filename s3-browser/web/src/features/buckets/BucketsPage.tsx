/**
 * Bucket picker for a single connection. Loads the bucket list via the
 * BFF's extra /api/connections/:id/buckets endpoint (S3 ListBuckets),
 * then lets the user pick one to open in the FileBrowser.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Database } from 'lucide-react';
import { Button } from '@garage/ui';

import { api, buildBucketBackend } from '@/lib/api';
import { FileBrowser } from '@/features/file-browser/FileBrowser';
import type { Bucket } from '@/lib/types';

export function BucketsPage({
  connectionId,
  onBack,
}: {
  connectionId: string;
  onBack: () => void;
}) {
  const [activeBucket, setActiveBucket] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>([]);

  const list = useQuery({
    queryKey: ['buckets', connectionId],
    queryFn: async () => {
      const res = await api.get<{ buckets: Bucket[] }>(`/connections/${connectionId}/buckets`);
      return res.data.buckets;
    },
    enabled: activeBucket === null,
  });

  if (activeBucket !== null) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b bg-card px-4 py-2">
          <Button variant="ghost" size="sm" onClick={() => setActiveBucket(null)}>
            <ArrowLeft /> Buckets
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <FileBrowser
            backend={buildBucketBackend(connectionId, activeBucket)}
            bucket={activeBucket}
            path={path}
            onPathChange={setPath}
            viewMode="list"
            showPreview
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> Connections
        </Button>
      </div>

      <h1 className="text-2xl font-semibold">Buckets</h1>

      {list.isLoading && <p className="text-muted-foreground">Loading…</p>}
      {list.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {(list.error as Error).message}
        </div>
      )}
      {list.data && list.data.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          No buckets accessible with these credentials.
        </div>
      )}
      {list.data && list.data.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.map((b) => (
            <button
              key={b.name}
              className="flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40"
              onClick={() => {
                setActiveBucket(b.name);
                setPath([]);
              }}
            >
              <Database className="text-primary" size={20} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{b.name}</div>
                {b.creationDate && (
                  <div className="text-xs text-muted-foreground">
                    Created {new Date(b.creationDate).toLocaleDateString()}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
