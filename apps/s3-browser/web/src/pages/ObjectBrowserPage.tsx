import { useState, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  File,
  Folder,
  ChevronRight,
  Home,
  Upload,
  FolderPlus,
  Trash2,
  Download,
  ArrowUpDown,
} from 'lucide-react';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useConnectionContext } from '@/layouts/ConnectionLayout';
import { useToast } from '@/hooks/use-toast';
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
import { UploadDialog } from '@/components/UploadDialog';
import { CreateFolderDialog } from '@/components/CreateFolderDialog';
import { DeleteObjectDialog } from '@/components/DeleteObjectDialog';

interface S3Object {
  key: string;
  size: number;
  lastModified: string;
  etag: string;
  storageClass: string;
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

export function ObjectBrowserPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { connectionId } = useConnectionContext();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const bucket = searchParams.get('bucket') ?? '';
  const prefix = searchParams.get('prefix') ?? '';

  const [sortField, setSortField] = useState<'name' | 'size' | 'date'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showUpload, setShowUpload] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [deletingObject, setDeletingObject] = useState<{ key: string; isFolder: boolean } | null>(
    null,
  );

  const {
    data,
    isLoading,
    error,
  } = useQuery<ListObjectsResponse>({
    queryKey: ['objects', connectionId, bucket, prefix],
    queryFn: async () => {
      const params = new URLSearchParams({ bucket });
      if (prefix) params.set('prefix', prefix);
      const res = await api.get(`/s3/${connectionId}/objects?${params}`);
      return res.data;
    },
    enabled: !!bucket,
  });

  // Build breadcrumb segments from prefix
  const breadcrumbs = useMemo(() => {
    if (!prefix) return [];
    const parts = prefix.split('/').filter(Boolean);
    return parts.map((part, i) => ({
      label: part,
      prefix: parts.slice(0, i + 1).join('/') + '/',
    }));
  }, [prefix]);

  // Combine folders (common prefixes) and files, then sort
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
      // Filter out the prefix itself (folder marker)
      .filter((obj) => obj.key !== prefix)
      .map((obj) => ({
        type: 'file' as const,
        key: obj.key,
        name: getFileName(obj.key, prefix),
        size: obj.size,
        lastModified: obj.lastModified,
      }));

    // Sort: folders first, then files; within each group, sort by selected field
    const sorted = [...folders, ...files].sort((a, b) => {
      // Folders always before files
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

    return sorted;
  }, [data, prefix, sortField, sortDirection]);

  const navigateToPrefix = useCallback(
    (newPrefix: string) => {
      const params = new URLSearchParams({ bucket });
      if (newPrefix) params.set('prefix', newPrefix);
      setSearchParams(params);
    },
    [bucket, setSearchParams],
  );

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
        const res = await api.get(`/s3/${connectionId}/objects/download?${params}`, {
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
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Download failed',
          description: getApiErrorMessage(err),
        });
      }
    },
    [connectionId, bucket, toast],
  );

  const deleteMutation = useMutation({
    mutationFn: async (key: string) => {
      const params = new URLSearchParams({ bucket, key });
      await api.delete(`/s3/${connectionId}/objects?${params}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['objects', connectionId, bucket, prefix] });
      setDeletingObject(null);
      toast({ title: 'Deleted', description: 'Object deleted successfully.' });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: getApiErrorMessage(err),
      });
    },
  });

  if (!bucket) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No bucket selected</AlertTitle>
        <AlertDescription>
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() => navigate(`/connections/${connectionId}`)}
          >
            Go back and select a bucket
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2"
          onClick={() => navigateToPrefix('')}
        >
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
                onClick={() => navigateToPrefix(crumb.prefix)}
              >
                {crumb.label}
              </Button>
            )}
          </span>
        ))}
      </div>

      {/* Toolbar */}
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

      {/* Object table */}
      {isLoading ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to list objects</AlertTitle>
          <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <File className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              {prefix ? 'Empty folder' : 'Empty bucket'}
            </h3>
            <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
              {prefix
                ? 'This folder has no objects. Upload files or create a subfolder.'
                : 'This bucket is empty. Upload your first file to get started.'}
            </p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={() => setShowUpload(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowCreateFolder(true)}>
                <FolderPlus className="mr-2 h-4 w-4" />
                New Folder
              </Button>
            </div>
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
                    Last Modified
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
                  onClick={
                    item.type === 'folder' ? () => navigateToPrefix(item.key) : undefined
                  }
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
                    {item.type === 'file' && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title="Download"
                          onClick={() => handleDownload(item.key)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          title="Delete"
                          onClick={() =>
                            setDeletingObject({ key: item.key, isFolder: false })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    {item.type === 'folder' && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          title="Delete folder"
                          onClick={() =>
                            setDeletingObject({ key: item.key, isFolder: true })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Dialogs */}
      <UploadDialog
        open={showUpload}
        onOpenChange={setShowUpload}
        connectionId={connectionId}
        bucket={bucket}
        prefix={prefix}
      />

      <CreateFolderDialog
        open={showCreateFolder}
        onOpenChange={setShowCreateFolder}
        connectionId={connectionId}
        bucket={bucket}
        prefix={prefix}
      />

      {deletingObject && (
        <DeleteObjectDialog
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
