import { useState, useMemo } from 'react';
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FolderOpen, Calendar, Loader2, AlertCircle } from 'lucide-react';
import { useS3EmbedContext, type S3EmbedConfig } from '../providers/S3EmbedProvider';
import { createEmbedApi } from '@/lib/embed-api';
import { Toaster } from '@/components/ui/toaster';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ObjectBrowser } from './ObjectBrowser';

interface Bucket {
  name: string;
  creationDate: string;
}

const embeddedQueryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

function BucketExplorerInner({ config }: { config: S3EmbedConfig }) {
  const api = useMemo(() => createEmbedApi(config), [config]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(config.bucket ?? null);

  const { data, isLoading, error } = useQuery<{ buckets: Bucket[] }>({
    queryKey: ['embed-buckets', config.connectionId],
    queryFn: async () => {
      const res = await api.get(`/s3/${config.connectionId}/buckets`);
      return res.data;
    },
    enabled: !selectedBucket,
  });

  // If a specific bucket is configured or selected, show the object browser
  if (selectedBucket) {
    return (
      <div className="space-y-3">
        {!config.bucket && (
          <button
            className="text-sm text-primary hover:underline"
            onClick={() => setSelectedBucket(null)}
          >
            ← Back to buckets
          </button>
        )}
        <ObjectBrowser bucket={selectedBucket} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to list buckets</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : 'Connection error'}
        </AlertDescription>
      </Alert>
    );
  }

  const buckets = data?.buckets ?? [];

  if (buckets.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FolderOpen className="h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No buckets found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {buckets.map((bucket) => (
        <Card
          key={bucket.name}
          className="cursor-pointer transition-shadow hover:shadow-md"
          onClick={() => setSelectedBucket(bucket.name!)}
        >
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FolderOpen className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{bucket.name}</p>
              {bucket.creationDate && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {new Date(bucket.creationDate).toLocaleDateString()}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * MF-exposed BucketExplorer component.
 * If a bucket is specified in embed config, goes directly to object browser.
 * Otherwise shows a bucket list, then drills into the selected bucket.
 */
export function BucketExplorer() {
  const embedConfig = useS3EmbedContext();

  if (!embedConfig) {
    return (
      <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
        <p>BucketExplorer requires S3EmbedProvider context.</p>
        <p className="mt-1 text-xs">
          Wrap this component with {'<S3EmbedProvider>'} and provide connection configuration.
        </p>
      </div>
    );
  }

  return (
    <QueryClientProvider client={embeddedQueryClient}>
      <BucketExplorerInner config={embedConfig} />
      <Toaster />
    </QueryClientProvider>
  );
}
