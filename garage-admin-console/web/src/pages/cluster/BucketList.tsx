import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  Input,
  Label,
  Alert,
  AlertDescription,
  AlertTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ResourceList,
  type ResourceListColumn,
} from '@garage/ui';
import { api, proxyPath } from '@/lib/api';
import { formatDateTime, formatShortId, getApiErrorMessage } from '@garage/web-shared';
import { ConfirmDialog } from '@garage/ui';
import { AliasMiniChip } from '@/components/cluster/AliasMiniChip';
import { CopyButton } from '@garage/ui';
import { InlineLoadingState } from '@garage/ui';
import { ModulePageHeader } from '@garage/ui';
import { TableLoadingState } from '@/components/cluster/TableLoadingState';
import { useClusterContext } from '@/contexts/ClusterContext';
import { AddActionIcon, DeleteActionIcon } from '@/lib/action-icons';
import { BucketIcon } from '@/lib/entity-icons';
import { toast } from '@garage/ui';
import { runBulkDelete } from '@/lib/bulk-delete';
import { useBuckets } from '@/hooks/useBuckets';
import { useKeys } from '@/hooks/useKeys';
import type { CreateBucketRequest, ListBucketsResponseItem } from '@/types/garage';

export function BucketList() {
  const { clusterId } = useClusterContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [aliasType, setAliasType] = useState<'none' | 'global' | 'local' | 'both'>('global');
  const [globalAlias, setGlobalAlias] = useState('');
  const [localAlias, setLocalAlias] = useState('');
  const [localAccessKeyId, setLocalAccessKeyId] = useState('');
  const [actionError, setActionError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [bulkDelete, setBulkDelete] = useState<{ ids: string[]; clear: () => void } | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const keysQuery = useKeys(clusterId);
  const keys = keysQuery.data ?? [];

  const { data: buckets = [], isLoading, error } = useBuckets(clusterId);

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
  const selectedLocalAccessKeyId =
    localAccessKeyId && keys.some((key) => key.id === localAccessKeyId)
      ? localAccessKeyId
      : keys[0]?.id || '';
  const hasLocalKey = Boolean(selectedLocalAccessKeyId);
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
        accessKeyId: selectedLocalAccessKeyId,
        alias: localAlias.trim(),
      };
    }
    createMutation.mutate(payload);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(proxyPath(clusterId, `/v2/DeleteBucket?id=${encodeURIComponent(id)}`), {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buckets', clusterId] });
      setDeleteConfirm(null);
      toast({ title: 'Bucket deleted', variant: 'success' });
    },
    onError: (err) => {
      toast({
        title: 'Failed to delete bucket',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    },
  });

  const handleBulkDelete = async () => {
    if (!bulkDelete) return;
    setBulkPending(true);
    const outcome = await runBulkDelete(bulkDelete.ids, (id) =>
      api
        .post(proxyPath(clusterId, `/v2/DeleteBucket?id=${encodeURIComponent(id)}`), {})
        .then(() => undefined),
    );
    setBulkPending(false);
    queryClient.invalidateQueries({ queryKey: ['buckets', clusterId] });
    bulkDelete.clear();
    setBulkDelete(null);

    if (outcome.failed.length === 0) {
      toast({
        title: `Deleted ${outcome.ok.length} bucket${outcome.ok.length === 1 ? '' : 's'}`,
        variant: 'success',
      });
    } else {
      toast({
        title:
          outcome.ok.length === 0
            ? `Couldn't delete ${outcome.failed.length} bucket${outcome.failed.length === 1 ? '' : 's'}`
            : `Deleted ${outcome.ok.length}, ${outcome.failed.length} failed`,
        description: `${outcome.failed[0].message}${outcome.failed.length > 1 ? ` (+${outcome.failed.length - 1} more)` : ''}`,
        variant: 'destructive',
      });
    }
  };

  const columns: ResourceListColumn<ListBucketsResponseItem>[] = [
    {
      id: 'id',
      header: 'Bucket ID',
      sortable: true,
      sortAccessor: (b) => b.id,
      mobileHidden: true,
      cellClassName: 'text-xs',
      cell: (b) => (
        <div className="inline-flex items-center gap-1">
          <span>{formatShortId(b.id, 10)}</span>
          <CopyButton value={b.id} label="Bucket ID" compact />
        </div>
      ),
    },
    {
      id: 'globalAliases',
      header: 'Global Aliases',
      sortable: true,
      sortAccessor: (b) => b.globalAliases[0] ?? '',
      cell: (b) => (
        <div className="flex flex-wrap gap-1">
          {b.globalAliases.length > 0 ? (
            b.globalAliases.map((alias) => (
              <AliasMiniChip key={alias} value={alias} kind="global" />
            ))
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </div>
      ),
    },
    {
      id: 'localAliases',
      header: 'Local Aliases',
      cell: (b) => (
        <div className="flex flex-wrap gap-1">
          {b.localAliases.length > 0 ? (
            b.localAliases.map((alias) => (
              <AliasMiniChip
                key={`${alias.accessKeyId}-${alias.alias}`}
                value={alias.alias}
                kind="local"
              />
            ))
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </div>
      ),
    },
    {
      id: 'created',
      header: 'Created',
      sortable: true,
      sortAccessor: (b) => b.created ?? '',
      cellClassName: 'text-xs text-muted-foreground',
      cell: (b) => formatDateTime(b.created),
    },
  ];

  if (isLoading) return <TableLoadingState label="Loading buckets..." />;

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="Buckets"
        description="List-level management for bucket aliases and lifecycle."
        actions={
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (open) {
                setAliasType('global');
                setGlobalAlias('');
                setLocalAlias('');
                setLocalAccessKeyId('');
              } else {
                setActionError('');
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <AddActionIcon className="h-4 w-4" /> Create Bucket
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
                        <InlineLoadingState label="Loading access keys..." />
                      ) : keysQuery.error ? (
                        <div className="text-sm text-destructive">
                          {getApiErrorMessage(keysQuery.error, 'Failed to load access keys.')}
                        </div>
                      ) : keys.length > 0 ? (
                        <Select
                          value={selectedLocalAccessKeyId}
                          onValueChange={setLocalAccessKeyId}
                        >
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
                <Button onClick={handleCreate} disabled={!canCreate}>
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load buckets</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(error, 'Buckets could not be loaded.')}
          </AlertDescription>
        </Alert>
      )}

      <ResourceList
        items={buckets}
        getRowId={(b) => b.id}
        columns={columns}
        onRowClick={(b) => navigate(`/clusters/${clusterId}/buckets/${b.id}`)}
        renderTitle={(b) => (
          <div className="inline-flex items-center gap-1 text-sm">
            <span>{formatShortId(b.id, 10)}</span>
            <CopyButton value={b.id} label="Bucket ID" compact />
          </div>
        )}
        search={{
          placeholder: 'Search by ID or alias...',
          predicate: (b, q) =>
            b.id.toLowerCase().includes(q) ||
            b.globalAliases.some((a) => a.toLowerCase().includes(q)) ||
            b.localAliases.some((a) => a.alias.toLowerCase().includes(q)),
        }}
        defaultSort={{ columnId: 'created', direction: 'desc' }}
        selection={{
          renderActions: (selected, clear) => (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDelete({ ids: selected.map((b) => b.id), clear })}
            >
              <DeleteActionIcon className="h-3.5 w-3.5" />
              Delete {selected.length}
            </Button>
          ),
        }}
        rowActions={(b) => (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setDeleteConfirm({ id: b.id, name: b.globalAliases[0] || b.id })}
          >
            <DeleteActionIcon className="h-3.5 w-3.5" />
            Delete
          </Button>
        )}
        emptyState={{
          icon: BucketIcon,
          title: 'No buckets found',
          description: 'Create a bucket to get started.',
          action: (
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(true)}>
              <AddActionIcon className="h-4 w-4 mr-2" /> Create Bucket
            </Button>
          ),
        }}
      />

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

      <ConfirmDialog
        open={!!bulkDelete}
        onOpenChange={(open) => !open && !bulkPending && setBulkDelete(null)}
        title={`Delete ${bulkDelete?.ids.length ?? 0} buckets`}
        description={`Permanently delete ${bulkDelete?.ids.length ?? 0} selected bucket(s)? Each bucket must be empty; any that still hold objects are skipped and reported.`}
        tier="danger"
        confirmText={`Delete ${bulkDelete?.ids.length ?? 0} buckets`}
        onConfirm={handleBulkDelete}
        isLoading={bulkPending}
      />
    </div>
  );
}
