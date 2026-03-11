import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, proxyPath } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';

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

  if (error) {
    return (
      <pre className="min-h-screen whitespace-pre bg-white p-4 font-mono text-xs text-red-600">
        {error}
      </pre>
    );
  }

  if (!data) {
    return (
      <pre className="min-h-screen whitespace-pre bg-white p-4 font-mono text-xs text-slate-500">
        Loading...
      </pre>
    );
  }

  return (
    <pre className="min-h-screen whitespace-pre bg-white p-4 font-mono text-xs text-slate-900">
      {data}
    </pre>
  );
}
