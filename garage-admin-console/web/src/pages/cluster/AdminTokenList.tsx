import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import {
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  Alert,
  AlertDescription,
  AlertTitle,
  ResourceList,
  type ResourceListColumn,
  EmptyValue,
  ConfirmDialog,
  ModulePageHeader,
} from '@garage/ui';
import { api, proxyPath } from '@/lib/api';
import { useClusterContext } from '@/contexts/ClusterContext';
import {
  useAdminTokens,
  useCurrentAdminToken,
  useCreateAdminToken,
  useDeleteAdminToken,
} from '@/hooks/useAdminTokens';
import { SecretReveal } from '@/components/cluster/SecretReveal';
import {
  AdminTokenFormFields,
} from '@/components/cluster/AdminTokenFormFields';
import {
  EMPTY_TOKEN_FORM,
  buildTokenPayload,
  validateTokenForm,
  type AdminTokenFormState,
} from '@/components/cluster/admin-token-form';
import { TableLoadingState } from '@/components/cluster/TableLoadingState';
import { AddActionIcon, DeleteActionIcon } from '@/lib/action-icons';
import { formatDateTime, getApiErrorMessage } from '@garage/web-shared';
import { TokenIcon } from '@/lib/entity-icons';
import { toast } from '@garage/ui';
import { runBulkDelete } from '@/lib/bulk-delete';
import type { AdminTokenInfo, CreateAdminTokenResponse } from '@/types/garage';

function renderScopeSummary(scope: string[]) {
  if (scope.includes('*')) {
    return <span className="font-medium text-warning">Full access (*)</span>;
  }
  if (scope.length === 0) {
    return <span className="text-muted-foreground">No scope</span>;
  }
  const preview = scope.slice(0, 3).join(', ');
  const suffix = scope.length > 3 ? ` +${scope.length - 3} more` : '';
  return (
    <span className="font-mono text-xs text-foreground">
      {preview}
      {suffix}
    </span>
  );
}

const formatExpiration = (value?: string | null) => (value ? formatDateTime(value) : 'Never');

export function AdminTokenList() {
  const { clusterId } = useClusterContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<AdminTokenFormState>(EMPTY_TOKEN_FORM);
  const [createError, setCreateError] = useState('');
  const [createdToken, setCreatedToken] = useState<CreateAdminTokenResponse | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [bulkDelete, setBulkDelete] = useState<{ ids: string[]; clear: () => void } | null>(null);
  const [bulkPending, setBulkPending] = useState(false);

  const { data: tokens, isLoading, error } = useAdminTokens(clusterId);
  const { data: currentToken } = useCurrentAdminToken(clusterId);
  const createMutation = useCreateAdminToken(clusterId);
  const deleteMutation = useDeleteAdminToken(clusterId);

  // The connection's own token can lack an id (e.g. the daemon-config token), so
  // fall back to a name match — and never let it be deleted (that revokes access).
  const isCurrent = (t: AdminTokenInfo) =>
    Boolean(currentToken) &&
    ((Boolean(t.id) && t.id === currentToken!.id) ||
      (!currentToken!.id && t.name === currentToken!.name));

  const statusBadges = (t: AdminTokenInfo) => (
    <>
      {t.expired ? (
        <Badge variant="destructive" className="text-xs">
          Expired
        </Badge>
      ) : (
        <Badge variant="success" className="text-xs">
          Active
        </Badge>
      )}
      {isCurrent(t) && (
        <Badge variant="secondary" className="text-xs">
          Current
        </Badge>
      )}
    </>
  );

  const resetCreateForm = () => {
    setCreateForm(EMPTY_TOKEN_FORM);
    setCreateError('');
  };

  const handleCreate = async () => {
    const validationError = validateTokenForm(createForm);
    if (validationError) {
      setCreateError(validationError);
      return;
    }
    try {
      const result = await createMutation.mutateAsync(buildTokenPayload(createForm));
      setCreatedToken(result);
      setCreateDialogOpen(false);
      resetCreateForm();
      toast({
        title: 'Token created',
        description: `Admin token "${createForm.name.trim()}" has been created`,
      });
    } catch (err) {
      toast({
        title: 'Failed to create token',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteMutation.mutateAsync(deleteConfirm.id);
      toast({ title: 'Token deleted', variant: 'success' });
      setDeleteConfirm(null);
    } catch (err) {
      toast({
        title: 'Failed to delete token',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const handleBulkDelete = async () => {
    if (!bulkDelete) return;
    setBulkPending(true);
    const outcome = await runBulkDelete(bulkDelete.ids, (id) =>
      api
        .post(proxyPath(clusterId, `/v2/DeleteAdminToken?id=${encodeURIComponent(id)}`))
        .then(() => undefined),
    );
    setBulkPending(false);
    queryClient.invalidateQueries({ queryKey: ['adminTokens', clusterId] });
    bulkDelete.clear();
    setBulkDelete(null);

    if (outcome.failed.length === 0) {
      toast({
        title: `Deleted ${outcome.ok.length} token${outcome.ok.length === 1 ? '' : 's'}`,
        variant: 'success',
      });
    } else {
      toast({
        title:
          outcome.ok.length === 0
            ? `Couldn't delete ${outcome.failed.length} token${outcome.failed.length === 1 ? '' : 's'}`
            : `Deleted ${outcome.ok.length}, ${outcome.failed.length} failed`,
        description: `${outcome.failed[0].message}${outcome.failed.length > 1 ? ` (+${outcome.failed.length - 1} more)` : ''}`,
        variant: 'destructive',
      });
    }
  };

  const columns: ResourceListColumn<AdminTokenInfo>[] = [
    {
      id: 'name',
      header: 'Token Name',
      sortable: true,
      sortAccessor: (t) => t.name,
      mobileHidden: true, // becomes the mobile card title
      cell: (t) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{t.name}</span>
          {statusBadges(t)}
        </div>
      ),
    },
    {
      id: 'scope',
      header: 'Scope',
      cell: (t) => renderScopeSummary(t.scope),
    },
    {
      id: 'created',
      header: 'Created',
      sortable: true,
      sortAccessor: (t) => t.created ?? '',
      cellClassName: 'text-muted-foreground',
      cell: (t) => (t.created ? formatDateTime(t.created) : <EmptyValue />),
    },
    {
      id: 'expiration',
      header: 'Expires',
      sortable: true,
      sortAccessor: (t) => t.expiration ?? '',
      cellClassName: 'text-muted-foreground',
      cell: (t) => formatExpiration(t.expiration),
    },
  ];

  if (isLoading) {
    return <TableLoadingState label="Loading admin tokens..." />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load admin tokens</AlertTitle>
        <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="Admin Tokens"
        description="Scoped credentials for the Garage admin API. The secret is shown only once, at creation."
        actions={
          <Button className="flex-1 sm:flex-initial" onClick={() => setCreateDialogOpen(true)}>
            <AddActionIcon className="h-4 w-4" />
            Create Token
          </Button>
        }
      />

      <ResourceList
        items={tokens ?? []}
        getRowId={(t) => t.id ?? `name:${t.name}`}
        columns={columns}
        onRowClick={(t) => {
          if (t.id) navigate(`/clusters/${clusterId}/tokens/${t.id}`);
        }}
        getRowLabel={(t) => `Open admin token ${t.name}`}
        isRowInteractive={(t) => Boolean(t.id)}
        renderTitle={(t) => (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{t.name}</span>
            {statusBadges(t)}
          </div>
        )}
        defaultSort={{ columnId: 'created', direction: 'desc' }}
        search={{
          placeholder: 'Search by name or scope...',
          predicate: (t, q) =>
            t.name.toLowerCase().includes(q) || t.scope.some((s) => s.toLowerCase().includes(q)),
        }}
        filters={[
          {
            id: 'status',
            label: 'Status',
            options: [
              { value: 'active', label: 'Active', predicate: (t) => !t.expired },
              { value: 'expired', label: 'Expired', predicate: (t) => t.expired },
            ],
          },
        ]}
        selection={{
          isSelectable: (t) => Boolean(t.id) && !isCurrent(t),
          renderActions: (selected, clear) => (
            <Button
              variant="destructive"
              size="sm"
              onClick={() =>
                setBulkDelete({
                  ids: selected.map((t) => t.id).filter((id): id is string => Boolean(id)),
                  clear,
                })
              }
            >
              <DeleteActionIcon className="h-3.5 w-3.5" />
              Delete {selected.length}
            </Button>
          ),
        }}
        actions={(t) =>
          t.id && !isCurrent(t)
            ? [
                {
                  label: 'Delete',
                  icon: DeleteActionIcon,
                  destructive: true,
                  onSelect: () => setDeleteConfirm({ id: t.id!, name: t.name }),
                },
              ]
            : []
        }
        emptyState={{
          icon: TokenIcon,
          title: 'No admin tokens found',
          description: 'Create an admin token to grant scoped access to the cluster API.',
          action: (
            <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(true)}>
              <AddActionIcon className="h-4 w-4 mr-2" /> Create Token
            </Button>
          ),
        }}
      />

      {/* Create Token Dialog */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Admin Token</DialogTitle>
            <DialogDescription>
              Generates a scoped admin API token. The secret is shown once, right after you create
              it.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
            className="space-y-4"
          >
            <AdminTokenFormFields value={createForm} onChange={setCreateForm} />
            {createError && (
              <Alert variant="destructive">
                <AlertTitle>Cannot create token</AlertTitle>
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateDialogOpen(false);
                  resetCreateForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!createForm.name.trim() || createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Token'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Created Token Secret Dialog */}
      <Dialog open={!!createdToken} onOpenChange={(open) => !open && setCreatedToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Token Created Successfully</DialogTitle>
            <DialogDescription>
              Save this secret token now. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          {createdToken && (
            <div className="space-y-4 py-4">
              <SecretReveal label="Secret Token" value={createdToken.secretToken} hidden={false} />
              <div className="grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <div className="text-muted-foreground">Name</div>
                  <div className="font-medium">{createdToken.name}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Expires</div>
                  <div>{formatExpiration(createdToken.expiration)}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-muted-foreground">Scope</div>
                  <div>{renderScopeSummary(createdToken.scope)}</div>
                </div>
              </div>
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This is the only time the secret token will be displayed. Please save it securely.
                </AlertDescription>
              </Alert>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreatedToken(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Delete Admin Token"
        description={`Delete the token "${deleteConfirm?.name}"? This immediately revokes API access for anyone using it.`}
        tier="type-to-confirm"
        typeToConfirmValue={deleteConfirm?.name}
        confirmText="Delete Token"
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={!!bulkDelete}
        onOpenChange={(open) => !open && !bulkPending && setBulkDelete(null)}
        title={`Delete ${bulkDelete?.ids.length ?? 0} admin tokens`}
        description={`Permanently delete ${bulkDelete?.ids.length ?? 0} selected token(s)? This immediately revokes API access for anyone using them.`}
        tier="type-to-confirm"
        typeToConfirmValue={`DELETE${bulkDelete?.ids.length ?? 0}`}
        confirmText={`Delete ${bulkDelete?.ids.length ?? 0} tokens`}
        onConfirm={handleBulkDelete}
        isLoading={bulkPending}
      />
    </div>
  );
}
