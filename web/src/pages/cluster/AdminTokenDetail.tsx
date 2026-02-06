import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useClusterContext } from '@/contexts/ClusterContext';
import {
  useAdminTokenInfo,
  useCurrentAdminToken,
  useUpdateAdminToken,
  useDeleteAdminToken,
} from '@/hooks/useAdminTokens';
import { ConfirmDialog } from '@/components/cluster/ConfirmDialog';
import { DetailPageHeader } from '@/components/cluster/DetailPageHeader';
import { PageLoadingState } from '@/components/cluster/PageLoadingState';
import { DeleteActionIcon, EditActionIcon } from '@/lib/action-icons';
import { TokenIcon } from '@/lib/entity-icons';
import { formatDateTime24h } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function AdminTokenDetail() {
  const { tid } = useParams<{ tid: string }>();
  const { clusterId } = useClusterContext();
  const navigate = useNavigate();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [editScopeMode, setEditScopeMode] = useState<'full' | 'custom'>('custom');
  const [editScopeInput, setEditScopeInput] = useState('');
  const [editNeverExpires, setEditNeverExpires] = useState(false);
  const [editExpirationDate, setEditExpirationDate] = useState('');
  const [editExpirationHour, setEditExpirationHour] = useState('00');
  const [editExpirationMinute, setEditExpirationMinute] = useState('00');
  const [editError, setEditError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: token, isLoading, error } = useAdminTokenInfo(clusterId, tid || '');
  const { data: currentToken } = useCurrentAdminToken(clusterId);
  const updateMutation = useUpdateAdminToken(clusterId, tid || '');
  const deleteMutation = useDeleteAdminToken(clusterId);

  const parseScopeInput = (value: string) =>
    value
      .split(/[,\n]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

  const toDateParts = (value?: string | null) => {
    if (!value) {
      return { date: '', hour: '00', minute: '00' };
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return { date: '', hour: '00', minute: '00' };
    }
    const pad = (num: number) => String(num).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return { date: `${year}-${month}-${day}`, hour: hours, minute: minutes };
  };

  if (!tid) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Invalid token ID</AlertTitle>
        <AlertDescription>The requested admin token identifier is missing.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return <PageLoadingState label="Loading token details..." />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load token</AlertTitle>
        <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
      </Alert>
    );
  }

  if (!token) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Token not found</AlertTitle>
        <AlertDescription>The token may have been revoked or is unavailable.</AlertDescription>
      </Alert>
    );
  }

  const editScope = editScopeMode === 'full' ? ['*'] : parseScopeInput(editScopeInput);
  const editScopeWarning =
    editScopeMode === 'full' ||
    editScope.some(
      (scope) => scope === '*' || scope === 'CreateAdminToken' || scope === 'UpdateAdminToken',
    );

  const editExpirationDateValue = editExpirationDate
    ? new Date(`${editExpirationDate}T${editExpirationHour}:${editExpirationMinute}:00`)
    : null;
  const editExpirationIso =
    editExpirationDateValue && !Number.isNaN(editExpirationDateValue.getTime())
      ? editExpirationDateValue.toISOString()
      : null;
  const editExpirationInvalid = Boolean(editExpirationDate) && !editExpirationIso;

  const handleUpdate = async () => {
    if (!newName.trim()) {
      setEditError('Token name is required.');
      return;
    }
    if (editScopeMode === 'custom' && editScope.length === 0) {
      setEditError('Provide at least one scope entry or select full access.');
      return;
    }
    if (editExpirationInvalid) {
      setEditError('Expiration date/time is invalid.');
      return;
    }
    if (!editNeverExpires && !editExpirationIso) {
      setEditError('Set an expiration date/time or enable never expires.');
      return;
    }

    try {
      const payload = {
        name: newName.trim(),
        scope: editScopeMode === 'full' ? ['*'] : editScope,
        ...(editNeverExpires
          ? { neverExpires: true, expiration: null }
          : editExpirationIso
            ? { expiration: editExpirationIso }
            : {}),
      };
      await updateMutation.mutateAsync(payload);
      toast({ title: 'Token updated' });
      setEditDialogOpen(false);
      setEditError('');
    } catch (err) {
      toast({
        title: 'Failed to update token',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(tid);
      toast({ title: 'Token deleted' });
      navigate(`/clusters/${clusterId}/tokens`);
    } catch (err) {
      toast({
        title: 'Failed to delete token',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const isCurrent = currentToken?.id === tid;
  const hasPrivilegedScope =
    token.scope.includes('CreateAdminToken') || token.scope.includes('UpdateAdminToken');

  return (
    <div className="space-y-6">
      <DetailPageHeader
        backTo={`/clusters/${clusterId}/tokens`}
        title={token.name}
        subtitle={token.id}
        badges={
          <>
            {isCurrent && <Badge variant="secondary">Current Token</Badge>}
            {token.expired ? (
              <Badge variant="destructive">Expired</Badge>
            ) : (
              <Badge variant="success">Active</Badge>
            )}
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const parts = toDateParts(token.expiration);
                const isFullScope = token.scope.includes('*');
                setNewName(token.name);
                setEditScopeMode(isFullScope ? 'full' : 'custom');
                setEditScopeInput(isFullScope ? '' : token.scope.join('\n'));
                setEditNeverExpires(!token.expiration);
                setEditExpirationDate(parts.date);
                setEditExpirationHour(parts.hour);
                setEditExpirationMinute(parts.minute);
                setEditError('');
                setEditDialogOpen(true);
              }}
            >
              <EditActionIcon className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
              <DeleteActionIcon className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </>
        }
      />

      {isCurrent && (
        <Alert>
          <TokenIcon className="h-4 w-4" />
          <AlertTitle>Current Token</AlertTitle>
          <AlertDescription>
            This is the token currently being used for this connection. Deleting it will revoke your
            access.
          </AlertDescription>
        </Alert>
      )}

      {/* Token Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TokenIcon className="h-5 w-5" />
            Token Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-sm text-muted-foreground">Name</div>
              <div className="font-medium">{token.name}</div>
            </div>
            {token.id && (
              <div>
                <div className="text-sm text-muted-foreground">Token ID</div>
                <div className="text-sm">{token.id}</div>
              </div>
            )}
            <div>
              <div className="text-sm text-muted-foreground">Created</div>
              <div>{formatDateTime24h(token.created) || '-'}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Expires</div>
              <div>{token.expiration ? formatDateTime24h(token.expiration) : 'Never'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scope */}
      <Card>
        <CardHeader>
          <CardTitle>Scope & Permissions</CardTitle>
          <CardDescription>Permissions granted to this token</CardDescription>
        </CardHeader>
        <CardContent>
          {token.scope.includes('*') ? (
            <div className="space-y-3">
              <Badge variant="warning">Full access (*)</Badge>
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>High privilege scope</AlertTitle>
                <AlertDescription>
                  This token can call all admin endpoints, including token management. Use with
                  care.
                </AlertDescription>
              </Alert>
            </div>
          ) : token.scope.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {token.scope.map((entry) => (
                  <Badge key={entry} variant="secondary">
                    {entry}
                  </Badge>
                ))}
              </div>
              {hasPrivilegedScope && (
                <Alert variant="warning">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>High privilege scope</AlertTitle>
                  <AlertDescription>
                    This token can create or update admin tokens. Treat it as highly privileged.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No scope assigned.</div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditError('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Token</DialogTitle>
            <DialogDescription>Update name, scope, and expiration settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Token Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="my-admin-token"
              />
            </div>
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select
                value={editScopeMode}
                onValueChange={(value) => setEditScopeMode(value as 'full' | 'custom')}
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
            {editScopeMode === 'custom' && (
              <div className="space-y-2">
                <Label>Allowed endpoints (one per line)</Label>
                <Textarea
                  className="min-h-[120px] resize-y text-xs"
                  placeholder="e.g.\nGetClusterStatus\nListBuckets"
                  value={editScopeInput}
                  onChange={(e) => setEditScopeInput(e.target.value)}
                />
              </div>
            )}
            {editScopeWarning && (
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
                  value={editExpirationDate}
                  onChange={(e) => setEditExpirationDate(e.target.value)}
                  disabled={editNeverExpires}
                />
                <Select
                  value={editExpirationHour}
                  onValueChange={setEditExpirationHour}
                  disabled={editNeverExpires}
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
                  value={editExpirationMinute}
                  onValueChange={setEditExpirationMinute}
                  disabled={editNeverExpires}
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
                <Checkbox checked={editNeverExpires} onCheckedChange={setEditNeverExpires} />
                Never expires
              </label>
              {editExpirationInvalid && !editNeverExpires && (
                <div className="text-xs text-destructive">Expiration date/time is invalid.</div>
              )}
            </div>
            {editError && (
              <Alert variant="destructive">
                <AlertTitle>Cannot update token</AlertTitle>
                <AlertDescription>{editError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Admin Token"
        description={`Are you sure you want to delete the token "${token.name}"? This will immediately revoke API access for anyone using this token.`}
        tier="type-to-confirm"
        typeToConfirmValue={token.name}
        confirmText="Delete Token"
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
