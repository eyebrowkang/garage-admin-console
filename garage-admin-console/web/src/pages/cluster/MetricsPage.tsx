import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Alert,
  AlertTitle,
  AlertDescription,
} from '@garage/ui';
import { InlineLoadingState } from '@garage/ui';
import { ModulePageHeader } from '@garage/ui';
import { api, proxyPath } from '@/lib/api';
import { getApiErrorMessage } from '@garage/web-shared';

export function MetricsPage() {
  const { id } = useParams<{ id: string }>();

  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['cluster', id, 'metrics'],
    queryFn: async () => {
      const res = await api.get<string>(proxyPath(id!, '/metrics'), { responseType: 'text' });
      return res.data;
    },
    enabled: !!id,
  });

  if (!id) {
    return null;
  }

  const errorMessage = error ? getApiErrorMessage(error, 'Failed to load metrics.') : '';

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="Metrics"
        description="Raw Prometheus metrics exposed by the cluster's admin API."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {errorMessage && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load metrics</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Prometheus Metrics</CardTitle>
          <CardDescription>
            Live scrape from the Garage <span className="font-mono text-xs">/metrics</span>{' '}
            endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <InlineLoadingState label="Loading metrics..." />
          ) : (
            <pre className="max-h-[600px] overflow-auto whitespace-pre rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
              {data || 'No metrics available.'}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
