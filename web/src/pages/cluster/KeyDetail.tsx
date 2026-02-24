import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { api, proxyPath } from '@/lib/api';
import { useKeyInfo, useUpdateKey, useDeleteKey } from '@/hooks/useKeys';
import { useBuckets } from '@/hooks/useBuckets';
import { useAllowBucketKey, useDenyBucketKey } from '@/hooks/usePermissions';
import { AliasMiniChip } from '@/components/cluster/AliasMiniChip';
import { ConfirmDialog } from '@/components/cluster/ConfirmDialog';
import { CopyButton } from '@/components/cluster/CopyButton';
import { DetailPageHeader } from '@/components/cluster/DetailPageHeader';
import { InlineLoadingState } from '@/components/cluster/InlineLoadingState';
import { PageLoadingState } from '@/components/cluster/PageLoadingState';
import { AddActionIcon, DeleteActionIcon, EditActionIcon } from '@/lib/action-icons';
import { BucketIcon, KeyIcon } from '@/lib/entity-icons';
import { formatDateTime24h, formatShortId } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import type { GetKeyInfoResponse, UpdateKeyRequest } from '@/types/garage';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function KeyDetail() {
  const { kid } = useParams<{ kid: string }>();
  const { clusterId } = useClusterContext();
  const navigate = useNavigate();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [editExpirationDate, setEditExpirationDate] = useState('');
  const [editExpirationHour, setEditExpirationHour] = useState('00');
  const [editExpirationMinute, setEditExpirationMinute] = useState('00');
  const [editNeverExpires, setEditNeverExpires] = useState(false);
  const [editBucketPermission, setEditBucketPermission] = useState<'default' | 'allow' | 'deny'>(
    'default',
  );
  const [editError, setEditError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [grantBucketId, setGrantBucketId] = useState('');
  const [grantRead, setGrantRead] = useState(true);
  const [grantWrite, setGrantWrite] = useState(false);
  const [grantOwner, setGrantOwner] = useState(false);
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [editingBucketPerm, setEditingBucketPerm] = useState<{
    bucketId: string;
    bucketName: string;
    read: boolean;
    write: boolean;
    owner: boolean;
  } | null>(null);

  const { data: keyInfo, isLoading, error } = useKeyInfo(clusterId, kid || '');
  const bucketsQuery = useBuckets(clusterId);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [secretLoading, setSecretLoading] = useState(false);

  const handleRevealSecret = async () => {
    setSecretLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('id', kid!);
      params.set('showSecretKey', 'true');
      const res = await api.get<GetKeyInfoResponse>(
        proxyPath(clusterId, `/v2/GetKeyInfo?${params.toString()}`),
      );
      if (res.data?.secretAccessKey) {
        setSecretKey(res.data.secretAccessKey);
      }
    } catch (err) {
      toast({
        title: 'Failed to reveal secret',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setSecretLoading(false);
    }
  };

  const handleCopySecret = async () => {
    if (!secretKey) return;
    try {
      await navigator.clipboard.writeText(secretKey);
      toast({ title: 'Secret copied' });
    } catch (err) {
      toast({
        title: 'Failed to copy secret',
        description: getApiErrorMessage(err, 'Clipboard access denied.'),
        variant: 'destructive',
      });
    }
  };
  const updateKeyMutation = useUpdateKey(clusterId, kid || '');
  const deleteKeyMutation = useDeleteKey(clusterId);
  const allowKeyMutation = useAllowBucketKey(clusterId);
  const denyKeyMutation = useDenyBucketKey(clusterId);
  const bucketsLoading = bucketsQuery.isLoading;
  const bucketsError = bucketsQuery.error;
  const availableBuckets = useMemo(() => {
    const assignedBucketIds = new Set(keyInfo?.buckets?.map((bucket) => bucket.id) ?? []);
    return (bucketsQuery.data ?? []).filter((bucket) => !assignedBucketIds.has(bucket.id));
  }, [bucketsQuery.data, keyInfo?.buckets]);

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

  const editExpirationDateValue = editExpirationDate
    ? new Date(`${editExpirationDate}T${editExpirationHour}:${editExpirationMinute}:00`)
    : null;
  const editExpirationIso =
    editExpirationDateValue && !Number.isNaN(editExpirationDateValue.getTime())
      ? editExpirationDateValue.toISOString()
      : null;
  const editExpirationInvalid = Boolean(editExpirationDate) && !editExpirationIso;

  const currentBucketPermission = keyInfo?.permissions?.createBucket ? 'Allowed' : 'Denied';

  useEffect(() => {
    if (availableBuckets.length === 0) {
      if (grantBucketId) setGrantBucketId('');
      return;
    }
    if (!grantBucketId || !availableBuckets.some((bucket) => bucket.id === grantBucketId)) {
      setGrantBucketId(availableBuckets[0].id);
    }
  }, [availableBuckets, grantBucketId]);

  if (!kid) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Invalid key ID</AlertTitle>
        <AlertDescription>The requested access key identifier is missing.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return <PageLoadingState label="Loading key details..." />;
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
    return (
      <Alert variant="destructive">
        <AlertTitle>Key not found</AlertTitle>
        <AlertDescription>The key may have been removed or is unavailable.</AlertDescription>
      </Alert>
    );
  }

  const handleUpdateKey = async () => {
    if (!keyInfo) return;
    if (editExpirationInvalid) return;
    const payload: UpdateKeyRequest = {};
    const trimmedName = newName.trim();
    if (trimmedName !== keyInfo.name) {
      payload.name = trimmedName || null;
    }
    if (editNeverExpires) {
      payload.neverExpires = true;
    } else if (editExpirationIso) {
      payload.expiration = editExpirationIso;
    } else if (keyInfo.expiration) {
      payload.expiration = null;
    }
    if (editBucketPermission === 'allow') {
      payload.allow = { createBucket: true };
    } else if (editBucketPermission === 'deny') {
      payload.deny = { createBucket: true };
    }
    try {
      await updateKeyMutation.mutateAsync(payload);
      toast({ title: 'Key updated', description: 'Key settings have been updated' });
      setEditDialogOpen(false);
    } catch (err) {
      setEditError(getApiErrorMessage(err));
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

  const handleUpdateBucketPermissions = async () => {
    if (!editingBucketPerm || !kid) return;
    try {
      const currentPerms = keyInfo?.buckets?.find(
        (b) => b.id === editingBucketPerm.bucketId,
      )?.permissions;
      if (!currentPerms) return;

      const toAllow = {
        read: editingBucketPerm.read && !currentPerms.read,
        write: editingBucketPerm.write && !currentPerms.write,
        owner: editingBucketPerm.owner && !currentPerms.owner,
      };
      const toDeny = {
        read: !editingBucketPerm.read && currentPerms.read,
        write: !editingBucketPerm.write && currentPerms.write,
        owner: !editingBucketPerm.owner && currentPerms.owner,
      };

      if (toAllow.read || toAllow.write || toAllow.owner) {
        await allowKeyMutation.mutateAsync({
          bucketId: editingBucketPerm.bucketId,
          accessKeyId: kid,
          permissions: toAllow,
        });
      }
      if (toDeny.read || toDeny.write || toDeny.owner) {
        await denyKeyMutation.mutateAsync({
          bucketId: editingBucketPerm.bucketId,
          accessKeyId: kid,
          permissions: toDeny,
        });
      }
      toast({ title: 'Permissions updated' });
      setPermDialogOpen(false);
      setEditingBucketPerm(null);
    } catch (err) {
      toast({
        title: 'Failed to update permissions',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const handleGrantAccess = async () => {
    if (!grantBucketId) {
      toast({
        title: 'Select a bucket',
        description: 'Choose a bucket to grant access.',
        variant: 'destructive',
      });
      return;
    }
    if (!grantRead && !grantWrite && !grantOwner) {
      toast({
        title: 'Select permissions',
        description: 'Choose at least one permission to grant.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await allowKeyMutation.mutateAsync({
        bucketId: grantBucketId,
        accessKeyId: kid,
        permissions: { read: grantRead, write: grantWrite, owner: grantOwner },
      });
      toast({ title: 'Access granted' });
    } catch (err) {
      toast({
        title: 'Failed to grant access',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <DetailPageHeader
        backTo={`/clusters/${clusterId}/keys`}
        title={keyInfo.name || 'Unnamed Key'}
        subtitle={keyInfo.accessKeyId}
        badges={
          keyInfo.expired ? (
            <Badge variant="destructive">Expired</Badge>
          ) : (
            <Badge variant="success">Active</Badge>
          )
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const parts = toDateParts(keyInfo.expiration);
                setNewName(keyInfo.name);
                setEditExpirationDate(parts.date);
                setEditExpirationHour(parts.hour);
                setEditExpirationMinute(parts.minute);
                setEditNeverExpires(!keyInfo.expiration);
                setEditBucketPermission('default');
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

      {/* Key Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyIcon className="h-5 w-5" />
            Key Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-sm text-muted-foreground">Access Key ID</div>
              <div className="inline-flex items-center gap-1">
                <span>{keyInfo.accessKeyId}</span>
                <CopyButton value={keyInfo.accessKeyId} label="Access key ID" />
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Name</div>
              <div className="font-medium">{keyInfo.name || '-'}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Create Bucket</div>
              <div>
                {keyInfo.permissions?.createBucket === true
                  ? 'Allowed'
                  : keyInfo.permissions?.createBucket === false
                    ? 'Denied'
                    : 'Default'}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Created</div>
              <div>{formatDateTime24h(keyInfo.created)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Expiration</div>
              <div>{keyInfo.expiration ? formatDateTime24h(keyInfo.expiration) : 'Never'}</div>
            </div>
          </div>

          {/* Secret Key Section */}
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between mb-2 gap-3">
              <Label>Secret Access Key</Label>
              {secretKey ? (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSecretKey(null)}>
                    Hide
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCopySecret}>
                    Copy
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRevealSecret}
                  disabled={secretLoading}
                >
                  {secretLoading ? 'Loading...' : 'Reveal Secret'}
                </Button>
              )}
            </div>
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm font-mono break-all">
              {secretLoading ? 'Loading...' : secretKey || '••••••••••••••••'}
            </div>
            {!secretKey && !secretLoading && (
              <p className="text-sm text-muted-foreground mt-2">
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BucketIcon className="h-5 w-5" />
                Bucket Permissions
              </CardTitle>
              <CardDescription>Buckets this key has access to</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setGrantRead(true);
                setGrantWrite(false);
                setGrantOwner(false);
                setGrantDialogOpen(true);
              }}
              disabled={bucketsLoading || availableBuckets.length === 0}
            >
              <AddActionIcon className="h-4 w-4 mr-2" />
              Grant Access
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {keyInfo.buckets && keyInfo.buckets.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bucket</TableHead>
                  <TableHead>Aliases</TableHead>
                  <TableHead className="text-center">Read</TableHead>
                  <TableHead className="text-center">Write</TableHead>
                  <TableHead className="text-center">Owner</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keyInfo.buckets.map((bucket) => (
                  <TableRow key={bucket.id}>
                    <TableCell className="text-xs">{bucket.id.slice(0, 12)}...</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {bucket.globalAliases.map((alias) => (
                          <AliasMiniChip key={alias} value={alias} kind="global" />
                        ))}
                        {bucket.localAliases.map((alias) => (
                          <AliasMiniChip key={alias} value={alias} kind="local" />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {bucket.permissions.read ? (
                        <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                          Yes
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {bucket.permissions.write ? (
                        <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                          Yes
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {bucket.permissions.owner ? (
                        <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                          Yes
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const bucketName =
                            bucket.globalAliases[0] ||
                            bucket.localAliases[0] ||
                            formatShortId(bucket.id, 12);
                          setEditingBucketPerm({
                            bucketId: bucket.id,
                            bucketName,
                            read: bucket.permissions.read,
                            write: bucket.permissions.write,
                            owner: bucket.permissions.owner,
                          });
                          setPermDialogOpen(true);
                        }}
                      >
                        <EditActionIcon className="h-3.5 w-3.5 mr-1.5" />
                        Edit
                      </Button>
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
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditError('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Access Key</DialogTitle>
            <DialogDescription>Update settings for this access key</DialogDescription>
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
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Expiration (24h)</Label>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Date</div>
                    <Input
                      type="date"
                      value={editExpirationDate}
                      onChange={(e) => setEditExpirationDate(e.target.value)}
                      disabled={editNeverExpires}
                      className="min-w-[170px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Time</div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={editExpirationHour}
                        onValueChange={setEditExpirationHour}
                        disabled={editNeverExpires}
                      >
                        <SelectTrigger className="w-[84px]">
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
                      <span className="text-sm text-muted-foreground">:</span>
                      <Select
                        value={editExpirationMinute}
                        onValueChange={setEditExpirationMinute}
                        disabled={editNeverExpires}
                      >
                        <SelectTrigger className="w-[84px]">
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
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Current: {keyInfo.expiration ? formatDateTime24h(keyInfo.expiration) : 'Never'}
                </p>
                {editExpirationInvalid && (
                  <p className="text-xs text-destructive">Invalid date and time.</p>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={editNeverExpires}
                  onCheckedChange={(checked) => {
                    setEditNeverExpires(checked);
                    if (checked) {
                      setEditExpirationDate('');
                      setEditExpirationHour('00');
                      setEditExpirationMinute('00');
                    }
                  }}
                />
                Never expires
              </label>
            </div>
            <div className="space-y-2">
              <Label>Bucket Creation Permission</Label>
              <Select
                value={editBucketPermission}
                onValueChange={(value) =>
                  setEditBucketPermission(value as 'default' | 'allow' | 'deny')
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">No change</SelectItem>
                  <SelectItem value="allow">Allow create bucket</SelectItem>
                  <SelectItem value="deny">Deny create bucket</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Current: {currentBucketPermission}</p>
            </div>
            {editError && (
              <Alert variant="destructive">
                <AlertTitle>Update failed</AlertTitle>
                <AlertDescription>{editError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateKey}
              disabled={editExpirationInvalid || updateKeyMutation.isPending}
            >
              {updateKeyMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Bucket Permissions Dialog */}
      <Dialog
        open={permDialogOpen}
        onOpenChange={(open) => {
          setPermDialogOpen(open);
          if (!open) setEditingBucketPerm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Bucket Permissions</DialogTitle>
            <DialogDescription>
              Update permissions for bucket {editingBucketPerm?.bucketName || ''}
            </DialogDescription>
          </DialogHeader>
          {editingBucketPerm && (
            <div className="space-y-4 py-4">
              <label className="flex items-center gap-3">
                <Checkbox
                  checked={editingBucketPerm.read}
                  onCheckedChange={(checked) =>
                    setEditingBucketPerm((prev) =>
                      prev ? { ...prev, read: !!checked } : prev,
                    )
                  }
                />
                <span className="text-sm font-medium">Read</span>
              </label>
              <label className="flex items-center gap-3">
                <Checkbox
                  checked={editingBucketPerm.write}
                  onCheckedChange={(checked) =>
                    setEditingBucketPerm((prev) =>
                      prev ? { ...prev, write: !!checked } : prev,
                    )
                  }
                />
                <span className="text-sm font-medium">Write</span>
              </label>
              <label className="flex items-center gap-3">
                <Checkbox
                  checked={editingBucketPerm.owner}
                  onCheckedChange={(checked) =>
                    setEditingBucketPerm((prev) =>
                      prev ? { ...prev, owner: !!checked } : prev,
                    )
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
              onClick={handleUpdateBucketPermissions}
              disabled={allowKeyMutation.isPending || denyKeyMutation.isPending}
            >
              {allowKeyMutation.isPending || denyKeyMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grant Access Dialog */}
      <Dialog
        open={grantDialogOpen}
        onOpenChange={(open) => {
          setGrantDialogOpen(open);
          if (open) {
            setGrantRead(true);
            setGrantWrite(false);
            setGrantOwner(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant Bucket Access</DialogTitle>
            <DialogDescription>
              Select a bucket and permissions to grant for this key.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {bucketsLoading ? (
              <InlineLoadingState label="Loading buckets..." />
            ) : bucketsError ? (
              <p className="text-sm text-destructive">
                {getApiErrorMessage(bucketsError, 'Failed to load buckets.')}
              </p>
            ) : availableBuckets.length > 0 ? (
              <>
                <div className="space-y-2">
                  <Label>Bucket</Label>
                  <Select value={grantBucketId} onValueChange={setGrantBucketId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bucket" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableBuckets.map((bucket) => {
                        const alias = bucket.globalAliases[0];
                        const label = alias
                          ? `${alias} (${formatShortId(bucket.id, 10)})`
                          : formatShortId(bucket.id, 12);
                        return (
                          <SelectItem key={bucket.id} value={bucket.id}>
                            {label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Permissions</Label>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={grantRead} onCheckedChange={setGrantRead} />
                      Read
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={grantWrite} onCheckedChange={setGrantWrite} />
                      Write
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={grantOwner} onCheckedChange={setGrantOwner} />
                      Owner
                    </label>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                All buckets already have permissions for this key.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await handleGrantAccess();
                setGrantDialogOpen(false);
              }}
              disabled={!grantBucketId || (!grantRead && !grantWrite && !grantOwner)}
            >
              Grant Access
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
