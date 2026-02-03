import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Table, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { api, proxyPath } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';

interface MetricsDisplayProps {
  clusterId: string;
}

interface ParsedMetric {
  name: string;
  help: string;
  type: string;
  values: Array<{
    labels: Record<string, string>;
    value: string;
  }>;
}

function parsePrometheusMetrics(text: string): ParsedMetric[] {
  const lines = text.split('\n');
  const metrics: Map<string, ParsedMetric> = new Map();

  let currentMetric: ParsedMetric | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('# HELP ')) {
      const rest = trimmed.slice(7);
      const spaceIdx = rest.indexOf(' ');
      const name = rest.slice(0, spaceIdx);
      const help = rest.slice(spaceIdx + 1);

      if (!metrics.has(name)) {
        currentMetric = { name, help, type: 'untyped', values: [] };
        metrics.set(name, currentMetric);
      } else {
        currentMetric = metrics.get(name)!;
        currentMetric.help = help;
      }
    } else if (trimmed.startsWith('# TYPE ')) {
      const rest = trimmed.slice(7);
      const parts = rest.split(' ');
      const name = parts[0];
      const type = parts[1] || 'untyped';

      if (!metrics.has(name)) {
        currentMetric = { name, help: '', type, values: [] };
        metrics.set(name, currentMetric);
      } else {
        metrics.get(name)!.type = type;
      }
    } else if (trimmed && !trimmed.startsWith('#')) {
      // Parse metric value line
      const labelStart = trimmed.indexOf('{');
      const labelEnd = trimmed.indexOf('}');

      let name: string;
      const labels: Record<string, string> = {};
      let valueStr: string;

      if (labelStart !== -1 && labelEnd !== -1) {
        name = trimmed.slice(0, labelStart);
        const labelsStr = trimmed.slice(labelStart + 1, labelEnd);
        valueStr = trimmed.slice(labelEnd + 2).trim();

        // Parse labels
        const labelRegex = /(\w+)="([^"]*)"/g;
        let match;
        while ((match = labelRegex.exec(labelsStr)) !== null) {
          labels[match[1]] = match[2];
        }
      } else {
        const spaceIdx = trimmed.indexOf(' ');
        name = trimmed.slice(0, spaceIdx);
        valueStr = trimmed.slice(spaceIdx + 1).trim();
      }

      if (!metrics.has(name)) {
        metrics.set(name, { name, help: '', type: 'untyped', values: [] });
      }
      metrics.get(name)!.values.push({ labels, value: valueStr });
    }
  }

  return Array.from(metrics.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function MetricsDisplay({ clusterId }: MetricsDisplayProps) {
  const [viewMode, setViewMode] = useState<'table' | 'raw'>('table');

  const {
    data: metricsText,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['metrics', clusterId],
    queryFn: async () => {
      const res = await api.get<string>(proxyPath(clusterId, '/metrics'), {
        responseType: 'text',
      });
      return res.data;
    },
    staleTime: 30000,
  });

  const parsedMetrics = metricsText ? parsePrometheusMetrics(metricsText) : [];

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading metrics...</div>;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Prometheus Metrics</CardTitle>
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'table' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('table')}
            >
              <Table className="h-4 w-4 mr-1" />
              Table
            </Button>
            <Button
              variant={viewMode === 'raw' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('raw')}
            >
              <FileText className="h-4 w-4 mr-1" />
              Raw
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === 'raw' ? (
          <pre className="text-xs bg-slate-50 border rounded-lg p-4 overflow-auto max-h-[500px] whitespace-pre-wrap">
            {metricsText}
          </pre>
        ) : (
          <div className="space-y-4 max-h-[500px] overflow-auto">
            {parsedMetrics.map((metric) => (
              <div key={metric.name} className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{metric.name}</span>
                  <span className="text-xs px-1.5 py-0.5 bg-slate-100 rounded text-muted-foreground">
                    {metric.type}
                  </span>
                </div>
                {metric.help && <p className="text-xs text-muted-foreground mb-2">{metric.help}</p>}
                <div className="space-y-1">
                  {metric.values.slice(0, 10).map((v, idx) => (
                    <div key={idx} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        {Object.keys(v.labels).length > 0
                          ? `{${Object.entries(v.labels)
                              .map(([k, val]) => `${k}="${val}"`)
                              .join(', ')}}`
                          : '(no labels)'}
                      </span>
                      <span className="font-medium">{v.value}</span>
                    </div>
                  ))}
                  {metric.values.length > 10 && (
                    <div className="text-xs text-muted-foreground">
                      ... and {metric.values.length - 10} more values
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
