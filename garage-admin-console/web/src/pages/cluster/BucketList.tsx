import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
  Input,
  Label,
  Checkbox,
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
  CopyValue,
  AliasOverflow,
  EmptyValue,
  cn,
} from '@garage/ui';
import { ChevronRight } from 'lucide-react';
import { api, proxyPath } from '@/lib/api';
import { formatDateTime, formatShortId, getApiErrorMessage } from '@garage/web-shared';
import { ConfirmDialog } from '@garage/ui';
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
import { validateBucketAlias } from '@/lib/bucket-name';
import type { CreateBucketRequest, ListBucketsResponseItem } from '@/types/garage';

export function BucketList() {
  const { clusterId } = useClusterContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [globalAlias, setGlobalAlias] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [localAlias, setLocalAlias] = useState('');
  const [localAccessKeyId, setLocalAccessKeyId] = useState('');
  const [noAlias, setNoAlias] = useState(false);
  const [actionError, setActionError] = useState('');

  const resetForm = () => {
    setGlobalAlias('');
    setAdvancedOpen(false);
    setLocalAlias('');
    setLocalAccessKeyId('');
    setNoAlias(false);
    setActionError('');
  };
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
      resetForm();
    },
    onError: (err) => {
      setActionError(getApiErrorMessage(err, 'Failed to create bucket.'));
    },
  });

  const trimmedGlobal = globalAlias.trim();
  const trimmedLocal = localAlias.trim();

  const selectedLocalAccessKeyId =
    localAccessKeyId && keys.some((key) => key.id === localAccessKeyId)
      ? localAccessKeyId
      : keys[0]?.id || '';
  const hasLocalKey = Boolean(selectedLocalAccessKeyId);

  const hasGlobal = !noAlias && trimmedGlobal.length > 0;
  const hasLocal = !noAlias && advancedOpen && trimmedLocal.length > 0;

  const globalError = hasGlobal ? validateBucketAlias(trimmedGlobal) : null;
  const localError = hasLocal ? validateBucketAlias(trimmedLocal) : null;

  const canCreate =
    !createMutation.isPending &&
    !globalError &&
    !localError &&
    (noAlias || hasGlobal || hasLocal) &&
    (!hasLocal || hasLocalKey);

  const handleCreate = () => {
    if (!canCreate) return;
    const payload: CreateBucketRequest = {};
    if (hasGlobal) {
      payload.globalAlias = trimmedGlobal;
    }
    if (hasLocal) {
      payload.localAlias = {
        accessKeyId: selectedLocalAccessKeyId,
        alias: trimmedLocal,
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
      cellClassName: 'text-xs font-mono',
      cell: (b) => (
        <CopyValue value={b.id} label="Bucket ID" className="max-w-[26ch]">
          {b.id}
        </CopyValue>
      ),
    },
    {
      id: 'globalAliases',
      header: 'Global Aliases',
      cell: (b) => (
        <AliasOverflow
          items={b.globalAliases.map((alias) => ({
            key: alias,
            value: alias,
            label: 'Global alias',
          }))}
        />
      ),
    },
    {
      id: 'created',
      header: 'Created',
      sortable: true,
      sortAccessor: (b) => b.created ?? '',
      cellClassName: 'text-xs text-muted-foreground',
      cell: (b) => (b.created ? formatDateTime(b.created) : <EmptyValue />),
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
              resetForm();
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
                <DialogDescription>
                  Buckets store objects. Name it now, or create an ID-only bucket and add a name
                  later.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreate();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="bucket-name">Bucket name</Label>
                  <Input
                    id="bucket-name"
                    autoFocus
                    value={globalAlias}
                    onChange={(e) => setGlobalAlias(e.target.value)}
                    placeholder="app-assets"
                    disabled={noAlias}
                    aria-invalid={globalError ? true : undefined}
                    aria-describedby={globalError ? 'bucket-name-error' : 'bucket-name-hint'}
                    className={cn(
                      globalError && 'border-destructive focus-visible:ring-destructive/40',
                    )}
                  />
                  {globalError ? (
                    <p id="bucket-name-error" className="text-xs text-destructive">
                      {globalError}
                    </p>
                  ) : (
                    <p id="bucket-name-hint" className="text-xs text-muted-foreground">
                      Cluster-wide alias. Lowercase letters, numbers, dots and hyphens; 3–63
                      characters.
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((open) => !open)}
                    aria-expanded={advancedOpen}
                    disabled={noAlias}
                    className={cn(
                      'flex items-center gap-1 rounded-sm text-sm font-medium text-foreground transition-colors hover:text-primary',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  >
                    <ChevronRight
                      className={cn('h-4 w-4 transition-transform', advancedOpen && 'rotate-90')}
                    />
                    Advanced — private alias for a key
                  </button>

                  {advancedOpen && !noAlias && (
                    <div className="space-y-3 border-l-2 border-border pl-3">
                      <p className="text-xs text-muted-foreground">
                        A bucket name visible only to one access key, in addition to (or instead of)
                        the cluster-wide name above.
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="local-alias">Local alias</Label>
                        <Input
                          id="local-alias"
                          value={localAlias}
                          onChange={(e) => setLocalAlias(e.target.value)}
                          placeholder="app-assets"
                          aria-invalid={localError ? true : undefined}
                          aria-describedby={localError ? 'local-alias-error' : undefined}
                          className={cn(
                            localError && 'border-destructive focus-visible:ring-destructive/40',
                          )}
                        />
                        {localError && (
                          <p id="local-alias-error" className="text-xs text-destructive">
                            {localError}
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="access-key">Access key</Label>
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
                            <SelectTrigger id="access-key">
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
                          <p className="text-sm text-muted-foreground">
                            No access keys available. Create a key first to use a local alias.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-start gap-2">
                  <Checkbox
                    id="no-alias"
                    checked={noAlias}
                    onCheckedChange={setNoAlias}
                    aria-describedby="no-alias-desc"
                    className="mt-0.5"
                  />
                  <div className="text-sm leading-snug">
                    <Label htmlFor="no-alias" className="font-medium">
                      Create without a name
                    </Label>
                    <p id="no-alias-desc" className="text-xs text-muted-foreground">
                      The bucket will be addressable only by its ID until you add an alias.
                    </p>
                  </div>
                </div>

                {actionError && (
                  <Alert variant="destructive">
                    <AlertTitle>Bucket creation failed</AlertTitle>
                    <AlertDescription>{actionError}</AlertDescription>
                  </Alert>
                )}

                <DialogFooter>
                  <Button type="submit" disabled={!canCreate}>
                    {createMutation.isPending ? 'Creating...' : 'Create Bucket'}
                  </Button>
                </DialogFooter>
              </form>
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
        getRowLabel={(b) => `Open bucket ${b.globalAliases[0] || formatShortId(b.id, 10)}`}
        renderTitle={(b) => (
          <CopyValue value={b.id} label="Bucket ID">
            {b.id}
          </CopyValue>
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
