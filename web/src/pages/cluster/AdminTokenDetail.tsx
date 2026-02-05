import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Edit2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useClusterContext } from '@/contexts/ClusterContext';
import {
  useAdminTokenInfo,
  useCurrentAdminToken,
  useUpdateAdminToken,
  useDeleteAdminToken,
} from '@/hooks/useAdminTokens';
import { ConfirmDialog } from '@/components/cluster/ConfirmDialog';
import { JsonViewer } from '@/components/cluster/JsonViewer';
import { formatDateTime24h } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';

export function AdminTokenDetail() {
  const { tid } = useParams<{ tid: string }>();
  const { clusterId } = useClusterContext();
  const navigate = useNavigate();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: token, isLoading, error } = useAdminTokenInfo(clusterId, tid || '');
  const { data: currentToken } = useCurrentAdminToken(clusterId);
  const updateMutation = useUpdateAdminToken(clusterId, tid || '');
  const deleteMutation = useDeleteAdminToken(clusterId);

  if (!tid) {
    return <div className="p-4">Invalid token ID</div>;
  }

  if (isLoading) {
    return <div className="p-4">Loading token details...</div>;
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
    return <div className="p-4">Token not found</div>;
  }

  const handleUpdate = async () => {
    try {
      await updateMutation.mutateAsync({ name: newName.trim() });
      toast({ title: 'Token updated' });
      setEditDialogOpen(false);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to={`/clusters/${clusterId}/tokens`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{token.name}</h1>
              {isCurrent && <Badge variant="secondary">Current Token</Badge>}
            </div>
            {token.id && (
              <p className="text-sm text-muted-foreground">{token.id}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setNewName(token.name);
              setEditDialogOpen(true);
            }}
          >
            <Edit2 className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {isCurrent && (
        <Alert>
          <Shield className="h-4 w-4" />
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
            <Shield className="h-5 w-5" />
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
              <div>{formatDateTime24h(token.expiration) || 'Never'}</div>
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
          <JsonViewer data={token.scope} />
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Token</DialogTitle>
            <DialogDescription>Update the token name</DialogDescription>
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
