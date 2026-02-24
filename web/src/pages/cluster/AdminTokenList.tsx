import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useClusterContext } from '@/contexts/ClusterContext';
import {
  useAdminTokens,
  useCurrentAdminToken,
  useCreateAdminToken,
  useDeleteAdminToken,
} from '@/hooks/useAdminTokens';
import { ConfirmDialog } from '@/components/cluster/ConfirmDialog';
import { SecretReveal } from '@/components/cluster/SecretReveal';
import { ModulePageHeader } from '@/components/cluster/ModulePageHeader';
import { PageLoadingState } from '@/components/cluster/PageLoadingState';
import { AddActionIcon, DeleteActionIcon } from '@/lib/action-icons';
import { formatDateTime24h, formatShortId } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { TokenIcon } from '@/lib/entity-icons';
import { toast } from '@/hooks/use-toast';
import type { CreateAdminTokenResponse } from '@/types/garage';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function AdminTokenList() {
  const { clusterId } = useClusterContext();
  const navigate = useNavigate();

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
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredTokens = useMemo(() => {
    if (!tokens) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return tokens;
    return tokens.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.id && t.id.toLowerCase().includes(q)) ||
        t.scope.some((s) => s.toLowerCase().includes(q)),
    );
  }, [tokens, searchQuery]);

  const formatExpiration = (value?: string | null) => (value ? formatDateTime24h(value) : 'Never');

  const renderScopeSummary = (scope: string[]) => {
    if (scope.includes('*')) {
      return <span className="text-violet-700 font-medium">Full access (*)</span>;
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
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteMutation.mutateAsync(deleteConfirm.id);
      toast({ title: 'Token deleted' });
      setDeleteConfirm(null);
    } catch (err) {
      toast({
        title: 'Failed to delete token',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return <PageLoadingState label="Loading admin tokens..." />;
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
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <AddActionIcon className="h-4 w-4 mr-2" />
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
                <div>{formatDateTime24h(currentToken.created) || '-'}</div>
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

      {/* Token List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Admin Tokens</CardTitle>
              <CardDescription>Manage admin API tokens for this cluster</CardDescription>
            </div>
          </div>
          <div className="relative pt-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, ID, or scope..."
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredTokens.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTokens.map((token, index) => (
                  <TableRow
                    key={token.id || index}
                    className={token.id ? 'cursor-pointer hover:bg-muted/50' : ''}
                    onClick={() =>
                      token.id && navigate(`/clusters/${clusterId}/tokens/${token.id}`)
                    }
                  >
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{token.name}</span>
                        {token.expired ? (
                          <Badge variant="destructive" className="text-xs">
                            Expired
                          </Badge>
                        ) : (
                          <Badge variant="success" className="text-xs">
                            Active
                          </Badge>
                        )}
                        {currentToken?.id && currentToken.id === token.id && (
                          <Badge variant="secondary" className="text-xs">
                            Current
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        ID: {token.id ? formatShortId(token.id, 14) : 'Unavailable'}
                      </div>
                    </TableCell>
                    <TableCell>{renderScopeSummary(token.scope)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime24h(token.created) || '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatExpiration(token.expiration)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {token.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setDeleteConfirm({ id: token.id!, name: token.name })}
                          >
                            <DeleteActionIcon className="h-3.5 w-3.5 mr-1.5" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              {searchQuery ? 'No tokens match your search' : 'No admin tokens found'}
            </p>
          )}
        </CardContent>
      </Card>

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
                  placeholder="e.g.\nGetClusterStatus\nListBuckets"
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
    </div>
  );
}
