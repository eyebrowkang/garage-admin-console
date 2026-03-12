import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, proxyPath } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';
import { Alert, AlertDescription, AlertTitle, Card, CardContent } from '@garage-admin/ui';
import { ModulePageHeader } from '@/components/cluster/ModulePageHeader';

export function MetricsPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const fetchMetrics = async () => {
      if (!id) return;
      try {
        const res = await api.get<string>(proxyPath(id, '/metrics'), {
          responseType: 'text',
        });
        if (isMounted) setData(res.data);
      } catch (err) {
        if (isMounted) setError(getApiErrorMessage(err, 'Failed to load metrics.'));
      }
    };

    fetchMetrics();
    return () => {
      isMounted = false;
    };
  }, [id]);

  if (!id) {
    return null;
  }

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="Metrics"
        description="Raw Prometheus output for this cluster."
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load metrics</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {!data ? (
            <div className="flex min-h-[18rem] items-center justify-center px-6 py-10 text-sm text-muted-foreground">
              Loading cluster metrics...
            </div>
          ) : (
            <pre className="overflow-x-auto p-4 font-mono text-xs leading-6 whitespace-pre text-foreground sm:p-5">
              {data}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
