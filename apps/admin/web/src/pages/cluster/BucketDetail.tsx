import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Globe, Tags, Settings, RefreshCw, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  useBucketInfo,
  useUpdateBucket,
  useCleanupIncompleteUploads,
  useAddBucketAlias,
  useRemoveBucketAlias,
  useInspectObject,
} from '@/hooks/useBuckets';
import { useAllowBucketKey, useDenyBucketKey } from '@/hooks/usePermissions';
import { ConfirmDialog } from '@/components/cluster/ConfirmDialog';
import { CopyButton } from '@/components/cluster/CopyButton';
import { DetailPageHeader } from '@/components/cluster/DetailPageHeader';
import { JsonViewer } from '@/components/cluster/JsonViewer';
import { PageLoadingState } from '@/components/cluster/PageLoadingState';
import { DeleteActionIcon } from '@/lib/action-icons';
import { KeyIcon } from '@/lib/entity-icons';
import { formatBytes, formatShortId } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';

export function BucketDetail() {
  const { bid } = useParams<{ bid: string }>();
  const { clusterId } = useClusterContext();

  const [aliasDialogOpen, setAliasDialogOpen] = useState(false);
  const [aliasType, setAliasType] = useState<'global' | 'local'>('global');
  const [newAlias, setNewAlias] = useState('');
  const [aliasAccessKeyId, setAliasAccessKeyId] = useState('');
  const [websiteDialogOpen, setWebsiteDialogOpen] = useState(false);
  const [websiteEnabled, setWebsiteEnabled] = useState(false);
  const [websiteIndex, setWebsiteIndex] = useState('');
  const [websiteError, setWebsiteError] = useState('');
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
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [permKey, setPermKey] = useState<{
    accessKeyId: string;
    name: string;
    read: boolean;
    write: boolean;
    owner: boolean;
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
    return (
      <Alert variant="destructive">
        <AlertTitle>Invalid bucket ID</AlertTitle>
        <AlertDescription>The requested bucket identifier is missing.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return <PageLoadingState label="Loading bucket details..." />;
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
    return (
      <Alert variant="destructive">
        <AlertTitle>Bucket not found</AlertTitle>
        <AlertDescription>The bucket may have been deleted or is unavailable.</AlertDescription>
      </Alert>
    );
  }

  const localAliases = bucket.keys.flatMap((key) =>
    (key.bucketLocalAliases ?? []).map((alias) => ({
      alias,
      accessKeyId: key.accessKeyId,
      keyName: key.name,
    })),
  );
  const aliasDescription =
    aliasType === 'local'
      ? 'Add a local alias tied to a specific access key.'
      : 'Add a global alias for this bucket.';
  const canAddAlias =
    Boolean(newAlias.trim()) && (aliasType === 'global' || Boolean(aliasAccessKeyId));

  const handleUpdateWebsiteAccess = async () => {
    try {
      const indexDocument = websiteIndex.trim();
      const errorDocument = websiteError.trim();
      await updateBucketMutation.mutateAsync({
        websiteAccess: {
          enabled: websiteEnabled,
          indexDocument: websiteEnabled && indexDocument ? indexDocument : null,
          errorDocument: websiteEnabled && errorDocument ? errorDocument : null,
        },
      });
      toast({ title: 'Website access updated' });
      setWebsiteDialogOpen(false);
    } catch (err) {
      toast({
        title: 'Failed to update website access',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const handleAddAlias = async () => {
    try {
      if (aliasType === 'local' && !aliasAccessKeyId) {
        toast({
          title: 'Access key required',
          description: 'Select an access key to create a local alias.',
          variant: 'destructive',
        });
        return;
      }
      await addAliasMutation.mutateAsync({
        bucketId: bid,
        alias: newAlias.trim(),
        accessKeyId: aliasType === 'local' ? aliasAccessKeyId : undefined,
      });
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

  const handleUpdatePermissions = async () => {
    if (!permKey) return;
    try {
      const currentPerms = bucket?.keys.find(
        (k) => k.accessKeyId === permKey.accessKeyId,
      )?.permissions;
      if (!currentPerms) return;

      // Allow permissions that are newly enabled
      const toAllow = {
        read: permKey.read && !currentPerms.read,
        write: permKey.write && !currentPerms.write,
        owner: permKey.owner && !currentPerms.owner,
      };
      // Deny permissions that are newly disabled
      const toDeny = {
        read: !permKey.read && currentPerms.read,
        write: !permKey.write && currentPerms.write,
        owner: !permKey.owner && currentPerms.owner,
      };

      if (toAllow.read || toAllow.write || toAllow.owner) {
        await allowKeyMutation.mutateAsync({
          bucketId: bid,
          accessKeyId: permKey.accessKeyId,
          permissions: toAllow,
        });
      }
      if (toDeny.read || toDeny.write || toDeny.owner) {
        await denyKeyMutation.mutateAsync({
          bucketId: bid,
          accessKeyId: permKey.accessKeyId,
          permissions: toDeny,
        });
      }
      toast({ title: 'Permissions updated' });
      setPermDialogOpen(false);
      setPermKey(null);
    } catch (err) {
      toast({
        title: 'Failed to update permissions',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <DetailPageHeader
        backTo={`/clusters/${clusterId}/buckets`}
        title={bucket.globalAliases[0] || `${bucket.id.slice(0, 12)}...`}
        subtitle={bucket.id}
      />

      <Card>
        <CardHeader>
          <CardTitle>Bucket Summary</CardTitle>
          <CardDescription>Primary status and usage metrics for this bucket</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Objects</div>
              <div className="text-xl font-semibold">{bucket.objects.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Total Size</div>
              <div className="text-xl font-semibold">{formatBytes(bucket.bytes)}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Incomplete Uploads</div>
              <div className="text-xl font-semibold">{bucket.unfinishedUploads}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Multipart Uploads</div>
              <div className="text-xl font-semibold">{bucket.unfinishedMultipartUploads}</div>
              <div className="text-xs text-muted-foreground">
                {formatBytes(bucket.unfinishedMultipartUploadBytes)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Aliases Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Tags className="h-5 w-5" />
                Aliases
              </CardTitle>
              <CardDescription>Global and local bucket aliases</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setAliasDialogOpen(true)}>
              Add Alias
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            <div className="space-y-2.5">
              <h4 className="text-sm font-medium">Global Aliases</h4>
              {bucket.globalAliases.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {bucket.globalAliases.map((alias) => (
                    <div
                      key={alias}
                      className="group inline-flex items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5 text-sm"
                    >
                      <span className="font-medium">{alias}</span>
                      <div className="ml-1 flex items-center gap-0.5 border-l border-border/60 pl-1">
                        <CopyButton
                          value={alias}
                          label="Global alias"
                          compact
                          className="h-5 w-5 rounded-sm"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 rounded-sm text-muted-foreground hover:text-destructive"
                          onClick={() => setRemoveAliasConfirm({ alias })}
                        >
                          <DeleteActionIcon className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">No global aliases</span>
              )}
            </div>

            <div className="space-y-2.5">
              <h4 className="text-sm font-medium">Local Aliases</h4>
              {localAliases.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {localAliases.map((alias) => (
                    <div
                      key={`${alias.accessKeyId}-${alias.alias}`}
                      className="group inline-flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium leading-none">{alias.alias}</div>
                        <div className="mt-1 text-[11px] leading-none text-muted-foreground">
                          {alias.keyName || formatShortId(alias.accessKeyId, 10)}
                        </div>
                      </div>
                      <div className="ml-1 flex items-center gap-0.5 border-l border-border/60 pl-1">
                        <CopyButton
                          value={alias.alias}
                          label="Local alias"
                          compact
                          className="h-5 w-5 rounded-sm"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 rounded-sm text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            setRemoveAliasConfirm({
                              alias: alias.alias,
                              accessKeyId: alias.accessKeyId,
                            })
                          }
                        >
                          <DeleteActionIcon className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">No local aliases</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Permissions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyIcon className="h-5 w-5" />
            Key Permissions
          </CardTitle>
          <CardDescription>Access keys with permissions on this bucket</CardDescription>
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
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bucket.keys.map((key) => (
                  <TableRow key={key.accessKeyId}>
                    <TableCell className="text-xs">
                      <div className="inline-flex items-center gap-1">
                        <span>{key.accessKeyId.slice(0, 12)}...</span>
                        <CopyButton value={key.accessKeyId} label="Access key ID" compact />
                      </div>
                    </TableCell>
                    <TableCell>{key.name || '-'}</TableCell>
                    <TableCell className="text-center">
                      {key.permissions.read ? (
                        <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                          Yes
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {key.permissions.write ? (
                        <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                          Yes
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {key.permissions.owner ? (
                        <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                          Yes
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPermKey({
                            accessKeyId: key.accessKeyId,
                            name: key.name || key.accessKeyId,
                            read: key.permissions.read,
                            write: key.permissions.write,
                            owner: key.permissions.owner,
                          });
                          setPermDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
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

      {/* Website Access Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Website Access
              </CardTitle>
              <CardDescription>Static website configuration for this bucket</CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setWebsiteEnabled(bucket.websiteAccess);
                setWebsiteIndex(bucket.websiteConfig?.indexDocument || '');
                setWebsiteError(bucket.websiteConfig?.errorDocument || '');
                setWebsiteDialogOpen(true);
              }}
            >
              Edit Website
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="text-sm text-muted-foreground">Status</div>
              <div className="font-medium">{bucket.websiteAccess ? 'Enabled' : 'Disabled'}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Index Document</div>
              <div className="font-medium">{bucket.websiteConfig?.indexDocument || '-'}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Error Document</div>
              <div className="font-medium">{bucket.websiteConfig?.errorDocument || '-'}</div>
            </div>
          </div>
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
          <div className="border-t pt-4">
            <h4 className="font-medium mb-2">Inspect Object</h4>
            <div className="flex gap-2">
              <Input
                placeholder="Enter object key..."
                value={inspectKey}
                onChange={(e) => setInspectKey(e.target.value)}
              />
              <Button variant="outline" onClick={handleInspect} disabled={!inspectKey.trim()}>
                Inspect
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Alias Dialog */}
      <Dialog
        open={aliasDialogOpen}
        onOpenChange={(open) => {
          setAliasDialogOpen(open);
          if (open) {
            setAliasType('global');
            setAliasAccessKeyId(bucket.keys[0]?.accessKeyId || '');
          } else {
            setNewAlias('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Bucket Alias</DialogTitle>
            <DialogDescription>{aliasDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Alias Type</Label>
              <Select
                value={aliasType}
                onValueChange={(value) => setAliasType(value as 'global' | 'local')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select alias type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global alias</SelectItem>
                  <SelectItem value="local">Local alias (per access key)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Alias Name</Label>
              <Input
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                placeholder="my-bucket-alias"
              />
            </div>
            {aliasType === 'local' && (
              <div className="space-y-2">
                <Label>Access Key</Label>
                <Select
                  value={aliasAccessKeyId}
                  onValueChange={setAliasAccessKeyId}
                  disabled={bucket.keys.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select access key" />
                  </SelectTrigger>
                  <SelectContent>
                    {bucket.keys.map((key) => (
                      <SelectItem key={key.accessKeyId} value={key.accessKeyId}>
                        {key.name || formatShortId(key.accessKeyId, 12)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {bucket.keys.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No access keys available for local aliases.
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAliasDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddAlias} disabled={!canAddAlias}>
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
        description={
          removeAliasConfirm?.accessKeyId
            ? `Remove the local alias "${removeAliasConfirm.alias}" for access key ${formatShortId(removeAliasConfirm.accessKeyId, 10)}?`
            : `Are you sure you want to remove the alias "${removeAliasConfirm?.alias}"?`
        }
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

      {/* Website Access Dialog */}
      <Dialog open={websiteDialogOpen} onOpenChange={setWebsiteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Website Access</DialogTitle>
            <DialogDescription>Configure static website hosting for this bucket</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={websiteEnabled} onCheckedChange={setWebsiteEnabled} />
              <span className="text-sm font-medium">Enable website access</span>
            </label>
            <div className="space-y-2">
              <Label>Index Document</Label>
              <Input
                value={websiteIndex}
                onChange={(e) => setWebsiteIndex(e.target.value)}
                placeholder="index.html"
                disabled={!websiteEnabled}
              />
            </div>
            <div className="space-y-2">
              <Label>Error Document</Label>
              <Input
                value={websiteError}
                onChange={(e) => setWebsiteError(e.target.value)}
                placeholder="error.html"
                disabled={!websiteEnabled}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWebsiteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateWebsiteAccess} disabled={updateBucketMutation.isPending}>
              {updateBucketMutation.isPending ? 'Saving...' : 'Save'}
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
            <Button variant="outline" onClick={() => setInspectDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Key Permissions Dialog */}
      <Dialog
        open={permDialogOpen}
        onOpenChange={(open) => {
          setPermDialogOpen(open);
          if (!open) setPermKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Key Permissions</DialogTitle>
            <DialogDescription>Update permissions for key {permKey?.name || ''}</DialogDescription>
          </DialogHeader>
          {permKey && (
            <div className="space-y-4 py-4">
              <label className="flex items-center gap-3">
                <Checkbox
                  checked={permKey.read}
                  onCheckedChange={(checked) =>
                    setPermKey((prev) => (prev ? { ...prev, read: !!checked } : prev))
                  }
                />
                <span className="text-sm font-medium">Read</span>
              </label>
              <label className="flex items-center gap-3">
                <Checkbox
                  checked={permKey.write}
                  onCheckedChange={(checked) =>
                    setPermKey((prev) => (prev ? { ...prev, write: !!checked } : prev))
                  }
                />
                <span className="text-sm font-medium">Write</span>
              </label>
              <label className="flex items-center gap-3">
                <Checkbox
                  checked={permKey.owner}
                  onCheckedChange={(checked) =>
                    setPermKey((prev) => (prev ? { ...prev, owner: !!checked } : prev))
                  }
                />
                <span className="text-sm font-medium">Owner</span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdatePermissions}
              disabled={allowKeyMutation.isPending || denyKeyMutation.isPending}
            >
              {allowKeyMutation.isPending || denyKeyMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
