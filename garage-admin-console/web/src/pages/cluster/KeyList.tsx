import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Badge,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Alert,
  AlertDescription,
  AlertTitle,
  ResourceList,
  type ResourceListColumn,
} from '@garage/ui';
import { api, proxyPath } from '@/lib/api';
import { formatDateTime, formatShortId, getApiErrorMessage } from '@garage/web-shared';
import { ConfirmDialog } from '@garage/ui';
import { CopyButton } from '@garage/ui';
import { ModulePageHeader } from '@garage/ui';
import { TableLoadingState } from '@/components/cluster/TableLoadingState';
import { useClusterContext } from '@/contexts/ClusterContext';
import { AddActionIcon, CopyActionIcon, DeleteActionIcon } from '@/lib/action-icons';
import { KeyIcon } from '@/lib/entity-icons';
import { toast } from '@garage/ui';
import { runBulkDelete } from '@/lib/bulk-delete';
import { useKeys, useImportKey } from '@/hooks/useKeys';
import type { CreateKeyRequest, GetKeyInfoResponse, ListKeysResponseItem } from '@/types/garage';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function KeyList() {
  const { clusterId } = useClusterContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Guided flow from BucketDetail zero-key CTA
  const createParam = searchParams.get('create');
  const prefillNameParam = searchParams.get('prefillName') ?? '';
  const grantBucketIdParam = searchParams.get('grantBucketId') ?? '';
  const returnToParam = searchParams.get('returnTo') ?? '';

  const [isDialogOpen, setIsDialogOpen] = useState(createParam === '1');
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState(prefillNameParam);
  const [createExpirationDate, setCreateExpirationDate] = useState('');
  const [createExpirationHour, setCreateExpirationHour] = useState('00');
  const [createExpirationMinute, setCreateExpirationMinute] = useState('00');
  const [createNeverExpires, setCreateNeverExpires] = useState(false);
  const [createBucketPermission, setCreateBucketPermission] = useState<
    'default' | 'allow' | 'deny'
  >('default');
  const [importAccessKeyId, setImportAccessKeyId] = useState('');
  const [importSecretAccessKey, setImportSecretAccessKey] = useState('');
  const [importKeyName, setImportKeyName] = useState('');
  const [importError, setImportError] = useState('');
  const [actionError, setActionError] = useState('');
  const [createdKey, setCreatedKey] = useState<GetKeyInfoResponse | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [bulkDelete, setBulkDelete] = useState<{ ids: string[]; clear: () => void } | null>(null);
  const [bulkPending, setBulkPending] = useState(false);

  const resetCreateForm = () => {
    setNewKeyName('');
    setCreateExpirationDate('');
    setCreateExpirationHour('00');
    setCreateExpirationMinute('00');
    setCreateNeverExpires(false);
    setCreateBucketPermission('default');
    setActionError('');
  };

  const resetImportForm = () => {
    setImportAccessKeyId('');
    setImportSecretAccessKey('');
    setImportKeyName('');
    setImportError('');
  };

  const expirationDate = createExpirationDate
    ? new Date(`${createExpirationDate}T${createExpirationHour}:${createExpirationMinute}:00`)
    : null;
  const expirationIso =
    expirationDate && !Number.isNaN(expirationDate.getTime()) ? expirationDate.toISOString() : null;
  const expirationInvalid = Boolean(createExpirationDate) && !expirationIso;

  const { data: keys = [], isLoading, error } = useKeys(clusterId);

  const createMutation = useMutation({
    mutationFn: async (payload: CreateKeyRequest) => {
      const res = await api.post<GetKeyInfoResponse>(
        proxyPath(clusterId, '/v2/CreateKey'),
        payload,
      );
      return res.data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['keys', clusterId] });
      setIsDialogOpen(false);
      resetCreateForm();

      // Guided flow: grant the new key access to the specified bucket, then
      // redirect back to BucketDetail so the user can start browsing.
      if (grantBucketIdParam) {
        try {
          await api.post(proxyPath(clusterId, '/v2/AllowBucketKey'), {
            bucketId: grantBucketIdParam,
            accessKeyId: data.accessKeyId,
            permissions: { read: true, write: true, owner: false },
          });
        } catch (err) {
          toast({
            title: 'Key created — bucket grant failed',
            description: getApiErrorMessage(err, 'Could not grant bucket access automatically.'),
            variant: 'destructive',
          });
          // Still redirect so the user can see and use the new key.
        }
      }

      if (returnToParam) {
        const sep = returnToParam.includes('?') ? '&' : '?';
        navigate(`${returnToParam}${sep}selectKey=${encodeURIComponent(data.accessKeyId)}`);
        return;
      }

      setCreatedKey(data);
    },
    onError: (err) => {
      setActionError(getApiErrorMessage(err, 'Failed to create key.'));
    },
  });

  const importKeyMutation = useImportKey(clusterId);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(proxyPath(clusterId, `/v2/DeleteKey?id=${encodeURIComponent(id)}`), {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys', clusterId] });
      setDeleteConfirm(null);
      toast({ title: 'Key deleted', variant: 'success' });
    },
    onError: (err) => {
      toast({
        title: 'Failed to delete key',
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
        .post(proxyPath(clusterId, `/v2/DeleteKey?id=${encodeURIComponent(id)}`), {})
        .then(() => undefined),
    );
    setBulkPending(false);
    queryClient.invalidateQueries({ queryKey: ['keys', clusterId] });
    bulkDelete.clear();
    setBulkDelete(null);

    if (outcome.failed.length === 0) {
      toast({
        title: `Deleted ${outcome.ok.length} key${outcome.ok.length === 1 ? '' : 's'}`,
        variant: 'success',
      });
    } else {
      toast({
        title:
          outcome.ok.length === 0
            ? `Couldn't delete ${outcome.failed.length} key${outcome.failed.length === 1 ? '' : 's'}`
            : `Deleted ${outcome.ok.length}, ${outcome.failed.length} failed`,
        description: `${outcome.failed[0].message}${outcome.failed.length > 1 ? ` (+${outcome.failed.length - 1} more)` : ''}`,
        variant: 'destructive',
      });
    }
  };

  // Reset the "copied" indicator after a delay, clearing the timer on unmount
  // or re-copy so it never fires setState on an unmounted component.
  useEffect(() => {
    if (!copiedValue) return;
    const timer = window.setTimeout(() => setCopiedValue(null), 1500);
    return () => window.clearTimeout(timer);
  }, [copiedValue]);

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCreate = () => {
    if (expirationInvalid) return;
    const payload: CreateKeyRequest = {};
    const trimmedName = newKeyName.trim();
    if (trimmedName) payload.name = trimmedName;
    if (createNeverExpires) {
      payload.neverExpires = true;
    } else if (expirationIso) {
      payload.expiration = expirationIso;
    }
    if (createBucketPermission === 'allow') {
      payload.allow = { createBucket: true };
    } else if (createBucketPermission === 'deny') {
      payload.deny = { createBucket: true };
    }
    setActionError('');
    createMutation.mutate(payload);
  };

  const handleImport = async () => {
    if (!importAccessKeyId.trim() || !importSecretAccessKey.trim()) return;
    setImportError('');
    try {
      await importKeyMutation.mutateAsync({
        accessKeyId: importAccessKeyId.trim(),
        secretAccessKey: importSecretAccessKey.trim(),
        name: importKeyName.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['keys', clusterId] });
      setIsImportDialogOpen(false);
      resetImportForm();
      toast({ title: 'Key imported', variant: 'success' });
    } catch (err) {
      setImportError(getApiErrorMessage(err, 'Failed to import key.'));
    }
  };

  const columns: ResourceListColumn<ListKeysResponseItem>[] = [
    {
      id: 'id',
      header: 'Access Key ID',
      sortable: true,
      sortAccessor: (k) => k.id,
      mobileHidden: true,
      cellClassName: 'text-xs',
      cell: (k) => (
        <div className="inline-flex items-center gap-1">
          <span>{formatShortId(k.id, 12)}</span>
          <CopyButton value={k.id} label="Access key ID" compact />
        </div>
      ),
    },
    {
      id: 'name',
      header: 'Name',
      sortable: true,
      sortAccessor: (k) => k.name ?? '',
      cell: (k) => k.name || '—',
    },
    {
      id: 'status',
      header: 'Status',
      cell: (k) =>
        k.expired ? (
          <Badge variant="destructive">Expired</Badge>
        ) : (
          <Badge variant="success">Active</Badge>
        ),
    },
    {
      id: 'created',
      header: 'Created',
      sortable: true,
      sortAccessor: (k) => k.created ?? '',
      cellClassName: 'text-xs text-muted-foreground',
      cell: (k) => formatDateTime(k.created),
    },
    {
      id: 'expiration',
      header: 'Expires',
      sortable: true,
      sortAccessor: (k) => k.expiration ?? '',
      cellClassName: 'text-xs text-muted-foreground',
      cell: (k) => formatDateTime(k.expiration),
    },
  ];

  if (isLoading) return <TableLoadingState label="Loading access keys..." />;

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="Access Keys"
        description="Top-level key inventory. Open a key for granular permission controls."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Dialog
              open={isImportDialogOpen}
              onOpenChange={(open) => {
                setIsImportDialogOpen(open);
                if (!open) resetImportForm();
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline">Import Key</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import Access Key</DialogTitle>
                </DialogHeader>
                <Alert variant="warning">
                  <AlertTitle>Migration only</AlertTitle>
                  <AlertDescription>
                    Imports an existing API key. This feature must only be used for migrations and
                    backup restore. Do not use it to generate custom key identifiers or you will
                    break your Garage cluster.
                  </AlertDescription>
                </Alert>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Access Key ID</Label>
                    <Input
                      value={importAccessKeyId}
                      onChange={(e) => setImportAccessKeyId(e.target.value)}
                      placeholder="AKIA..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Secret Access Key</Label>
                    <Input
                      type="password"
                      value={importSecretAccessKey}
                      onChange={(e) => setImportSecretAccessKey(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Key Name (optional)</Label>
                    <Input
                      value={importKeyName}
                      onChange={(e) => setImportKeyName(e.target.value)}
                      placeholder="migrated-key"
                    />
                  </div>
                </div>
                {importError && (
                  <Alert variant="destructive">
                    <AlertTitle>Import failed</AlertTitle>
                    <AlertDescription>{importError}</AlertDescription>
                  </Alert>
                )}
                <DialogFooter>
                  <Button
                    onClick={handleImport}
                    disabled={
                      importKeyMutation.isPending ||
                      !importAccessKeyId.trim() ||
                      !importSecretAccessKey.trim()
                    }
                  >
                    {importKeyMutation.isPending ? 'Importing...' : 'Import'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) resetCreateForm();
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <AddActionIcon className="h-4 w-4" /> Create Key
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Access Key</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Key Name</Label>
                    <Input
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="my-app-key"
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Expiration (24h)</Label>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Date</div>
                          <Input
                            type="date"
                            value={createExpirationDate}
                            onChange={(e) => setCreateExpirationDate(e.target.value)}
                            disabled={createNeverExpires}
                            className="min-w-[170px]"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Time</div>
                          <div className="flex items-center gap-2">
                            <Select
                              value={createExpirationHour}
                              onValueChange={setCreateExpirationHour}
                              disabled={createNeverExpires}
                            >
                              <SelectTrigger className="w-[84px]">
                                <SelectValue placeholder="HH" />
                              </SelectTrigger>
                              <SelectContent>
                                {HOUR_OPTIONS.map((hour) => (
                                  <SelectItem key={hour} value={hour}>
                                    {hour}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <span className="text-sm text-muted-foreground">:</span>
                            <Select
                              value={createExpirationMinute}
                              onValueChange={setCreateExpirationMinute}
                              disabled={createNeverExpires}
                            >
                              <SelectTrigger className="w-[84px]">
                                <SelectValue placeholder="MM" />
                              </SelectTrigger>
                              <SelectContent>
                                {MINUTE_OPTIONS.map((minute) => (
                                  <SelectItem key={minute} value={minute}>
                                    {minute}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Leave empty to use the default expiration policy.
                      </p>
                      {expirationInvalid && (
                        <p className="text-xs text-destructive">Invalid date and time.</p>
                      )}
                    </div>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <Checkbox
                        checked={createNeverExpires}
                        onCheckedChange={(checked) => {
                          setCreateNeverExpires(checked);
                          if (checked) {
                            setCreateExpirationDate('');
                            setCreateExpirationHour('00');
                            setCreateExpirationMinute('00');
                          }
                        }}
                      />
                      Never expires
                    </label>
                  </div>
                  <div className="space-y-2">
                    <Label>Bucket Creation Permission</Label>
                    <Select
                      value={createBucketPermission}
                      onValueChange={(value) =>
                        setCreateBucketPermission(value as 'default' | 'allow' | 'deny')
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default (no override)</SelectItem>
                        <SelectItem value="allow">Allow create bucket</SelectItem>
                        <SelectItem value="deny">Deny create bucket</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Controls whether the key can create buckets.
                    </p>
                  </div>
                </div>
                {actionError && (
                  <Alert variant="destructive">
                    <AlertTitle>Key creation failed</AlertTitle>
                    <AlertDescription>{actionError}</AlertDescription>
                  </Alert>
                )}
                <DialogFooter>
                  <Button
                    onClick={handleCreate}
                    disabled={expirationInvalid || createMutation.isPending}
                  >
                    {createMutation.isPending ? 'Creating...' : 'Create'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load keys</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(error, 'Keys could not be loaded.')}
          </AlertDescription>
        </Alert>
      )}

      <ResourceList
        items={keys}
        getRowId={(k) => k.id}
        columns={columns}
        onRowClick={(k) => navigate(`/clusters/${clusterId}/keys/${k.id}`)}
        renderTitle={(k) => (
          <div className="inline-flex items-center gap-1 text-sm">
            <span>{formatShortId(k.id, 12)}</span>
            <CopyButton value={k.id} label="Access key ID" compact />
          </div>
        )}
        search={{
          placeholder: 'Search by ID or name...',
          predicate: (k, q) => k.id.toLowerCase().includes(q) || k.name.toLowerCase().includes(q),
        }}
        defaultSort={{ columnId: 'created', direction: 'desc' }}
        selection={{
          renderActions: (selected, clear) => (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDelete({ ids: selected.map((k) => k.id), clear })}
            >
              <DeleteActionIcon className="h-3.5 w-3.5" />
              Delete {selected.length}
            </Button>
          ),
        }}
        rowActions={(k) => (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setDeleteConfirm({ id: k.id, name: k.name || k.id })}
          >
            <DeleteActionIcon className="h-3.5 w-3.5" />
            Delete
          </Button>
        )}
        emptyState={{
          icon: KeyIcon,
          title: 'No keys found',
          description: 'Create or import an access key to get started.',
          action: (
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(true)}>
              <AddActionIcon className="h-4 w-4 mr-2" /> Create Key
            </Button>
          ),
        }}
      />

      <Dialog
        open={Boolean(createdKey)}
        onOpenChange={(open) => {
          if (!open) setCreatedKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Access Key Created</DialogTitle>
          </DialogHeader>
          {createdKey && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">Access Key ID</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-foreground break-all">
                    {createdKey.accessKeyId}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopy(createdKey.accessKeyId)}
                  >
                    <CopyActionIcon className="h-4 w-4" />
                  </Button>
                </div>
                {copiedValue === createdKey.accessKeyId && (
                  <div className="text-xs text-success mt-1">Copied!</div>
                )}
              </div>
              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">Secret Access Key</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-foreground break-all">
                    {createdKey.secretAccessKey || '—'}
                  </span>
                  {createdKey.secretAccessKey && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopy(createdKey.secretAccessKey || '')}
                    >
                      <CopyActionIcon className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {createdKey.secretAccessKey && copiedValue === createdKey.secretAccessKey && (
                  <div className="text-xs text-success mt-1">Copied!</div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Secret access keys are only shown once. Store it securely.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreatedKey(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Delete Access Key"
        description={`Are you sure you want to delete the key "${deleteConfirm?.name}"? This will revoke access to all buckets using this key.`}
        tier="danger"
        confirmText="Delete Key"
        onConfirm={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
        isLoading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={!!bulkDelete}
        onOpenChange={(open) => !open && !bulkPending && setBulkDelete(null)}
        title={`Delete ${bulkDelete?.ids.length ?? 0} keys`}
        description={`Permanently delete ${bulkDelete?.ids.length ?? 0} selected key(s)? This revokes access to every bucket using them.`}
        tier="danger"
        confirmText={`Delete ${bulkDelete?.ids.length ?? 0} keys`}
        onConfirm={handleBulkDelete}
        isLoading={bulkPending}
      />
    </div>
  );
}
