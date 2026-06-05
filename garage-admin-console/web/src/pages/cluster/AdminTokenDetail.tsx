import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
} from '@garage/ui';
import { useClusterContext } from '@/contexts/ClusterContext';
import {
  useAdminTokenInfo,
  useCurrentAdminToken,
  useUpdateAdminToken,
  useDeleteAdminToken,
} from '@/hooks/useAdminTokens';
import { ConfirmDialog } from '@garage/ui';
import { DetailPageHeader } from '@/components/cluster/DetailPageHeader';
import { AdminTokenFormFields } from '@/components/cluster/AdminTokenFormFields';
import {
  EMPTY_TOKEN_FORM,
  tokenFormFromInfo,
  validateTokenForm,
  buildTokenPayload,
  type AdminTokenFormState,
} from '@/components/cluster/admin-token-form';
import { PageLoadingState } from '@garage/ui';
import { DeleteActionIcon, EditActionIcon } from '@/lib/action-icons';
import { TokenIcon } from '@/lib/entity-icons';
import { formatDateTime, getApiErrorMessage } from '@garage/web-shared';
import { toast } from '@garage/ui';

export function AdminTokenDetail() {
  const { tid } = useParams<{ tid: string }>();
  const { clusterId } = useClusterContext();
  const navigate = useNavigate();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<AdminTokenFormState>(EMPTY_TOKEN_FORM);
  const [editError, setEditError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: token, isLoading, error } = useAdminTokenInfo(clusterId, tid || '');
  const { data: currentToken } = useCurrentAdminToken(clusterId);
  const updateMutation = useUpdateAdminToken(clusterId, tid || '');
  const deleteMutation = useDeleteAdminToken(clusterId);

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

  const handleUpdate = async () => {
    const validationError = validateTokenForm(editForm);
    if (validationError) {
      setEditError(validationError);
      return;
    }
    try {
      await updateMutation.mutateAsync(buildTokenPayload(editForm));
      toast({ title: 'Token updated', variant: 'success' });
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
      toast({ title: 'Token deleted', variant: 'success' });
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
    <div className="space-y-4">
      <DetailPageHeader
        breadcrumbs={[
          { label: 'Admin Tokens', to: `/clusters/${clusterId}/tokens` },
          { label: token.name },
        ]}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-initial"
              onClick={() => {
                setEditForm(tokenFormFromInfo(token));
                setEditError('');
                setEditDialogOpen(true);
              }}
            >
              <EditActionIcon className="h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 sm:flex-initial"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <DeleteActionIcon className="h-4 w-4" />
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
              <div>{formatDateTime(token.created)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Expires</div>
              <div className="flex flex-wrap items-center gap-2">
                <span>{token.expiration ? formatDateTime(token.expiration) : 'Never'}</span>
                {token.expired ? (
                  <Badge variant="destructive">Expired</Badge>
                ) : (
                  <Badge variant="success">Active</Badge>
                )}
              </div>
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
            <AdminTokenFormFields value={editForm} onChange={setEditForm} />
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
