import { Outlet, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Globe, HardDrive, Loader2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
} from '@garage-admin/ui';
import { ConnectionContext, type Connection } from '@/hooks/use-connection-context';

export function ConnectionLayout() {
  const { id } = useParams<{ id: string }>();

  const {
    data: connection,
    isLoading,
    error,
  } = useQuery<Connection>({
    queryKey: ['connections', id],
    queryFn: async () => {
      const res = await api.get(`/connections/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Loading connection...</h2>
            <p className="text-sm text-muted-foreground">
              Fetching connection details and permissions.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !connection) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Connections
          </Link>
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Connection unavailable</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error, 'Connection not found')}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <ConnectionContext.Provider value={{ connectionId: connection.id, connection }}>
      <div className="space-y-4">
        {/* Connection header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <HardDrive className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold leading-tight">{connection.name}</h2>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Globe className="h-3 w-3" />
                {connection.endpoint}
                {connection.region && <span className="ml-1">({connection.region})</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Child routes */}
        <Outlet />
      </div>
    </ConnectionContext.Provider>
  );
}
