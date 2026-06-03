import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Globe, Tags, Settings, Pencil } from 'lucide-react';
import {
  Button,
  Checkbox,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  Alert,
  AlertDescription,
  AlertTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  PermissionPill,
  PermissionCheckboxes,
} from '@garage/ui';
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
import { ConfirmDialog } from '@garage/ui';
import { CopyButton } from '@garage/ui';
import { DetailPageHeader } from '@/components/cluster/DetailPageHeader';
import { BucketObjectBrowser } from '@/components/cluster/BucketObjectBrowser';
import { isMfExplicitlyConfigured } from '@/mf-init';
import { JsonViewer } from '@/components/cluster/JsonViewer';
import { PageLoadingState } from '@garage/ui';
import { DeleteActionIcon } from '@/lib/action-icons';
import { formatBytes, formatNum, formatShortId, getApiErrorMessage } from '@garage/web-shared';
import { toast } from '@garage/ui';

export function BucketDetail() {
  const { bid } = useParams<{ bid: string }>();
  const { clusterId } = useClusterContext();
  const [searchParams, setSearchParams] = useSearchParams();

  // After KeyList creates a key via the guided flow, it redirects here with
  // ?selectKey=<id>. Capture it once (before we strip it from the URL), open the
  // Files tab, and hand it to BucketObjectBrowser so the new key is preselected.
  const [initialSelectKey] = useState(() => searchParams.get('selectKey') ?? undefined);
  useEffect(() => {
    if (initialSelectKey) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('selectKey');
          if (isMfExplicitlyConfigured) next.set('tab', 'files');
          return next;
        },
        { replace: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const bucketLabel = bucket.globalAliases[0] || formatShortId(bucket.id, 12);
  const showFilesTab = isMfExplicitlyConfigured && Boolean(bucket.globalAliases[0]);
  const tabValues = ['overview', ...(showFilesTab ? ['files'] : []), 'permissions', 'maintenance'];
  const requestedTab = searchParams.get('tab');
  const activeTab = requestedTab && tabValues.includes(requestedTab) ? requestedTab : 'overview';
  const handleTabChange = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === 'overview') next.delete('tab');
        else next.set('tab', value);
        return next;
      },
      { replace: true },
    );
  };

  const websiteSummary = bucket.websiteAccess
    ? [
        'Enabled',
        bucket.websiteConfig?.indexDocument && `index: ${bucket.websiteConfig.indexDocument}`,
        bucket.websiteConfig?.errorDocument && `error: ${bucket.websiteConfig.errorDocument}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Disabled';
  const quotaSummary = `Max objects: ${
    bucket.quotas.maxObjects ? formatNum(bucket.quotas.maxObjects) : 'Unlimited'
  } · Max size: ${bucket.quotas.maxSize ? formatBytes(bucket.quotas.maxSize) : 'Unlimited'}`;

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
      toast({ title: 'Website access updated', variant: 'success' });
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
      toast({
        title: 'Alias added',
        description: `Added alias "${newAlias}"`,
        variant: 'success',
      });
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
      toast({
        title: 'Alias removed',
        description: `Removed alias "${removeAliasConfirm.alias}"`,
        variant: 'success',
      });
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
      toast({ title: 'Quotas updated', variant: 'success' });
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
      toast({ title: 'Permissions updated', variant: 'success' });
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

  const openPermDialog = (key: {
    accessKeyId: string;
    name?: string | null;
    permissions: { read: boolean; write: boolean; owner: boolean };
  }) => {
    setPermKey({
      accessKeyId: key.accessKeyId,
      name: key.name || key.accessKeyId,
      read: key.permissions.read,
      write: key.permissions.write,
      owner: key.permissions.owner,
    });
    setPermDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <DetailPageHeader
        breadcrumbs={[
          { label: 'Buckets', to: `/clusters/${clusterId}/buckets` },
          { label: bucketLabel },
        ]}
        title={bucketLabel}
        subtitle={bucket.id}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {showFilesTab && <TabsTrigger value="files">Files</TabsTrigger>}
          <TabsTrigger value="permissions">
            Permissions
            {bucket.keys.length > 0 && (
              <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">
                {bucket.keys.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
        </TabsList>

        {/* ---------------- Overview ---------------- */}
        <TabsContent value="overview" className="space-y-4">
          {/* Usage metrics — one dense strip with hairline dividers, not 4 cards */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
            <div className="bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Objects</div>
              <div className="text-lg font-semibold tabular-nums">{formatNum(bucket.objects)}</div>
            </div>
            <div className="bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Total Size</div>
              <div className="text-lg font-semibold tabular-nums">{formatBytes(bucket.bytes)}</div>
            </div>
            <div className="bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Incomplete Uploads</div>
              <div className="text-lg font-semibold tabular-nums">{bucket.unfinishedUploads}</div>
            </div>
            <div className="bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Multipart Uploads</div>
              <div className="text-lg font-semibold tabular-nums">
                {bucket.unfinishedMultipartUploads}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatBytes(bucket.unfinishedMultipartUploadBytes)}
              </div>
            </div>
          </div>

          {/* Configuration — aliases, website, quotas as compact rows */}
          <div className="divide-y rounded-lg border">
            <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Tags className="h-4 w-4 text-muted-foreground" />
                  Aliases
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {bucket.globalAliases.length > 0 ? (
                    bucket.globalAliases.map((alias) => (
                      <span
                        key={alias}
                        className="group inline-flex items-center gap-1.5 rounded-md border bg-muted/20 px-2 py-1 text-sm"
                      >
                        <span className="font-medium">{alias}</span>
                        <span className="flex items-center gap-0.5 border-l border-border/60 pl-1">
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
                        </span>
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">No global aliases</span>
                  )}
                  {localAliases.map((alias) => (
                    <span
                      key={`${alias.accessKeyId}-${alias.alias}`}
                      className="group inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium leading-none">{alias.alias}</span>
                        <span className="mt-0.5 block text-[11px] leading-none text-muted-foreground">
                          {alias.keyName || formatShortId(alias.accessKeyId, 10)}
                        </span>
                      </span>
                      <span className="flex items-center gap-0.5 border-l border-border/60 pl-1">
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
                      </span>
                    </span>
                  ))}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setAliasDialogOpen(true)}
              >
                Add Alias
              </Button>
            </div>

            <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  Website Access
                </div>
                <div className="text-sm text-muted-foreground">{websiteSummary}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setWebsiteEnabled(bucket.websiteAccess);
                  setWebsiteIndex(bucket.websiteConfig?.indexDocument || '');
                  setWebsiteError(bucket.websiteConfig?.errorDocument || '');
                  setWebsiteDialogOpen(true);
                }}
              >
                Edit
              </Button>
            </div>

            <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Quotas
                </div>
                <div className="text-sm text-muted-foreground">{quotaSummary}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setMaxObjects(bucket.quotas.maxObjects?.toString() || '');
                  setMaxSize(
                    bucket.quotas.maxSize
                      ? (bucket.quotas.maxSize / 1_000_000_000).toString()
                      : '',
                  );
                  setQuotasDialogOpen(true);
                }}
              >
                Edit
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ---------------- Files (embedded S3 Browser, lazy per tab) ---------------- */}
        {showFilesTab && bucket.globalAliases[0] && (
          <TabsContent value="files">
            <BucketObjectBrowser
              clusterId={clusterId}
              bucketId={bucket.id}
              bucketAlias={bucket.globalAliases[0]}
              initialKeyId={initialSelectKey}
            />
          </TabsContent>
        )}

        {/* ---------------- Permissions ---------------- */}
        <TabsContent value="permissions">
          {bucket.keys.length > 0 ? (
            <>
              {/* Desktop / tablet: table */}
              <div className="hidden overflow-hidden rounded-lg border sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Access Key</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-center">Read</TableHead>
                      <TableHead className="text-center">Write</TableHead>
                      <TableHead className="text-center">Owner</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bucket.keys.map((key) => (
                      <TableRow key={key.accessKeyId}>
                        <TableCell className="text-xs">
                          <div className="inline-flex items-center gap-1">
                            <span className="font-mono">{key.accessKeyId.slice(0, 12)}…</span>
                            <CopyButton value={key.accessKeyId} label="Access key ID" compact />
                          </div>
                        </TableCell>
                        <TableCell>{key.name || '—'}</TableCell>
                        <TableCell className="text-center">
                          <PermissionPill label="Yes" granted={key.permissions.read} />
                        </TableCell>
                        <TableCell className="text-center">
                          <PermissionPill label="Yes" granted={key.permissions.write} />
                        </TableCell>
                        <TableCell className="text-center">
                          <PermissionPill label="Yes" granted={key.permissions.owner} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openPermDialog(key)}>
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile: one card per key, action inline */}
              <div className="space-y-2 sm:hidden">
                {bucket.keys.map((key) => (
                  <div key={key.accessKeyId} className="space-y-2.5 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{key.name || 'Unnamed key'}</div>
                        <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <span className="font-mono">{formatShortId(key.accessKeyId, 16)}</span>
                          <CopyButton value={key.accessKeyId} label="Access key ID" compact />
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={() => openPermDialog(key)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <PermissionPill label="Read" granted={key.permissions.read} />
                      <PermissionPill label="Write" granted={key.permissions.write} />
                      <PermissionPill label="Owner" granted={key.permissions.owner} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No keys have access to this bucket.
            </div>
          )}
        </TabsContent>

        {/* ---------------- Maintenance ---------------- */}
        <TabsContent value="maintenance" className="space-y-3">
          <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Cleanup Incomplete Uploads</h4>
              <p className="text-sm text-muted-foreground">
                Delete incomplete multipart uploads older than a specified age.
              </p>
            </div>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => setCleanupDialogOpen(true)}
            >
              Cleanup
            </Button>
          </div>
          <div className="space-y-2 rounded-lg border p-4">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Inspect Object</h4>
              <p className="text-sm text-muted-foreground">
                Look up the metadata and versions for a single object key.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Enter object key..."
                value={inspectKey}
                onChange={(e) => setInspectKey(e.target.value)}
              />
              <Button
                variant="outline"
                className="shrink-0"
                onClick={handleInspect}
                disabled={!inspectKey.trim()}
              >
                Inspect
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

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
            <div className="py-4">
              <PermissionCheckboxes
                value={{ read: permKey.read, write: permKey.write, owner: permKey.owner }}
                onChange={(next) => setPermKey((prev) => (prev ? { ...prev, ...next } : prev))}
              />
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
