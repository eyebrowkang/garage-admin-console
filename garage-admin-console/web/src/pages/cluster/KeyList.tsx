import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Badge,
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
  CopyValue,
  EmptyValue,
  ExpirationPicker,
} from '@garage/ui';
import { MoreHorizontal } from 'lucide-react';
import { api, proxyPath } from '@/lib/api';
import { formatDateTime, formatShortId, getApiErrorMessage } from '@garage/web-shared';
import { ConfirmDialog } from '@garage/ui';
import { ModulePageHeader } from '@garage/ui';
import { TableLoadingState } from '@/components/cluster/TableLoadingState';
import { useClusterContext } from '@/contexts/ClusterContext';
import { AddActionIcon, DeleteActionIcon, EditActionIcon } from '@/lib/action-icons';
import { KeyIcon } from '@/lib/entity-icons';
import { toast } from '@garage/ui';
import { runBulkDelete } from '@/lib/bulk-delete';
import { useKeys, useImportKey } from '@/hooks/useKeys';
import type {
  CreateKeyRequest,
  GetKeyInfoResponse,
  ListKeysResponseItem,
  UpdateKeyRequest,
} from '@/types/garage';

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
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [bulkDelete, setBulkDelete] = useState<{ ids: string[]; clear: () => void } | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const [editKey, setEditKey] = useState<ListKeysResponseItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editExpirationDate, setEditExpirationDate] = useState('');
  const [editExpirationHour, setEditExpirationHour] = useState('00');
  const [editExpirationMinute, setEditExpirationMinute] = useState('00');
  const [editNeverExpires, setEditNeverExpires] = useState(false);
  const [editError, setEditError] = useState('');

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

  const toDateParts = (value?: string | null) => {
    if (!value) return { date: '', hour: '00', minute: '00' };
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return { date: '', hour: '00', minute: '00' };
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      hour: pad(d.getHours()),
      minute: pad(d.getMinutes()),
    };
  };

  const editExpirationValue = editExpirationDate
    ? new Date(`${editExpirationDate}T${editExpirationHour}:${editExpirationMinute}:00`)
    : null;
  const editExpirationIso =
    editExpirationValue && !Number.isNaN(editExpirationValue.getTime())
      ? editExpirationValue.toISOString()
      : null;
  const editExpirationInvalid = Boolean(editExpirationDate) && !editExpirationIso;

  const openEdit = (key: ListKeysResponseItem) => {
    const parts = toDateParts(key.expiration);
    setEditKey(key);
    setEditName(key.name ?? '');
    setEditExpirationDate(parts.date);
    setEditExpirationHour(parts.hour);
    setEditExpirationMinute(parts.minute);
    setEditNeverExpires(!key.expiration);
    setEditError('');
  };

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateKeyRequest }) => {
      await api.post(proxyPath(clusterId, `/v2/UpdateKey?id=${encodeURIComponent(id)}`), payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys', clusterId] });
      setEditKey(null);
      toast({ title: 'Key updated', variant: 'success' });
    },
    onError: (err) => {
      setEditError(getApiErrorMessage(err, 'Failed to update key.'));
    },
  });

  const handleUpdate = () => {
    if (!editKey || editExpirationInvalid) return;
    const payload: UpdateKeyRequest = {};
    const trimmedName = editName.trim();
    if (trimmedName !== (editKey.name ?? '')) {
      payload.name = trimmedName || null;
    }
    if (editNeverExpires) {
      payload.neverExpires = true;
    } else if (editExpirationIso) {
      payload.expiration = editExpirationIso;
    } else if (editKey.expiration) {
      payload.expiration = null;
    }
    updateMutation.mutate({ id: editKey.id, payload });
  };

  const columns: ResourceListColumn<ListKeysResponseItem>[] = [
    {
      id: 'name',
      header: 'Name',
      sortable: true,
      sortAccessor: (k) => k.name ?? '',
      mobileHidden: true, // becomes the mobile card title
      cell: (k) => (k.name ? k.name : <EmptyValue />),
    },
    {
      id: 'id',
      header: 'Access Key ID',
      sortable: true,
      sortAccessor: (k) => k.id,
      mobileHidden: true, // mobile identity is the name (title) + id (subtitle)
      cellClassName: 'text-xs',
      cell: (k) => (
        <CopyValue value={k.id} label="Access key ID" className="max-w-[26ch] font-mono">
          {k.id}
        </CopyValue>
      ),
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
      cell: (k) => (k.created ? formatDateTime(k.created) : <EmptyValue />),
    },
    {
      id: 'expiration',
      header: 'Expires',
      sortable: true,
      sortAccessor: (k) => k.expiration ?? '',
      cellClassName: 'text-xs text-muted-foreground',
      cell: (k) => (k.expiration ? formatDateTime(k.expiration) : <EmptyValue />),
    },
  ];

  if (isLoading) return <TableLoadingState label="Loading access keys..." />;

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="Access Keys"
        description="Top-level key inventory. Open a key for granular permission controls."
        actions={
          <div className="flex items-center gap-2">
            <Dialog
              open={isImportDialogOpen}
              onOpenChange={(open) => {
                setIsImportDialogOpen(open);
                if (!open) resetImportForm();
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import Access Key</DialogTitle>
                  <DialogDescription>
                    Migration only — re-register an existing key from its id and secret.
                  </DialogDescription>
                </DialogHeader>
                <Alert variant="warning">
                  <AlertTitle>Migration only</AlertTitle>
                  <AlertDescription>
                    Imports an existing API key. This feature must only be used for migrations and
                    backup restore. Do not use it to generate custom key identifiers or you will
                    break your Garage cluster.
                  </AlertDescription>
                </Alert>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleImport();
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="import-id">Access Key ID</Label>
                    <Input
                      id="import-id"
                      autoFocus
                      value={importAccessKeyId}
                      onChange={(e) => setImportAccessKeyId(e.target.value)}
                      placeholder="AKIA..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="import-secret">Secret Access Key</Label>
                    <Input
                      id="import-secret"
                      type="password"
                      value={importSecretAccessKey}
                      onChange={(e) => setImportSecretAccessKey(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="import-name">Key Name (optional)</Label>
                    <Input
                      id="import-name"
                      value={importKeyName}
                      onChange={(e) => setImportKeyName(e.target.value)}
                      placeholder="migrated-key"
                    />
                  </div>
                  {importError && (
                    <Alert variant="destructive">
                      <AlertTitle>Import failed</AlertTitle>
                      <AlertDescription>{importError}</AlertDescription>
                    </Alert>
                  )}
                  <DialogFooter>
                    <Button
                      type="submit"
                      disabled={
                        importKeyMutation.isPending ||
                        !importAccessKeyId.trim() ||
                        !importSecretAccessKey.trim()
                      }
                    >
                      {importKeyMutation.isPending ? 'Importing...' : 'Import Key'}
                    </Button>
                  </DialogFooter>
                </form>
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
                <Button className="flex-1 sm:flex-initial">
                  <AddActionIcon className="h-4 w-4" /> Create Key
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Access Key</DialogTitle>
                  <DialogDescription>
                    Generates a new S3 access key and secret. The secret is shown once.
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
                    <Label htmlFor="key-name">Key name</Label>
                    <Input
                      id="key-name"
                      autoFocus
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="my-app-key"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Expiration</Label>
                    <ExpirationPicker
                      allowDefault
                      date={createExpirationDate}
                      hour={createExpirationHour}
                      minute={createExpirationMinute}
                      neverExpires={createNeverExpires}
                      onDateChange={setCreateExpirationDate}
                      onHourChange={setCreateExpirationHour}
                      onMinuteChange={setCreateExpirationMinute}
                      onNeverExpiresChange={setCreateNeverExpires}
                      invalid={expirationInvalid}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bucket-perm">Bucket creation permission</Label>
                    <Select
                      value={createBucketPermission}
                      onValueChange={(value) =>
                        setCreateBucketPermission(value as 'default' | 'allow' | 'deny')
                      }
                    >
                      <SelectTrigger id="bucket-perm">
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
                  {actionError && (
                    <Alert variant="destructive">
                      <AlertTitle>Key creation failed</AlertTitle>
                      <AlertDescription>{actionError}</AlertDescription>
                    </Alert>
                  )}
                  <DialogFooter>
                    <Button type="submit" disabled={expirationInvalid || createMutation.isPending}>
                      {createMutation.isPending ? 'Creating...' : 'Create Key'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More key actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setIsImportDialogOpen(true)}>
                  Import key
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
        getRowLabel={(k) => `Open access key ${k.name || formatShortId(k.id, 12)}`}
        renderTitle={(k) =>
          k.name ? (
            <CopyValue value={k.name} label="Key name" className="max-w-full">
              {k.name}
            </CopyValue>
          ) : (
            <CopyValue value={k.id} label="Access key ID" className="max-w-full font-mono">
              {k.id}
            </CopyValue>
          )
        }
        renderSubtitle={(k) =>
          k.name ? (
            <CopyValue
              value={k.id}
              label="Access key ID"
              className="max-w-full font-mono text-xs text-muted-foreground"
            >
              {k.id}
            </CopyValue>
          ) : null
        }
        search={{
          placeholder: 'Search by ID or name...',
          predicate: (k, q) => k.id.toLowerCase().includes(q) || k.name.toLowerCase().includes(q),
        }}
        defaultSort={{ columnId: 'created', direction: 'desc' }}
        filters={[
          {
            id: 'status',
            label: 'Status',
            options: [
              { value: 'active', label: 'Active', predicate: (k) => !k.expired },
              { value: 'expired', label: 'Expired', predicate: (k) => k.expired },
            ],
          },
        ]}
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
        actions={(k) => [
          {
            label: 'Edit',
            icon: EditActionIcon,
            onSelect: () => openEdit(k),
          },
          {
            label: 'Delete',
            icon: DeleteActionIcon,
            destructive: true,
            onSelect: () => setDeleteConfirm({ id: k.id, name: k.name || k.id }),
          },
        ]}
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
            <div className="min-w-0 space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">Access Key ID</div>
                <CopyValue
                  value={createdKey.accessKeyId}
                  label="Access key ID"
                  className="mt-1 max-w-full font-mono text-sm"
                >
                  {createdKey.accessKeyId}
                </CopyValue>
              </div>
              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">Secret Access Key</div>
                {createdKey.secretAccessKey ? (
                  <CopyValue
                    value={createdKey.secretAccessKey}
                    label="Secret access key"
                    className="mt-1 max-w-full font-mono text-sm"
                  >
                    {createdKey.secretAccessKey}
                  </CopyValue>
                ) : (
                  <div className="mt-1 text-sm text-muted-foreground">—</div>
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

      <Dialog
        open={!!editKey}
        onOpenChange={(open) => {
          if (!open) setEditKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Access Key</DialogTitle>
            <DialogDescription>
              Rename the key or change when it expires. Manage permissions on the key&rsquo;s page.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleUpdate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="edit-key-name">Key name</Label>
              <Input
                id="edit-key-name"
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="my-app-key"
              />
            </div>
            <div className="space-y-2">
              <Label>Expiration</Label>
              <ExpirationPicker
                date={editExpirationDate}
                hour={editExpirationHour}
                minute={editExpirationMinute}
                neverExpires={editNeverExpires}
                onDateChange={setEditExpirationDate}
                onHourChange={setEditExpirationHour}
                onMinuteChange={setEditExpirationMinute}
                onNeverExpiresChange={setEditNeverExpires}
                currentLabel={editKey?.expiration ? formatDateTime(editKey.expiration) : 'Never'}
                invalid={editExpirationInvalid}
              />
            </div>
            {editError && (
              <Alert variant="destructive">
                <AlertTitle>Update failed</AlertTitle>
                <AlertDescription>{editError}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="submit" disabled={editExpirationInvalid || updateMutation.isPending}>
                {updateMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
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
