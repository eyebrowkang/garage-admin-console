import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Loader2, Plus } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, proxyPath } from '@/lib/api';
import { formatDateTime24h, formatShortId } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { ConfirmDialog } from '@/components/cluster/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import { useKeys } from '@/hooks/useKeys';
import type { CreateBucketRequest, ListBucketsResponseItem } from '@/types/garage';

interface BucketListProps {
  clusterId: string;
}

export function BucketList({ clusterId }: BucketListProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [aliasType, setAliasType] = useState<'none' | 'global' | 'local' | 'both'>('global');
  const [globalAlias, setGlobalAlias] = useState('');
  const [localAlias, setLocalAlias] = useState('');
  const [localAccessKeyId, setLocalAccessKeyId] = useState('');
  const [actionError, setActionError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const keysQuery = useKeys(clusterId);
  const keys = keysQuery.data ?? [];

  const {
    data: buckets = [],
    isLoading,
    error,
  } = useQuery<ListBucketsResponseItem[]>({
    queryKey: ['buckets', clusterId],
    queryFn: async () => {
      const res = await api.get<ListBucketsResponseItem[]>(proxyPath(clusterId, '/v2/ListBuckets'));
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: CreateBucketRequest) => {
      await api.post(proxyPath(clusterId, '/v2/CreateBucket'), payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buckets', clusterId] });
      setIsDialogOpen(false);
      setGlobalAlias('');
      setLocalAlias('');
      setLocalAccessKeyId('');
      setActionError('');
    },
    onError: (err) => {
      setActionError(getApiErrorMessage(err, 'Failed to create bucket.'));
    },
  });

  const needsGlobal = aliasType === 'global' || aliasType === 'both';
  const needsLocal = aliasType === 'local' || aliasType === 'both';
  const hasLocalKey = Boolean(localAccessKeyId);
  const canCreate =
    !createMutation.isPending &&
    (!needsGlobal || Boolean(globalAlias.trim())) &&
    (!needsLocal || (Boolean(localAlias.trim()) && hasLocalKey));

  const handleCreate = () => {
    const payload: CreateBucketRequest = {};
    if (needsGlobal) {
      payload.globalAlias = globalAlias.trim();
    }
    if (needsLocal) {
      payload.localAlias = {
        accessKeyId: localAccessKeyId,
        alias: localAlias.trim(),
      };
    }
    createMutation.mutate(payload);
  };

  useEffect(() => {
    if (!isDialogOpen) return;
    if (!needsLocal) return;
    if (!keys.length) return;
    if (!localAccessKeyId || !keys.some((key) => key.id === localAccessKeyId)) {
      setLocalAccessKeyId(keys[0].id);
    }
  }, [isDialogOpen, needsLocal, keys, localAccessKeyId]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(proxyPath(clusterId, `/v2/DeleteBucket?id=${encodeURIComponent(id)}`), {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buckets', clusterId] });
      setDeleteConfirm(null);
      toast({ title: 'Bucket deleted' });
    },
    onError: (err) => {
      toast({
        title: 'Failed to delete bucket',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    },
  });

  if (isLoading)
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="animate-spin" />
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Buckets</h3>
          <p className="text-sm text-muted-foreground">Manage bucket aliases and lifecycle.</p>
        </div>
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (open) {
              setAliasType('global');
              setGlobalAlias('');
              setLocalAlias('');
              setLocalAccessKeyId(keys[0]?.id || '');
            } else {
              setActionError('');
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> Create Bucket
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Bucket</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Alias Type</Label>
                <Select
                  value={aliasType}
                  onValueChange={(value) =>
                    setAliasType(value as 'none' | 'global' | 'local' | 'both')
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select alias type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global alias</SelectItem>
                    <SelectItem value="local">Local alias</SelectItem>
                    <SelectItem value="both">Global + Local</SelectItem>
                    <SelectItem value="none">No alias</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {needsGlobal && (
                <div className="space-y-2">
                  <Label>Global Alias</Label>
                  <Input
                    value={globalAlias}
                    onChange={(e) => setGlobalAlias(e.target.value)}
                    placeholder="my-bucket"
                  />
                </div>
              )}

              {needsLocal && (
                <>
                  <div className="space-y-2">
                    <Label>Local Alias</Label>
                    <Input
                      value={localAlias}
                      onChange={(e) => setLocalAlias(e.target.value)}
                      placeholder="my-bucket"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Access Key</Label>
                    {keysQuery.isLoading ? (
                      <div className="text-sm text-muted-foreground">Loading access keys...</div>
                    ) : keysQuery.error ? (
                      <div className="text-sm text-destructive">
                        {getApiErrorMessage(keysQuery.error, 'Failed to load access keys.')}
                      </div>
                    ) : keys.length > 0 ? (
                      <Select value={localAccessKeyId} onValueChange={setLocalAccessKeyId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select access key" />
                        </SelectTrigger>
                        <SelectContent>
                          {keys.map((key) => (
                            <SelectItem key={key.id} value={key.id}>
                              {key.name || formatShortId(key.id, 12)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        No access keys available for local alias creation.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            {actionError && (
              <Alert variant="destructive">
                <AlertTitle>Bucket creation failed</AlertTitle>
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button
                onClick={handleCreate}
                disabled={!canCreate}
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load buckets</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(error, 'Buckets could not be loaded.')}
          </AlertDescription>
        </Alert>
      )}
      {actionError && !isDialogOpen && (
        <Alert variant="destructive">
          <AlertTitle>Bucket action failed</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bucket ID</TableHead>
              <TableHead>Global Aliases</TableHead>
              <TableHead>Local Aliases</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buckets.map((bucket) => (
              <TableRow
                key={bucket.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/clusters/${clusterId}/buckets/${bucket.id}`)}
              >
                <TableCell className="text-xs">{formatShortId(bucket.id, 10)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {bucket.globalAliases.length > 0 ? (
                      bucket.globalAliases.map((alias) => (
                        <Badge key={alias} variant="secondary">
                          {alias}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {bucket.localAliases.length > 0 ? (
                      bucket.localAliases.map((alias) => (
                        <Badge key={`${alias.accessKeyId}-${alias.alias}`} variant="outline">
                          {alias.alias}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDateTime24h(bucket.created)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() =>
                        setDeleteConfirm({
                          id: bucket.id,
                          name: bucket.globalAliases[0] || bucket.id,
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {buckets.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                  No buckets found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Delete Bucket"
        description={`Are you sure you want to delete the bucket "${deleteConfirm?.name}"? The bucket must be empty before it can be deleted.`}
        tier="danger"
        confirmText="Delete Bucket"
        onConfirm={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
