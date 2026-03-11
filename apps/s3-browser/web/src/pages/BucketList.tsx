import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle, FolderOpen, Calendar } from 'lucide-react';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';
import { useConnectionContext } from '@/hooks/use-connection-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { useEffect } from 'react';

interface Bucket {
  name: string;
  creationDate: string;
}

export function BucketList() {
  const { connectionId, connection } = useConnectionContext();
  const navigate = useNavigate();

  // If connection has a specific bucket, redirect directly to object browser
  useEffect(() => {
    if (connection.bucket) {
      navigate(
        `/connections/${connectionId}/browse?bucket=${encodeURIComponent(connection.bucket)}`,
        {
          replace: true,
        },
      );
    }
  }, [connection.bucket, connectionId, navigate]);

  const { data, isLoading, error } = useQuery<{ buckets: Bucket[] }>({
    queryKey: ['buckets', connectionId],
    queryFn: async () => {
      const res = await api.get(`/s3/${connectionId}/buckets`);
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to list buckets</AlertTitle>
        <AlertDescription>
          {getApiErrorMessage(error, 'Could not connect to S3 endpoint')}
        </AlertDescription>
      </Alert>
    );
  }

  const buckets = data?.buckets ?? [];

  if (buckets.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <FolderOpen className="h-8 w-8 text-primary" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">No buckets found</h3>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            No buckets are accessible with the credentials for this connection. Create buckets using
            your S3 admin tools first.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Buckets</h3>
        <p className="text-sm text-muted-foreground">Select a bucket to browse its objects.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {buckets.map((bucket) => (
          <Card
            key={bucket.name}
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() =>
              navigate(
                `/connections/${connectionId}/browse?bucket=${encodeURIComponent(bucket.name!)}`,
              )
            }
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
    </div>
  );
}
