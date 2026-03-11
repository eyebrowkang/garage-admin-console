import { useState, useMemo, useCallback } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  AlertCircle,
  File,
  Folder,
  ChevronRight,
  Home,
  Trash2,
  Download,
  Upload,
  FolderPlus,
  ArrowUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useS3EmbedContext, type S3EmbedConfig } from '../providers/S3EmbedProvider';
import { createEmbedApi } from '@/lib/embed-api';
import { useToast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmbedUploadDialog } from '@/components/embed/EmbedUploadDialog';
import { EmbedCreateFolderDialog } from '@/components/embed/EmbedCreateFolderDialog';
import { EmbedDeleteDialog } from '@/components/embed/EmbedDeleteDialog';

interface S3Object {
  key: string;
  size: number;
  lastModified: string;
}

interface ListObjectsResponse {
  objects: S3Object[];
  commonPrefixes: string[];
  isTruncated: boolean;
  nextContinuationToken?: string;
  prefix: string;
  bucket: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getFileName(key: string, prefix: string): string {
  const name = key.slice(prefix.length);
  return name.endsWith('/') ? name.slice(0, -1) : name;
}

// QueryClient for embedded mode (host might not provide one)
const embeddedQueryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

interface ObjectBrowserInnerProps {
  config: S3EmbedConfig;
  bucket: string;
}

function ObjectBrowserInner({ config, bucket }: ObjectBrowserInnerProps) {
  const api = useMemo(() => createEmbedApi(config), [config]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [prefix, setPrefix] = useState('');
  const [sortField, setSortField] = useState<'name' | 'size' | 'date'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showUpload, setShowUpload] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [deletingObject, setDeletingObject] = useState<{ key: string; isFolder: boolean } | null>(
    null,
  );

  const { data, isLoading, error } = useQuery<ListObjectsResponse>({
    queryKey: ['embed-objects', config.connectionId, bucket, prefix],
    queryFn: async () => {
      const params = new URLSearchParams({ bucket });
      if (prefix) params.set('prefix', prefix);
      const res = await api.get(`/s3/${config.connectionId}/objects?${params}`);
      return res.data;
    },
  });

  const breadcrumbs = useMemo(() => {
    if (!prefix) return [];
    const parts = prefix.split('/').filter(Boolean);
    return parts.map((part, i) => ({
      label: part,
      prefix: parts.slice(0, i + 1).join('/') + '/',
    }));
  }, [prefix]);

  const items = useMemo(() => {
    if (!data) return [];

    const folders = (data.commonPrefixes ?? [])
      .filter((p): p is string => !!p)
      .map((p) => ({
        type: 'folder' as const,
        key: p,
        name: getFileName(p, prefix),
        size: 0,
        lastModified: '',
      }));

    const files = (data.objects ?? [])
      .filter((obj) => obj.key !== prefix)
      .map((obj) => ({
        type: 'file' as const,
        key: obj.key,
        name: getFileName(obj.key, prefix),
        size: obj.size,
        lastModified: obj.lastModified,
      }));

    return [...folders, ...files].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'size':
          cmp = a.size - b.size;
          break;
        case 'date':
          cmp = (a.lastModified || '').localeCompare(b.lastModified || '');
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [data, prefix, sortField, sortDirection]);

  const handleSort = (field: 'name' | 'size' | 'date') => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleDownload = useCallback(
    async (key: string) => {
      try {
        const params = new URLSearchParams({ bucket, key });
        const res = await api.get(`/s3/${config.connectionId}/objects/download?${params}`, {
          responseType: 'blob',
        });
        const blob = new Blob([res.data]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = key.split('/').pop() || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        toast({ variant: 'destructive', title: 'Download failed' });
      }
    },
    [api, config.connectionId, bucket, toast],
  );

  const invalidateObjects = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['embed-objects', config.connectionId, bucket, prefix],
    });
  }, [queryClient, config.connectionId, bucket, prefix]);

  const deleteMutation = useMutation({
    mutationFn: async (key: string) => {
      const params = new URLSearchParams({ bucket, key });
      await api.delete(`/s3/${config.connectionId}/objects?${params}`);
    },
    onSuccess: () => {
      invalidateObjects();
      setDeletingObject(null);
      toast({ title: 'Deleted' });
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Delete failed' });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to list objects</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : 'Connection error'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm">
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => setPrefix('')}>
          <Home className="h-3.5 w-3.5" />
          {bucket}
        </Button>
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.prefix} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            {i === breadcrumbs.length - 1 ? (
              <span className="px-2 py-1 font-medium">{crumb.label}</span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => setPrefix(crumb.prefix)}
              >
                {crumb.label}
              </Button>
            )}
          </span>
        ))}
      </div>

      {/* Toolbar (write mode only) */}
      {!config.readonly && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowUpload(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Upload
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowCreateFolder(true)}>
            <FolderPlus className="mr-2 h-4 w-4" />
            New Folder
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <File className="h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {prefix ? 'Empty folder' : 'Empty bucket'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50%]">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-1"
                    onClick={() => handleSort('name')}
                  >
                    Name
                    <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead className="w-[20%]">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-1"
                    onClick={() => handleSort('size')}
                  >
                    Size
                    <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead className="w-[20%]">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-1"
                    onClick={() => handleSort('date')}
                  >
                    Modified
                    <ArrowUpDown className="h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead className="w-[10%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={item.key}
                  className={cn(item.type === 'folder' && 'cursor-pointer')}
                  onClick={item.type === 'folder' ? () => setPrefix(item.key) : undefined}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {item.type === 'folder' ? (
                        <Folder className="h-4 w-4 text-primary" />
                      ) : (
                        <File className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span
                        className={cn(
                          'truncate',
                          item.type === 'folder' && 'font-medium text-primary',
                        )}
                      >
                        {item.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.type === 'file' ? formatBytes(item.size) : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.lastModified ? formatDate(item.lastModified) : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {item.type === 'file' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title="Download"
                          onClick={() => handleDownload(item.key)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {!config.readonly && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          title="Delete"
                          onClick={() =>
                            setDeletingObject({
                              key: item.key,
                              isFolder: item.type === 'folder',
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Dialogs */}
      {!config.readonly && (
        <>
          <EmbedUploadDialog
            open={showUpload}
            onOpenChange={setShowUpload}
            apiBase={config.apiBase}
            token={config.token}
            connectionId={config.connectionId}
            bucket={bucket}
            prefix={prefix}
            onUploadComplete={invalidateObjects}
          />
          <EmbedCreateFolderDialog
            open={showCreateFolder}
            onOpenChange={setShowCreateFolder}
            api={api}
            connectionId={config.connectionId}
            bucket={bucket}
            prefix={prefix}
            onCreated={invalidateObjects}
          />
        </>
      )}
      {deletingObject && (
        <EmbedDeleteDialog
          open={!!deletingObject}
          onOpenChange={(open) => !open && setDeletingObject(null)}
          onConfirm={() => deleteMutation.mutate(deletingObject.key)}
          isLoading={deleteMutation.isPending}
          objectKey={deletingObject.key}
          isFolder={deletingObject.isFolder}
        />
      )}
    </div>
  );
}

/**
 * MF-exposed ObjectBrowser component.
 * Works in two modes:
 * 1. Embedded (with S3EmbedProvider) — uses embed config for API calls
 * 2. Standalone (props only) — requires bucket prop, shows info message
 */
export function ObjectBrowser({ bucket }: { bucket?: string }) {
  const embedConfig = useS3EmbedContext();

  // Determine the active bucket
  const activeBucket = bucket ?? embedConfig?.bucket;

  if (!embedConfig) {
    return (
      <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
        <p>ObjectBrowser requires S3EmbedProvider context.</p>
        <p className="mt-1 text-xs">
          Wrap this component with {'<S3EmbedProvider>'} and provide connection configuration.
        </p>
      </div>
    );
  }

  if (!activeBucket) {
    return (
      <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
        No bucket specified. Provide a bucket name via props or embed config.
      </div>
    );
  }

  return (
    <QueryClientProvider client={embeddedQueryClient}>
      <ObjectBrowserInner config={embedConfig} bucket={activeBucket} />
      <Toaster />
    </QueryClientProvider>
  );
}
