import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Key, Database, Trash2, Edit2, Eye } from 'lucide-react';
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
import { useKeyInfo, useUpdateKey, useDeleteKey } from '@/hooks/useKeys';
import { useAllowBucketKey, useDenyBucketKey } from '@/hooks/usePermissions';
import { ConfirmDialog } from '@/components/cluster/ConfirmDialog';
import { SecretReveal } from '@/components/cluster/SecretReveal';
import { formatDateTime } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';

export function KeyDetail() {
  const { kid } = useParams<{ kid: string }>();
  const { clusterId } = useClusterContext();
  const navigate = useNavigate();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const { data: keyInfo, isLoading, error, refetch } = useKeyInfo(clusterId, kid || '', showSecret);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [secretLoading, setSecretLoading] = useState(false);

  const handleRevealSecret = async () => {
    setShowSecret(true);
    setSecretLoading(true);
    try {
      const result = await refetch();
      if (result.data?.secretAccessKey) {
        setSecretKey(result.data.secretAccessKey);
      }
    } finally {
      setSecretLoading(false);
    }
  };
  const updateKeyMutation = useUpdateKey(clusterId, kid || '');
  const deleteKeyMutation = useDeleteKey(clusterId);
  const allowKeyMutation = useAllowBucketKey(clusterId);
  const denyKeyMutation = useDenyBucketKey(clusterId);

  if (!kid) {
    return <div className="p-4">Invalid key ID</div>;
  }

  if (isLoading) {
    return <div className="p-4">Loading key details...</div>;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load key</AlertTitle>
        <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
      </Alert>
    );
  }

  if (!keyInfo) {
    return <div className="p-4">Key not found</div>;
  }

  const handleUpdateName = async () => {
    try {
      await updateKeyMutation.mutateAsync(newName.trim());
      toast({ title: 'Key updated', description: 'Key name has been updated' });
      setEditDialogOpen(false);
    } catch (err) {
      toast({
        title: 'Failed to update key',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteKeyMutation.mutateAsync(kid);
      toast({ title: 'Key deleted' });
      navigate(`/clusters/${clusterId}/keys`);
    } catch (err) {
      toast({
        title: 'Failed to delete key',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const handleTogglePermission = async (
    bucketId: string,
    permission: 'read' | 'write' | 'owner',
    currentValue: boolean,
    currentPerms: { read: boolean; write: boolean; owner: boolean },
  ) => {
    try {
      if (currentValue) {
        await denyKeyMutation.mutateAsync({
          bucketId,
          accessKeyId: kid,
          permissions: { read: false, write: false, owner: false, [permission]: true },
        });
      } else {
        await allowKeyMutation.mutateAsync({
          bucketId,
          accessKeyId: kid,
          permissions: { ...currentPerms, [permission]: true },
        });
      }
      toast({ title: 'Permission updated' });
    } catch (err) {
      toast({
        title: 'Failed to update permission',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to={`/clusters/${clusterId}/keys`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{keyInfo.name || 'Unnamed Key'}</h1>
              {keyInfo.expired ? (
                <Badge variant="destructive">Expired</Badge>
              ) : (
                <Badge variant="success">Active</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{keyInfo.accessKeyId}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setNewName(keyInfo.name);
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

      {/* Key Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Key Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-sm text-muted-foreground">Access Key ID</div>
              <div>{keyInfo.accessKeyId}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Name</div>
              <div className="font-medium">{keyInfo.name || '-'}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Created</div>
              <div>{formatDateTime(keyInfo.created)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Expiration</div>
              <div>{formatDateTime(keyInfo.expiration) || 'Never'}</div>
            </div>
          </div>

          {/* Secret Key Section */}
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between mb-2">
              <Label>Secret Access Key</Label>
              {!secretKey && !secretLoading && (
                <Button variant="outline" size="sm" onClick={handleRevealSecret}>
                  <Eye className="h-4 w-4 mr-2" />
                  Reveal Secret
                </Button>
              )}
            </div>
            {secretLoading ? (
              <div className="text-sm text-muted-foreground">Loading secret...</div>
            ) : secretKey ? (
              <SecretReveal label="Secret Access Key" value={secretKey} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Click "Reveal Secret" to show the secret access key. This will make a secure request
                to the cluster.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bucket Permissions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Bucket Permissions
          </CardTitle>
          <CardDescription>Buckets this key has access to</CardDescription>
        </CardHeader>
        <CardContent>
          {keyInfo.buckets && keyInfo.buckets.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bucket</TableHead>
                  <TableHead>Aliases</TableHead>
                  <TableHead className="text-center">Read</TableHead>
                  <TableHead className="text-center">Write</TableHead>
                  <TableHead className="text-center">Owner</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keyInfo.buckets.map((bucket) => (
                  <TableRow key={bucket.id}>
                    <TableCell className="text-xs">{bucket.id.slice(0, 12)}...</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {bucket.globalAliases.map((alias) => (
                          <Badge key={alias} variant="secondary" className="text-xs">
                            {alias}
                          </Badge>
                        ))}
                        {bucket.localAliases.map((alias) => (
                          <Badge key={alias} variant="outline" className="text-xs">
                            {alias}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={bucket.permissions.read}
                        onChange={() =>
                          handleTogglePermission(
                            bucket.id,
                            'read',
                            bucket.permissions.read,
                            bucket.permissions,
                          )
                        }
                        className="h-4 w-4 cursor-pointer"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={bucket.permissions.write}
                        onChange={() =>
                          handleTogglePermission(
                            bucket.id,
                            'write',
                            bucket.permissions.write,
                            bucket.permissions,
                          )
                        }
                        className="h-4 w-4 cursor-pointer"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={bucket.permissions.owner}
                        onChange={() =>
                          handleTogglePermission(
                            bucket.id,
                            'owner',
                            bucket.permissions.owner,
                            bucket.permissions,
                          )
                        }
                        className="h-4 w-4 cursor-pointer"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">This key has no bucket permissions</p>
          )}
        </CardContent>
      </Card>

      {/* Edit Name Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Key Name</DialogTitle>
            <DialogDescription>Update the display name for this access key</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Key Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="my-app-key"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateName} disabled={updateKeyMutation.isPending}>
              {updateKeyMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Access Key"
        description={`Are you sure you want to delete this access key? This will revoke all bucket permissions and cannot be undone.`}
        tier="danger"
        confirmText="Delete Key"
        onConfirm={handleDelete}
        isLoading={deleteKeyMutation.isPending}
      />
    </div>
  );
}
