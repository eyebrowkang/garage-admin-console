import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Shield, ChevronRight, AlertTriangle } from 'lucide-react';
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
import { formatDateTime } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import type { CreateAdminTokenResponse } from '@/types/garage';

export function AdminTokenList() {
  const { clusterId } = useClusterContext();
  const navigate = useNavigate();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [createdToken, setCreatedToken] = useState<CreateAdminTokenResponse | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  const { data: tokens, isLoading, error } = useAdminTokens(clusterId);
  const { data: currentToken } = useCurrentAdminToken(clusterId);
  const createMutation = useCreateAdminToken(clusterId);
  const deleteMutation = useDeleteAdminToken(clusterId);

  const handleCreate = async () => {
    try {
      const result = await createMutation.mutateAsync({ name: newTokenName.trim() });
      setCreatedToken(result);
      setCreateDialogOpen(false);
      setNewTokenName('');
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
    return <div className="p-4">Loading admin tokens...</div>;
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
              <Shield className="h-5 w-5 text-primary" />
              Current Token
            </CardTitle>
            <CardDescription>The token being used for this connection</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-sm text-muted-foreground">Name</div>
                <div className="font-medium">{currentToken.name}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Created</div>
                <div>{formatDateTime(currentToken.created)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Expires</div>
                <div>{formatDateTime(currentToken.expiration) || 'Never'}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Token List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Admin Tokens</CardTitle>
              <CardDescription>Manage admin API tokens for this cluster</CardDescription>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Token
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {tokens && tokens.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token, index) => (
                  <TableRow
                    key={token.id || index}
                    className={token.id ? 'cursor-pointer hover:bg-muted/50' : ''}
                    onClick={() => token.id && navigate(`/clusters/${clusterId}/tokens/${token.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{token.name}</span>
                        {currentToken?.id && currentToken.id === token.id && (
                          <Badge variant="secondary" className="text-xs">
                            Current
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(token.created) || '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(token.expiration) || 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {token.id && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() =>
                                setDeleteConfirm({ id: token.id!, name: token.name })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon">
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No admin tokens found</p>
          )}
        </CardContent>
      </Card>

      {/* Create Token Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
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
