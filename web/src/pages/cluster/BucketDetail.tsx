import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Globe, Key, Trash2, Plus, Settings, FileSearch, RefreshCw } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { useClusterContext } from '@/contexts/ClusterContext';
import {
  useBucketInfo,
  useUpdateBucket,
  useCleanupIncompleteUploads,
  useAddBucketAlias,
  useRemoveBucketAlias,
  useInspectObject,
} from '@/hooks/useBuckets';
import { useAllowBucketKey, useDenyBucketKey } from '@/hooks/usePermissions';
import { ConfirmDialog } from '@/components/cluster/ConfirmDialog';
import { JsonViewer } from '@/components/cluster/JsonViewer';
import { formatBytes } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';

export function BucketDetail() {
  const { bid } = useParams<{ bid: string }>();
  const { clusterId } = useClusterContext();

  const [aliasDialogOpen, setAliasDialogOpen] = useState(false);
  const [newAlias, setNewAlias] = useState('');
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupAge, setCleanupAge] = useState('86400');
  const [inspectKey, setInspectKey] = useState('');
  const [inspectDialogOpen, setInspectDialogOpen] = useState(false);
  const [quotasDialogOpen, setQuotasDialogOpen] = useState(false);
  const [maxObjects, setMaxObjects] = useState('');
  const [maxSize, setMaxSize] = useState('');
  const [removeAliasConfirm, setRemoveAliasConfirm] = useState<{
    alias: string;
    accessKeyId?: string;
  } | null>(null);

  const { data: bucket, isLoading, error } = useBucketInfo(clusterId, bid || '');
  const updateBucketMutation = useUpdateBucket(clusterId, bid || '');
  const cleanupMutation = useCleanupIncompleteUploads(clusterId, bid || '');
  const addAliasMutation = useAddBucketAlias(clusterId);
  const removeAliasMutation = useRemoveBucketAlias(clusterId);
  const inspectMutation = useInspectObject(clusterId, bid || '');
  const allowKeyMutation = useAllowBucketKey(clusterId);
  const denyKeyMutation = useDenyBucketKey(clusterId);

  if (!bid) {
    return <div className="p-4">Invalid bucket ID</div>;
  }

  if (isLoading) {
    return <div className="p-4">Loading bucket details...</div>;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load bucket</AlertTitle>
        <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
      </Alert>
    );
  }

  if (!bucket) {
    return <div className="p-4">Bucket not found</div>;
  }

  const handleAddAlias = async () => {
    try {
      await addAliasMutation.mutateAsync({ bucketId: bid, alias: newAlias.trim() });
      toast({ title: 'Alias added', description: `Added alias "${newAlias}"` });
      setAliasDialogOpen(false);
      setNewAlias('');
    } catch (err) {
      toast({
        title: 'Failed to add alias',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const handleRemoveAlias = async () => {
    if (!removeAliasConfirm) return;
    try {
      await removeAliasMutation.mutateAsync({
        bucketId: bid,
        alias: removeAliasConfirm.alias,
        accessKeyId: removeAliasConfirm.accessKeyId,
      });
      toast({ title: 'Alias removed', description: `Removed alias "${removeAliasConfirm.alias}"` });
      setRemoveAliasConfirm(null);
    } catch (err) {
      toast({
        title: 'Failed to remove alias',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const handleCleanup = async () => {
    try {
      const result = await cleanupMutation.mutateAsync({
        olderThanSecs: parseInt(cleanupAge, 10),
      });
      toast({
        title: 'Cleanup complete',
        description: `Deleted ${result.uploadsDeleted} uploads (${formatBytes(result.bytesDeleted)})`,
      });
      setCleanupDialogOpen(false);
    } catch (err) {
      toast({
        title: 'Cleanup failed',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const handleInspect = async () => {
    try {
      await inspectMutation.mutateAsync(inspectKey.trim());
      setInspectDialogOpen(true);
    } catch (err) {
      toast({
        title: 'Inspect failed',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const handleUpdateQuotas = async () => {
    try {
      await updateBucketMutation.mutateAsync({
        quotas: {
          maxObjects: maxObjects ? parseInt(maxObjects, 10) : null,
          maxSize: maxSize ? parseInt(maxSize, 10) * 1_000_000_000 : null,
        },
      });
      toast({ title: 'Quotas updated' });
      setQuotasDialogOpen(false);
    } catch (err) {
      toast({
        title: 'Failed to update quotas',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const handleTogglePermission = async (
    keyId: string,
    permission: 'read' | 'write' | 'owner',
    currentValue: boolean,
  ) => {
    const key = bucket.keys.find((k) => k.accessKeyId === keyId);
    if (!key) return;

    try {
      if (currentValue) {
        await denyKeyMutation.mutateAsync({
          bucketId: bid,
          accessKeyId: keyId,
          permissions: { read: false, write: false, owner: false, [permission]: true },
        });
      } else {
        await allowKeyMutation.mutateAsync({
          bucketId: bid,
          accessKeyId: keyId,
          permissions: { ...key.permissions, [permission]: true },
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
      <div className="flex items-center gap-4">
        <Link to={`/clusters/${clusterId}/buckets`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">
            {bucket.globalAliases[0] || bucket.id.slice(0, 12) + '...'}
          </h1>
          <p className="text-sm text-muted-foreground font-mono">{bucket.id}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Objects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bucket.objects.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Size</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(bucket.bytes)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Incomplete Uploads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bucket.unfinishedUploads}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Multipart Uploads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bucket.unfinishedMultipartUploads}</div>
            <div className="text-xs text-muted-foreground">
              {formatBytes(bucket.unfinishedMultipartUploadBytes)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Aliases Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Aliases
              </CardTitle>
              <CardDescription>Global and local bucket aliases</CardDescription>
            </div>
            <Button size="sm" onClick={() => setAliasDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Alias
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Global Aliases</h4>
              <div className="flex flex-wrap gap-2">
                {bucket.globalAliases.length > 0 ? (
                  bucket.globalAliases.map((alias) => (
                    <Badge key={alias} variant="secondary" className="gap-1">
                      {alias}
                      <button
                        onClick={() => setRemoveAliasConfirm({ alias })}
                        className="ml-1 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No global aliases</span>
                )}
              </div>
            </div>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-2">Local Aliases</h4>
              <div className="flex flex-wrap gap-2">
                {bucket.localAliases.length > 0 ? (
                  bucket.localAliases.map((la) => (
                    <Badge
                      key={`${la.accessKeyId}-${la.alias}`}
                      variant="outline"
                      className="gap-1"
                    >
                      {la.alias} ({la.accessKeyId.slice(0, 8)}...)
                      <button
                        onClick={() =>
                          setRemoveAliasConfirm({ alias: la.alias, accessKeyId: la.accessKeyId })
                        }
                        className="ml-1 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No local aliases</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Permissions Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Key Permissions
          </CardTitle>
          <CardDescription>Manage access key permissions for this bucket</CardDescription>
        </CardHeader>
        <CardContent>
          {bucket.keys.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Access Key</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-center">Read</TableHead>
                  <TableHead className="text-center">Write</TableHead>
                  <TableHead className="text-center">Owner</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bucket.keys.map((key) => (
                  <TableRow key={key.accessKeyId}>
                    <TableCell className="font-mono text-xs">
                      {key.accessKeyId.slice(0, 12)}...
                    </TableCell>
                    <TableCell>{key.name || '-'}</TableCell>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={key.permissions.read}
                        onChange={() =>
                          handleTogglePermission(key.accessKeyId, 'read', key.permissions.read)
                        }
                        className="h-4 w-4 cursor-pointer"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={key.permissions.write}
                        onChange={() =>
                          handleTogglePermission(key.accessKeyId, 'write', key.permissions.write)
                        }
                        className="h-4 w-4 cursor-pointer"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={key.permissions.owner}
                        onChange={() =>
                          handleTogglePermission(key.accessKeyId, 'owner', key.permissions.owner)
                        }
                        className="h-4 w-4 cursor-pointer"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No keys have access to this bucket</p>
          )}
        </CardContent>
      </Card>

      {/* Quotas Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Quotas
              </CardTitle>
              <CardDescription>Storage limits for this bucket</CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMaxObjects(bucket.quotas.maxObjects?.toString() || '');
                setMaxSize(
                  bucket.quotas.maxSize ? (bucket.quotas.maxSize / 1_000_000_000).toString() : '',
                );
                setQuotasDialogOpen(true);
              }}
            >
              Edit Quotas
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-sm text-muted-foreground">Max Objects</div>
              <div className="font-medium">
                {bucket.quotas.maxObjects?.toLocaleString() || 'Unlimited'}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Max Size</div>
              <div className="font-medium">
                {bucket.quotas.maxSize ? formatBytes(bucket.quotas.maxSize) : 'Unlimited'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Maintenance Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Maintenance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Cleanup Incomplete Uploads</h4>
              <p className="text-sm text-muted-foreground">
                Delete incomplete multipart uploads older than a specified age
              </p>
            </div>
            <Button variant="outline" onClick={() => setCleanupDialogOpen(true)}>
              Cleanup
            </Button>
          </div>
          <Separator />
          <div>
            <h4 className="font-medium mb-2">Inspect Object</h4>
            <div className="flex gap-2">
              <Input
                placeholder="Enter object key..."
                value={inspectKey}
                onChange={(e) => setInspectKey(e.target.value)}
              />
              <Button onClick={handleInspect} disabled={!inspectKey.trim()}>
                <FileSearch className="h-4 w-4 mr-2" />
                Inspect
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Alias Dialog */}
      <Dialog open={aliasDialogOpen} onOpenChange={setAliasDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Bucket Alias</DialogTitle>
            <DialogDescription>Add a new global alias for this bucket</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Alias Name</Label>
              <Input
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                placeholder="my-bucket-alias"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAliasDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddAlias} disabled={!newAlias.trim()}>
              Add Alias
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Alias Confirm */}
      <ConfirmDialog
        open={!!removeAliasConfirm}
        onOpenChange={(open) => !open && setRemoveAliasConfirm(null)}
        title="Remove Alias"
        description={`Are you sure you want to remove the alias "${removeAliasConfirm?.alias}"?`}
        onConfirm={handleRemoveAlias}
        isLoading={removeAliasMutation.isPending}
      />

      {/* Cleanup Dialog */}
      <Dialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cleanup Incomplete Uploads</DialogTitle>
            <DialogDescription>
              Delete incomplete multipart uploads older than the specified age
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Age Threshold (seconds)</Label>
              <Input
                type="number"
                value={cleanupAge}
                onChange={(e) => setCleanupAge(e.target.value)}
                placeholder="86400"
              />
              <p className="text-xs text-muted-foreground">
                Default: 86400 seconds (24 hours). Uploads older than this will be deleted.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCleanupDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCleanup} disabled={cleanupMutation.isPending}>
              {cleanupMutation.isPending ? 'Cleaning...' : 'Cleanup'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quotas Dialog */}
      <Dialog open={quotasDialogOpen} onOpenChange={setQuotasDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Quotas</DialogTitle>
            <DialogDescription>Set storage limits for this bucket</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Max Objects</Label>
              <Input
                type="number"
                value={maxObjects}
                onChange={(e) => setMaxObjects(e.target.value)}
                placeholder="Leave empty for unlimited"
              />
            </div>
            <div className="space-y-2">
              <Label>Max Size (GB)</Label>
              <Input
                type="number"
                value={maxSize}
                onChange={(e) => setMaxSize(e.target.value)}
                placeholder="Leave empty for unlimited"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuotasDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateQuotas} disabled={updateBucketMutation.isPending}>
              {updateBucketMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inspect Object Dialog */}
      <Dialog open={inspectDialogOpen} onOpenChange={setInspectDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Object Details</DialogTitle>
          </DialogHeader>
          {inspectMutation.data && <JsonViewer data={inspectMutation.data} />}
          <DialogFooter>
            <Button onClick={() => setInspectDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
