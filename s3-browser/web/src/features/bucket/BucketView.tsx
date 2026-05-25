/**
 * BucketView — DetailPageHeader breadcrumb + the federated FileBrowser inside
 * a card that matches Admin Console's surface (rounded-xl border bg-card).
 */
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Badge, Button } from '@garage/ui';

import { buildBucketBackend } from '@/lib/api';
import { connectionDisplayMeta } from '@/lib/connection-display';
import type { Connection } from '@/lib/types';
import { FileBrowser } from '@/features/file-browser/FileBrowser';

type ViewMode = 'list' | 'details' | 'grid';

export function BucketView({
  connection,
  bucket,
  onBack,
}: {
  connection: Connection;
  bucket: string;
  onBack: () => void;
}) {
  const meta = connectionDisplayMeta(connection);
  const [path, setPath] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('details');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:gap-3 border-b border-border/70 pb-3 sm:pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 space-y-0.5 sm:space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight">{bucket}</h1>
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
            key={`${connection.id}/${bucket}`}
            backend={buildBucketBackend(connection.id, bucket)}
            bucket={bucket}
            path={path}
            onPathChange={setPath}
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
