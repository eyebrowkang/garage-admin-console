import { useState } from 'react';
import { Play, BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { api, proxyPath } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';

interface ApiExplorerProps {
  clusterId: string;
}

type ApiResponse = {
  status: number;
  data: unknown;
  contentType?: string;
};

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export function ApiExplorer({ clusterId }: ApiExplorerProps) {
  const [method, setMethod] = useState<(typeof METHODS)[number]>('GET');
  const [path, setPath] = useState('/v2/ListBuckets');
  const [body, setBody] = useState('');
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    setError('');
    setResponse(null);
    setIsLoading(true);

    try {
      let payload: unknown = undefined;
      if (body.trim()) {
        try {
          payload = JSON.parse(body);
        } catch {
          throw new Error('Request body must be valid JSON.');
        }
      }

      const url = proxyPath(clusterId, path.trim() || '/');
      const res = await api.request({
        method,
        url,
        data: method === 'GET' || method === 'DELETE' ? undefined : payload,
      });

      setResponse({
        status: res.status,
        data: res.data,
        contentType: res.headers['content-type'],
      });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Request failed.'));
    } finally {
      setIsLoading(false);
    }
  };

  const prettyResponse = response
    ? typeof response.data === 'string'
      ? response.data
      : JSON.stringify(response.data, null, 2)
    : '';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>API Explorer</CardTitle>
          <CardDescription>
            Send requests directly to the Garage admin API for this cluster.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[140px_1fr]">
            <div className="space-y-2">
              <Label>Method</Label>
              <div className="flex flex-wrap gap-2">
                {METHODS.map((m) => (
                  <Button
                    key={m}
                    type="button"
                    size="sm"
                    variant={m === method ? 'default' : 'outline'}
                    onClick={() => setMethod(m)}
                  >
                    {m}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-path">Path</Label>
              <Input
                id="api-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/v2/ListBuckets"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>JSON Body (optional)</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder='{
  "name": "example"
}'
              className="min-h-[140px] font-mono text-xs"
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Request failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={handleSend} disabled={isLoading}>
              <Play className="h-4 w-4" />
              {isLoading ? 'Sending...' : 'Send Request'}
            </Button>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <BookOpen className="h-3 w-3" />
              Refer to garage-admin-v2.json for available endpoints.
            </div>
          </div>
        </CardContent>
      </Card>

      {response && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Response</CardTitle>
            <Badge
              variant={response.status >= 200 && response.status < 300 ? 'success' : 'destructive'}
            >
              {response.status}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {response.contentType && (
              <div className="text-xs text-muted-foreground">{response.contentType}</div>
            )}
            <pre className="text-xs bg-slate-50/80 border rounded-lg p-4 whitespace-pre-wrap break-words text-slate-700">
              {prettyResponse || 'No response body'}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
