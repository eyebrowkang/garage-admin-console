import { useState, useMemo } from 'react';
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FolderOpen, Calendar, Loader2, AlertCircle } from 'lucide-react';
import { useS3EmbedContext, type S3EmbedConfig } from '../providers/S3EmbedProvider';
import { createEmbedApi } from '@/lib/embed-api';
import { Toaster } from '@/components/ui/toaster';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
} from '@garage-admin/ui';
import { ObjectBrowser } from './ObjectBrowser';

interface Bucket {
  name: string;
  creationDate: string;
}

const embeddedQueryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false },
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
          <Button
            variant="ghost"
            size="sm"
            className="w-fit px-0 text-primary hover:text-primary"
            onClick={() => setSelectedBucket(null)}
          >
            Back to buckets
          </Button>
        )}
        <ObjectBrowser bucket={selectedBucket} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Loading buckets...</h3>
            <p className="text-sm text-muted-foreground">
              Fetching buckets from this connection.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Unable to load buckets</AlertTitle>
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
          <h3 className="mt-3 text-base font-semibold">No buckets available</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            This connection does not currently expose any buckets.
          </p>
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
