import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Badge,
  Checkbox,
  Input,
  Label,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
} from '@garage/ui';
import { api, proxyPath } from '@/lib/api';
import { useClusterContext } from '@/contexts/ClusterContext';
import {
  useAdminTokens,
  useCurrentAdminToken,
  useCreateAdminToken,
  useDeleteAdminToken,
} from '@/hooks/useAdminTokens';
import { ConfirmDialog } from '@garage/ui';
import { SecretReveal } from '@/components/cluster/SecretReveal';
import { ModulePageHeader } from '@garage/ui';
import { TableLoadingState } from '@/components/cluster/TableLoadingState';
import { AddActionIcon, DeleteActionIcon } from '@/lib/action-icons';
import { formatDateTime, formatShortId, getApiErrorMessage } from '@garage/web-shared';
import { TokenIcon } from '@/lib/entity-icons';
import { toast } from '@garage/ui';
import { runBulkDelete } from '@/lib/bulk-delete';
import type { AdminTokenInfo, CreateAdminTokenResponse } from '@/types/garage';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

function renderScopeSummary(scope: string[]) {
  if (scope.includes('*')) {
    return <span className="text-warning font-medium">Full access (*)</span>;
  }
  if (scope.length === 0) {
    return <span className="text-muted-foreground">No scope</span>;
  }
  const preview = scope.slice(0, 3).join(', ');
  const suffix = scope.length > 3 ? ` +${scope.length - 3} more` : '';
  return (
    <span className="text-xs font-mono text-foreground">
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
  const [newTokenName, setNewTokenName] = useState('');
  const [createScopeMode, setCreateScopeMode] = useState<'full' | 'custom'>('full');
  const [createScopeInput, setCreateScopeInput] = useState('');
  const [createNeverExpires, setCreateNeverExpires] = useState(true);
  const [createExpirationDate, setCreateExpirationDate] = useState('');
  const [createExpirationHour, setCreateExpirationHour] = useState('00');
  const [createExpirationMinute, setCreateExpirationMinute] = useState('00');
  const [createError, setCreateError] = useState('');
  const [createdToken, setCreatedToken] = useState<CreateAdminTokenResponse | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [bulkDelete, setBulkDelete] = useState<{ ids: string[]; clear: () => void } | null>(null);
  const [bulkPending, setBulkPending] = useState(false);

  const { data: tokens, isLoading, error } = useAdminTokens(clusterId);
  const { data: currentToken } = useCurrentAdminToken(clusterId);
  const createMutation = useCreateAdminToken(clusterId);
  const deleteMutation = useDeleteAdminToken(clusterId);

  const parseScopeInput = (value: string) =>
    value
      .split(/[,\n]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

  const resetCreateForm = () => {
    setNewTokenName('');
    setCreateScopeMode('full');
    setCreateScopeInput('');
    setCreateNeverExpires(true);
    setCreateExpirationDate('');
    setCreateExpirationHour('00');
    setCreateExpirationMinute('00');
    setCreateError('');
  };

  const createScope = createScopeMode === 'full' ? ['*'] : parseScopeInput(createScopeInput);
  const createScopeWarning =
    createScopeMode === 'full' ||
    createScope.some(
      (scope) => scope === '*' || scope === 'CreateAdminToken' || scope === 'UpdateAdminToken',
    );

  const expirationDate = createExpirationDate
    ? new Date(`${createExpirationDate}T${createExpirationHour}:${createExpirationMinute}:00`)
    : null;
  const expirationIso =
    expirationDate && !Number.isNaN(expirationDate.getTime()) ? expirationDate.toISOString() : null;
  const expirationInvalid = Boolean(createExpirationDate) && !expirationIso;

  const handleCreate = async () => {
    if (!newTokenName.trim()) {
      setCreateError('Token name is required.');
      return;
    }
    if (createScopeMode === 'custom' && createScope.length === 0) {
      setCreateError('Provide at least one scope entry or select full access.');
      return;
    }
    if (expirationInvalid) {
      setCreateError('Expiration date/time is invalid.');
      return;
    }
    if (!createNeverExpires && !expirationIso) {
      setCreateError('Set an expiration date/time or enable never expires.');
      return;
    }

    try {
      const payload = {
        name: newTokenName.trim(),
        scope: createScopeMode === 'full' ? ['*'] : createScope,
        ...(createNeverExpires
          ? { neverExpires: true, expiration: null }
          : expirationIso
            ? { expiration: expirationIso }
            : {}),
      };
      const result = await createMutation.mutateAsync(payload);
      setCreatedToken(result);
      setCreateDialogOpen(false);
      resetCreateForm();
      toast({
        title: 'Token created',
        description: `Admin token "${newTokenName}" has been created`,
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
      id: 'token',
      header: 'Token',
      sortable: true,
      sortAccessor: (t) => t.name,
      mobileHidden: true,
      cell: (t) => (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{t.name}</span>
            {t.expired ? (
              <Badge variant="destructive" className="text-xs">
                Expired
              </Badge>
            ) : (
              <Badge variant="success" className="text-xs">
                Active
              </Badge>
            )}
            {currentToken?.id && currentToken.id === t.id && (
              <Badge variant="secondary" className="text-xs">
                Current
              </Badge>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <span>ID:</span>
            {t.id ? (
              <CopyValue value={t.id} label="Token ID" className="max-w-[22ch]">
                {t.id}
              </CopyValue>
            ) : (
              <EmptyValue label="Unavailable" className="text-xs" />
            )}
          </div>
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
        description="Manage cluster admin tokens and inspect their scopes from a single control plane."
        actions={
          <Button onClick={() => setCreateDialogOpen(true)}>
            <AddActionIcon className="h-4 w-4" />
            Create Token
          </Button>
        }
      />

      {/* Warning Banner */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Admin Token Management</AlertTitle>
        <AlertDescription>
          Admin tokens provide full access to the Garage cluster API. Create and manage tokens
          carefully. Tokens can only be viewed once when created.
        </AlertDescription>
      </Alert>

      {/* Current Token Info */}
      {currentToken && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TokenIcon className="h-5 w-5 text-primary" />
              Current Token
            </CardTitle>
            <CardDescription>The token being used for this connection</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Current</Badge>
              {currentToken.expired ? (
                <Badge variant="destructive">Expired</Badge>
              ) : (
                <Badge variant="success">Active</Badge>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <div className="text-sm text-muted-foreground">Name</div>
                <div className="font-medium">{currentToken.name}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Token ID</div>
                <div className="text-xs">
                  {currentToken.id ? formatShortId(currentToken.id, 14) : 'Unavailable'}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Created</div>
                <div>{formatDateTime(currentToken.created)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Expires</div>
                <div>{formatExpiration(currentToken.expiration)}</div>
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-2">Scope</div>
              {renderScopeSummary(currentToken.scope)}
            </div>
            {currentToken.id && (
              <Button
                variant="outline"
                onClick={() => navigate(`/clusters/${clusterId}/tokens/${currentToken.id}`)}
              >
                View Details
              </Button>
            )}
          </CardContent>
        </Card>
      )}

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
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{t.name}</span>
              {t.expired ? (
                <Badge variant="destructive" className="text-xs">
                  Expired
                </Badge>
              ) : (
                <Badge variant="success" className="text-xs">
                  Active
                </Badge>
              )}
              {currentToken?.id && currentToken.id === t.id && (
                <Badge variant="secondary" className="text-xs">
                  Current
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
              <span>ID:</span>
              {t.id ? (
                <CopyValue value={t.id} label="Token ID" className="max-w-[22ch]">
                  {t.id}
                </CopyValue>
              ) : (
                <EmptyValue label="Unavailable" className="text-xs" />
              )}
            </div>
          </div>
        )}
        search={{
          placeholder: 'Search by name, ID, or scope...',
          predicate: (t, q) =>
            t.name.toLowerCase().includes(q) ||
            Boolean(t.id && t.id.toLowerCase().includes(q)) ||
            t.scope.some((s) => s.toLowerCase().includes(q)),
        }}
        selection={{
          isSelectable: (t) => Boolean(t.id),
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
          t.id
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
              Create a new admin API token. The secret will only be shown once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Token Name</Label>
              <Input
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                placeholder="my-admin-token"
              />
            </div>
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select
                value={createScopeMode}
                onValueChange={(value) => setCreateScopeMode(value as 'full' | 'custom')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full access (*)</SelectItem>
                  <SelectItem value="custom">Custom scope</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createScopeMode === 'custom' && (
              <div className="space-y-2">
                <Label>Allowed endpoints (one per line)</Label>
                <Textarea
                  className="min-h-[120px] resize-y text-xs"
                  placeholder="e.g. GetClusterStatus, ListBuckets"
                  value={createScopeInput}
                  onChange={(e) => setCreateScopeInput(e.target.value)}
                />
              </div>
            )}
            {createScopeWarning && (
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>High privilege scope</AlertTitle>
                <AlertDescription>
                  Granting full access or `CreateAdminToken`/`UpdateAdminToken` effectively allows
                  privilege escalation. Ensure this is intended.
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label>Expiration</Label>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
                <Input
                  type="date"
                  value={createExpirationDate}
                  onChange={(e) => setCreateExpirationDate(e.target.value)}
                  disabled={createNeverExpires}
                />
                <Select
                  value={createExpirationHour}
                  onValueChange={setCreateExpirationHour}
                  disabled={createNeverExpires}
                >
                  <SelectTrigger className="w-[90px]">
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
                <Select
                  value={createExpirationMinute}
                  onValueChange={setCreateExpirationMinute}
                  disabled={createNeverExpires}
                >
                  <SelectTrigger className="w-[90px]">
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
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={createNeverExpires} onCheckedChange={setCreateNeverExpires} />
                Never expires
              </label>
              {expirationInvalid && !createNeverExpires && (
                <div className="text-xs text-destructive">Expiration date/time is invalid.</div>
              )}
            </div>
            {createError && (
              <Alert variant="destructive">
                <AlertTitle>Cannot create token</AlertTitle>
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newTokenName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Token'}
            </Button>
          </DialogFooter>
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
              <div className="grid gap-3 md:grid-cols-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Name</div>
                  <div className="font-medium">{createdToken.name}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Token ID</div>
                  <div className="text-xs">{createdToken.id ? createdToken.id : 'Unavailable'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Expires</div>
                  <div>{formatExpiration(createdToken.expiration)}</div>
                </div>
                <div>
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
        description={`Are you sure you want to delete the token "${deleteConfirm?.name}"? This will immediately revoke API access for anyone using this token.`}
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
        tier="danger"
        confirmText={`Delete ${bulkDelete?.ids.length ?? 0} tokens`}
        onConfirm={handleBulkDelete}
        isLoading={bulkPending}
      />
    </div>
  );
}
