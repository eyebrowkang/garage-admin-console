import { useCallback, useEffect, useState } from 'react';
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
import { InlineLoadingState } from '@/components/cluster/InlineLoadingState';
import { ModulePageHeader } from '@/components/cluster/ModulePageHeader';
import { api, proxyPath } from '@/lib/api';
import { getApiErrorMessage } from '@garage/web-shared';

export function MetricsPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError('');
    try {
      const res = await api.get<string>(proxyPath(id, '/metrics'), {
        responseType: 'text',
      });
      setData(res.data);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load metrics.'));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (!id) {
    return null;
  }

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="Metrics"
        description="Raw Prometheus metrics exposed by the cluster's admin API."
        actions={
          <Button variant="outline" size="sm" onClick={fetchMetrics} disabled={isLoading}>
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load metrics</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
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
          {isLoading && !data ? (
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
