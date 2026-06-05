import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Globe,
  Tags,
  Settings,
  Fingerprint,
  AlertTriangle,
  Shield,
  Timer,
  ArrowRightLeft,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Badge,
  Meter,
  type MeterTone,
  cn,
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
  TabHotkeys,
  PermissionPill,
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
import { ConfirmDialog } from '@garage/ui';
import { CopyButton } from '@garage/ui';
import { DetailPageHeader } from '@/components/cluster/DetailPageHeader';
import { BucketObjectBrowser } from '@/components/cluster/BucketObjectBrowser';
import { isMfExplicitlyConfigured } from '@/mf-init';
import { JsonViewer } from '@/components/cluster/JsonViewer';
import { PageLoadingState } from '@garage/ui';
import { AddActionIcon, DeleteActionIcon, OpenActionIcon } from '@/lib/action-icons';
import { KeyIcon } from '@/lib/entity-icons';
import { formatBytes, formatNum, formatShortId, getApiErrorMessage } from '@garage/web-shared';
import { toast } from '@garage/ui';
import type { CorsRule, LifecycleRule, WebsiteRoutingRule } from '@/types/garage';

/** A usage stat: the value, an optional `/ max`, and a quota meter when a limit
 *  is set (color-coded by how close usage is to the cap). */
function UsageStat({
  label,
  used,
  max,
  format,
}: {
  label: string;
  used: number;
  max?: number | null;
  format: (n: number) => string;
}) {
  const pct = max && max > 0 ? Math.min(100, (used / max) * 100) : null;
  const tone: MeterTone =
    pct === null ? 'neutral' : pct >= 90 ? 'destructive' : pct >= 70 ? 'warning' : 'success';
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">
        {format(used)}
        {max ? (
          <span className="text-sm font-normal text-muted-foreground"> / {format(max)}</span>
        ) : null}
      </div>
      {pct !== null && (
        <Meter
          className="mt-1.5"
          value={pct}
          tone={tone}
          ariaLabel={`${label}: ${Math.round(pct)}% of quota`}
        />
      )}
    </div>
  );
}

export function BucketDetail() {
  const { bid } = useParams<{ bid: string }>();
  const { clusterId } = useClusterContext();
  const navigate = useNavigate();
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
  const [corsDialogOpen, setCorsDialogOpen] = useState(false);
  const [corsRules, setCorsRules] = useState<CorsRule[]>([]);
  const [lifecycleDialogOpen, setLifecycleDialogOpen] = useState(false);
  const [lifecycleRules, setLifecycleRules] = useState<LifecycleRule[]>([]);
  const [routingDialogOpen, setRoutingDialogOpen] = useState(false);
  const [routingRules, setRoutingRules] = useState<WebsiteRoutingRule[]>([]);
  const { data: bucket, isLoading, error } = useBucketInfo(clusterId, bid || '');
  const updateBucketMutation = useUpdateBucket(clusterId, bid || '');
  const cleanupMutation = useCleanupIncompleteUploads(clusterId, bid || '');
  const addAliasMutation = useAddBucketAlias(clusterId);
  const removeAliasMutation = useRemoveBucketAlias(clusterId);
  const inspectMutation = useInspectObject(clusterId, bid || '');

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

  // Lead with a global alias; otherwise the full id — the breadcrumb truncates
  // it with an ellipsis (same as a long alias) rather than hard-capping the chars.
  const bucketLabel = bucket.globalAliases[0] || bucket.id;
  // CTA for the permissions tab: open the key list's Create dialog pre-wired to
  // grant the new key access to this bucket, then return here.
  const grantKeyCta = `/clusters/${clusterId}/keys?create=1&grantBucketId=${encodeURIComponent(
    bucket.id,
  )}&returnTo=${encodeURIComponent(`/clusters/${clusterId}/buckets/${bucket.id}?tab=permissions`)}`;
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

  const handleSaveCorsRules = async () => {
    try {
      await updateBucketMutation.mutateAsync({ corsRules: corsRules.length > 0 ? corsRules : [] });
      toast({ title: 'CORS rules updated', variant: 'success' });
      setCorsDialogOpen(false);
    } catch (err) {
      toast({
        title: 'Failed to update CORS rules',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const handleSaveLifecycleRules = async () => {
    try {
      await updateBucketMutation.mutateAsync({
        lifecycleRules: lifecycleRules.length > 0 ? lifecycleRules : [],
      });
      toast({ title: 'Lifecycle rules updated', variant: 'success' });
      setLifecycleDialogOpen(false);
    } catch (err) {
      toast({
        title: 'Failed to update lifecycle rules',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const handleSaveRoutingRules = async () => {
    try {
      await updateBucketMutation.mutateAsync({
        websiteAccess: {
          enabled: bucket.websiteAccess,
          indexDocument: bucket.websiteConfig?.indexDocument ?? null,
          errorDocument: bucket.websiteConfig?.errorDocument ?? null,
          routingRules: routingRules.length > 0 ? routingRules : [],
        },
      });
      toast({ title: 'Routing rules updated', variant: 'success' });
      setRoutingDialogOpen(false);
    } catch (err) {
      toast({
        title: 'Failed to update routing rules',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const openCorsEditor = () => {
    setCorsRules(bucket.corsRules?.map((r) => ({ ...r })) ?? []);
    setCorsDialogOpen(true);
  };

  const openLifecycleEditor = () => {
    setLifecycleRules(
      bucket.lifecycleRules?.map((r) => JSON.parse(JSON.stringify(r)) as LifecycleRule) ?? [],
    );
    setLifecycleDialogOpen(true);
  };

  const openRoutingEditor = () => {
    setRoutingRules(
      bucket.routingRules?.map((r) => JSON.parse(JSON.stringify(r)) as WebsiteRoutingRule) ?? [],
    );
    setRoutingDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <DetailPageHeader
        breadcrumbs={[
          { label: 'Buckets', to: `/clusters/${clusterId}/buckets` },
          { label: bucketLabel },
        ]}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabHotkeys values={tabValues} onSelect={handleTabChange} />
        <TabsList>
          <TabsTrigger
            value="overview"
            title={`Overview (press ${tabValues.indexOf('overview') + 1})`}
          >
            Overview
          </TabsTrigger>
          {showFilesTab && (
            <TabsTrigger value="files" title={`Files (press ${tabValues.indexOf('files') + 1})`}>
              Files
            </TabsTrigger>
          )}
          <TabsTrigger
            value="permissions"
            title={`Permissions (press ${tabValues.indexOf('permissions') + 1})`}
          >
            Permissions
            {bucket.keys.length > 0 && (
              <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">
                {bucket.keys.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="maintenance"
            title={`Maintenance (press ${tabValues.indexOf('maintenance') + 1})`}
          >
            Maintenance
          </TabsTrigger>
        </TabsList>

        {/* ---------------- Overview ---------------- */}
        <TabsContent value="overview" className="space-y-4">
          {/* Usage metrics — one dense strip with hairline dividers, not 4 cards */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
            <UsageStat
              label="Objects"
              used={bucket.objects}
              max={bucket.quotas.maxObjects}
              format={formatNum}
            />
            <UsageStat
              label="Total Size"
              used={bucket.bytes}
              max={bucket.quotas.maxSize}
              format={formatBytes}
            />
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

          {/* Configuration — id, aliases, website, quotas as compact rows */}
          <div className="divide-y rounded-lg border">
            <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Fingerprint className="h-4 w-4 text-muted-foreground" />
                  Bucket ID
                </div>
                <div className="inline-flex max-w-full items-center gap-1">
                  <span className="break-all font-mono text-sm text-muted-foreground">
                    {bucket.id}
                  </span>
                  <CopyButton value={bucket.id} label="Bucket ID" compact />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Tags className="h-4 w-4 text-muted-foreground" />
                  Aliases
                </div>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Global</div>
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
                        <span className="text-sm text-muted-foreground">None</span>
                      )}
                    </div>
                  </div>
                  {localAliases.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Local (per key)</div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {localAliases.map((alias) => (
                          <span
                            key={`${alias.accessKeyId}-${alias.alias}`}
                            className="group inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1"
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-medium leading-none">
                                {alias.alias}
                              </span>
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
                  )}
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
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  {bucket.websiteAccess ? (
                    <Badge variant="success">Enabled</Badge>
                  ) : (
                    <Badge variant="secondary">Disabled</Badge>
                  )}
                  {bucket.websiteAccess && (
                    <>
                      {bucket.websiteConfig?.indexDocument && (
                        <span className="text-muted-foreground">
                          index:{' '}
                          <span className="font-mono text-foreground">
                            {bucket.websiteConfig.indexDocument}
                          </span>
                        </span>
                      )}
                      {bucket.websiteConfig?.errorDocument && (
                        <span className="text-muted-foreground">
                          error:{' '}
                          <span className="font-mono text-foreground">
                            {bucket.websiteConfig.errorDocument}
                          </span>
                        </span>
                      )}
                    </>
                  )}
                </div>
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
                    bucket.quotas.maxSize ? (bucket.quotas.maxSize / 1_000_000_000).toString() : '',
                  );
                  setQuotasDialogOpen(true);
                }}
              >
                Edit
              </Button>
            </div>

            {/* v2.3.0: CORS rules */}
            {bucket.corsRules != null && (
              <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    CORS Rules
                    <Badge variant="secondary">{bucket.corsRules.length}</Badge>
                  </div>
                  {bucket.corsRules.length > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      {bucket.corsRules.map((rule, i) => (
                        <div
                          key={rule.ID ?? i}
                          className="rounded-md border bg-muted/20 px-3 py-2 text-sm"
                        >
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            <span className="text-muted-foreground">
                              Origins:{' '}
                              <span className="font-mono text-foreground">
                                {rule.AllowedOrigin.join(', ')}
                              </span>
                            </span>
                            <span className="text-muted-foreground">
                              Methods:{' '}
                              <span className="font-mono text-foreground">
                                {rule.AllowedMethod.join(', ')}
                              </span>
                            </span>
                          </div>
                          {rule.MaxAgeSeconds != null && (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              Max age: {rule.MaxAgeSeconds}s
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No CORS rules configured</div>
                  )}
                </div>
                <Button variant="outline" size="sm" className="shrink-0" onClick={openCorsEditor}>
                  Edit
                </Button>
              </div>
            )}

            {/* v2.3.0: Lifecycle rules */}
            {bucket.lifecycleRules != null && (
              <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Timer className="h-4 w-4 text-muted-foreground" />
                    Lifecycle Rules
                    <Badge variant="secondary">{bucket.lifecycleRules.length}</Badge>
                  </div>
                  {bucket.lifecycleRules.length > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      {bucket.lifecycleRules.map((rule, i) => (
                        <div
                          key={rule.ID ?? i}
                          className="rounded-md border bg-muted/20 px-3 py-2 text-sm"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={rule.Status === 'Enabled' ? 'success' : 'secondary'}>
                              {rule.Status}
                            </Badge>
                            {rule.ID && (
                              <span className="font-mono text-xs text-muted-foreground">
                                {rule.ID}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                            {rule.Filter?.Prefix && (
                              <span>
                                Prefix:{' '}
                                <span className="font-mono text-foreground">
                                  {rule.Filter.Prefix}
                                </span>
                              </span>
                            )}
                            {rule.Expiration?.Days != null && (
                              <span>Expires after {rule.Expiration.Days} day(s)</span>
                            )}
                            {rule.Expiration?.Date && (
                              <span>Expires on {rule.Expiration.Date}</span>
                            )}
                            {rule.AbortIncompleteMultipartUpload && (
                              <span>
                                Abort incomplete MPU after{' '}
                                {rule.AbortIncompleteMultipartUpload.DaysAfterInitiation} day(s)
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      No lifecycle rules configured
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={openLifecycleEditor}
                >
                  Edit
                </Button>
              </div>
            )}

            {/* v2.3.0: Website routing rules */}
            {bucket.routingRules != null && (
              <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                    Routing Rules
                    <Badge variant="secondary">{bucket.routingRules.length}</Badge>
                  </div>
                  {bucket.routingRules.length > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      {bucket.routingRules.map((rule, i) => (
                        <div key={i} className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                            {rule.Condition?.KeyPrefixEquals && (
                              <span>
                                Prefix:{' '}
                                <span className="font-mono text-foreground">
                                  {rule.Condition.KeyPrefixEquals}
                                </span>
                              </span>
                            )}
                            {rule.Condition?.HttpErrorCodeReturnedEquals != null && (
                              <span>HTTP {rule.Condition.HttpErrorCodeReturnedEquals}</span>
                            )}
                            {rule.Redirect.HostName && (
                              <span>
                                Redirect to{' '}
                                <span className="font-mono text-foreground">
                                  {rule.Redirect.Protocol ? `${rule.Redirect.Protocol}://` : ''}
                                  {rule.Redirect.HostName}
                                </span>
                              </span>
                            )}
                            {rule.Redirect.ReplaceKeyPrefixWith && (
                              <span>
                                Replace prefix with{' '}
                                <span className="font-mono text-foreground">
                                  {rule.Redirect.ReplaceKeyPrefixWith}
                                </span>
                              </span>
                            )}
                            {rule.Redirect.ReplaceKeyWith && (
                              <span>
                                Replace key with{' '}
                                <span className="font-mono text-foreground">
                                  {rule.Redirect.ReplaceKeyWith}
                                </span>
                              </span>
                            )}
                            {rule.Redirect.HttpRedirectCode != null && (
                              <span>HTTP {rule.Redirect.HttpRedirectCode}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No routing rules configured</div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={openRoutingEditor}
                >
                  Edit
                </Button>
              </div>
            )}
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
        <TabsContent value="permissions" className="space-y-3">
          {bucket.keys.length > 0 ? (
            <>
              {/* Desktop / tablet: read-only Key · Access · View table */}
              <div className="hidden overflow-hidden rounded-lg border sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Access</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bucket.keys.map((key) => (
                      <TableRow key={key.accessKeyId}>
                        <TableCell>
                          <div className="min-w-0">
                            <div className="font-medium">{key.name || 'Unnamed key'}</div>
                            <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <span className="font-mono">
                                {formatShortId(key.accessKeyId, 16)}
                              </span>
                              <CopyButton value={key.accessKeyId} label="Access key ID" compact />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1.5">
                            <PermissionPill label="Read" granted={key.permissions.read} />
                            <PermissionPill label="Write" granted={key.permissions.write} />
                            <PermissionPill label="Owner" granted={key.permissions.owner} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              navigate(`/clusters/${clusterId}/keys/${key.accessKeyId}`)
                            }
                          >
                            <OpenActionIcon className="h-3.5 w-3.5" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile: one card per key */}
              <div className="space-y-2 sm:hidden">
                {bucket.keys.map((key) => (
                  <div key={key.accessKeyId} className="space-y-2.5 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {key.name || 'Unnamed key'}
                        </div>
                        <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <span className="font-mono">{formatShortId(key.accessKeyId, 16)}</span>
                          <CopyButton value={key.accessKeyId} label="Access key ID" compact />
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={() => navigate(`/clusters/${clusterId}/keys/${key.accessKeyId}`)}
                      >
                        <OpenActionIcon className="h-3.5 w-3.5" />
                        View
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
            <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed p-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <KeyIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <h3 className="font-medium text-foreground">No keys have access</h3>
                <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                  Create an access key and grant it permissions on this bucket in one step.
                </p>
              </div>
              <Button size="sm" onClick={() => navigate(grantKeyCta)}>
                <AddActionIcon className="h-4 w-4" />
                Create &amp; grant a key
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ---------------- Maintenance ---------------- */}
        <TabsContent value="maintenance" className="space-y-3">
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

          {/* Cleanup is irreversible — flagged in the warning (purple) color. */}
          <div className="flex flex-col gap-3 rounded-lg border border-warning/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Cleanup Incomplete Uploads</h4>
              <p className="text-sm text-muted-foreground">
                Permanently delete incomplete multipart uploads older than a chosen age.
              </p>
            </div>
            <Button
              variant="warning"
              className="shrink-0"
              onClick={() => setCleanupDialogOpen(true)}
            >
              Cleanup
            </Button>
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
              <Label>Alias type</Label>
              <div className="flex gap-2" role="group" aria-label="Alias type">
                {(['global', 'local'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setAliasType(type)}
                    aria-pressed={aliasType === type}
                    className={cn(
                      'min-h-9 flex-1 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      aliasType === type
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {type === 'global' ? 'Global' : 'Local (per key)'}
                  </button>
                ))}
              </div>
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
              Delete incomplete multipart uploads older than the specified age.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This permanently removes in-progress multipart uploads older than the threshold and
                can&rsquo;t be undone.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label>Age threshold (seconds)</Label>
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
            <Button variant="warning" onClick={handleCleanup} disabled={cleanupMutation.isPending}>
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
            <p className="text-xs text-muted-foreground">
              When enabled, Garage serves this bucket as a static website at your configured web
              endpoint — the index document for directory roots, the error document for 4xx
              responses.
            </p>
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
              <div className="flex items-center justify-between gap-2">
                <Label>Max objects</Label>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={!maxObjects}
                    onCheckedChange={(c) => {
                      if (c) setMaxObjects('');
                    }}
                  />
                  No limit
                </label>
              </div>
              <Input
                type="number"
                value={maxObjects}
                onChange={(e) => setMaxObjects(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Max size (GB)</Label>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={!maxSize}
                    onCheckedChange={(c) => {
                      if (c) setMaxSize('');
                    }}
                  />
                  No limit
                </label>
              </div>
              <Input
                type="number"
                value={maxSize}
                onChange={(e) => setMaxSize(e.target.value)}
                placeholder="Unlimited"
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
            <DialogDescription className="[overflow-wrap:anywhere]">
              Metadata and versions for{' '}
              <span className="font-mono text-foreground">{inspectKey.trim()}</span>
            </DialogDescription>
          </DialogHeader>
          {inspectMutation.data ? (
            <JsonViewer data={inspectMutation.data} />
          ) : (
            <p className="py-4 text-sm text-muted-foreground">
              No details returned for this object.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInspectDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CORS Rules Editor */}
      <Dialog open={corsDialogOpen} onOpenChange={setCorsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit CORS Rules</DialogTitle>
            <DialogDescription>
              Configure Cross-Origin Resource Sharing rules for this bucket.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {corsRules.map((rule, i) => (
              <div key={i} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Rule {i + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setCorsRules((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Allowed Origins (comma-separated)</Label>
                  <Input
                    value={rule.AllowedOrigin.join(', ')}
                    onChange={(e) => {
                      const origins = e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean);
                      setCorsRules((prev) =>
                        prev.map((r, j) => (j === i ? { ...r, AllowedOrigin: origins } : r)),
                      );
                    }}
                    placeholder="* or https://example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Allowed Methods (comma-separated)</Label>
                  <Input
                    value={rule.AllowedMethod.join(', ')}
                    onChange={(e) => {
                      const methods = e.target.value
                        .split(',')
                        .map((s) => s.trim().toUpperCase())
                        .filter(Boolean);
                      setCorsRules((prev) =>
                        prev.map((r, j) => (j === i ? { ...r, AllowedMethod: methods } : r)),
                      );
                    }}
                    placeholder="GET, PUT, POST, DELETE, HEAD"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Allowed Headers (comma-separated, optional)</Label>
                  <Input
                    value={(rule.AllowedHeader ?? []).join(', ')}
                    onChange={(e) => {
                      const headers = e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean);
                      setCorsRules((prev) =>
                        prev.map((r, j) =>
                          j === i
                            ? { ...r, AllowedHeader: headers.length > 0 ? headers : undefined }
                            : r,
                        ),
                      );
                    }}
                    placeholder="*"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Expose Headers (comma-separated, optional)</Label>
                  <Input
                    value={(rule.ExposeHeader ?? []).join(', ')}
                    onChange={(e) => {
                      const headers = e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean);
                      setCorsRules((prev) =>
                        prev.map((r, j) =>
                          j === i
                            ? { ...r, ExposeHeader: headers.length > 0 ? headers : undefined }
                            : r,
                        ),
                      );
                    }}
                    placeholder="ETag, x-amz-request-id"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max Age (seconds, optional)</Label>
                  <Input
                    type="number"
                    value={rule.MaxAgeSeconds ?? ''}
                    onChange={(e) => {
                      const val = e.target.value ? parseInt(e.target.value, 10) : null;
                      setCorsRules((prev) =>
                        prev.map((r, j) => (j === i ? { ...r, MaxAgeSeconds: val } : r)),
                      );
                    }}
                    placeholder="3600"
                  />
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setCorsRules((prev) => [...prev, { AllowedOrigin: ['*'], AllowedMethod: ['GET'] }])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add Rule
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCorsRules} disabled={updateBucketMutation.isPending}>
              {updateBucketMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lifecycle Rules Editor */}
      <Dialog open={lifecycleDialogOpen} onOpenChange={setLifecycleDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Lifecycle Rules</DialogTitle>
            <DialogDescription>Configure object expiration and cleanup policies.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {lifecycleRules.map((rule, i) => (
              <div key={i} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Rule {i + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setLifecycleRules((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Rule ID (optional)</Label>
                    <Input
                      value={rule.ID ?? ''}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        setLifecycleRules((prev) =>
                          prev.map((r, j) => (j === i ? { ...r, ID: val } : r)),
                        );
                      }}
                      placeholder="my-rule-id"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Status</Label>
                    <Select
                      value={rule.Status}
                      onValueChange={(val) =>
                        setLifecycleRules((prev) =>
                          prev.map((r, j) => (j === i ? { ...r, Status: val } : r)),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Enabled">Enabled</SelectItem>
                        <SelectItem value="Disabled">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Filter Prefix (optional)</Label>
                  <Input
                    value={rule.Filter?.Prefix ?? ''}
                    onChange={(e) => {
                      const prefix = e.target.value || null;
                      setLifecycleRules((prev) =>
                        prev.map((r, j) =>
                          j === i
                            ? {
                                ...r,
                                Filter: prefix ? { ...r.Filter, Prefix: prefix } : null,
                              }
                            : r,
                        ),
                      );
                    }}
                    placeholder="logs/"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Expiration Days</Label>
                    <Input
                      type="number"
                      value={rule.Expiration?.Days ?? ''}
                      onChange={(e) => {
                        const days = e.target.value ? parseInt(e.target.value, 10) : null;
                        setLifecycleRules((prev) =>
                          prev.map((r, j) =>
                            j === i
                              ? {
                                  ...r,
                                  Expiration:
                                    days != null
                                      ? { ...r.Expiration, Days: days, Date: null }
                                      : null,
                                }
                              : r,
                          ),
                        );
                      }}
                      placeholder="30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Abort Incomplete MPU (days)</Label>
                    <Input
                      type="number"
                      value={rule.AbortIncompleteMultipartUpload?.DaysAfterInitiation ?? ''}
                      onChange={(e) => {
                        const days = e.target.value ? parseInt(e.target.value, 10) : null;
                        setLifecycleRules((prev) =>
                          prev.map((r, j) =>
                            j === i
                              ? {
                                  ...r,
                                  AbortIncompleteMultipartUpload:
                                    days != null ? { DaysAfterInitiation: days } : null,
                                }
                              : r,
                          ),
                        );
                      }}
                      placeholder="7"
                    />
                  </div>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setLifecycleRules((prev) => [
                  ...prev,
                  { Status: 'Enabled', Expiration: { Days: 30 } },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add Rule
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLifecycleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveLifecycleRules} disabled={updateBucketMutation.isPending}>
              {updateBucketMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Routing Rules Editor */}
      <Dialog open={routingDialogOpen} onOpenChange={setRoutingDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Routing Rules</DialogTitle>
            <DialogDescription>
              Configure website redirect and rewrite rules. These are saved as part of the website
              access configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {routingRules.map((rule, i) => (
              <div key={i} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Rule {i + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setRoutingRules((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Condition</span>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Key Prefix</Label>
                      <Input
                        value={rule.Condition?.KeyPrefixEquals ?? ''}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          setRoutingRules((prev) =>
                            prev.map((r, j) =>
                              j === i
                                ? {
                                    ...r,
                                    Condition:
                                      val || r.Condition?.HttpErrorCodeReturnedEquals
                                        ? { ...r.Condition, KeyPrefixEquals: val }
                                        : undefined,
                                  }
                                : r,
                            ),
                          );
                        }}
                        placeholder="docs/"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">HTTP Error Code</Label>
                      <Input
                        type="number"
                        value={rule.Condition?.HttpErrorCodeReturnedEquals ?? ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : null;
                          setRoutingRules((prev) =>
                            prev.map((r, j) =>
                              j === i
                                ? {
                                    ...r,
                                    Condition:
                                      val != null || r.Condition?.KeyPrefixEquals
                                        ? { ...r.Condition, HttpErrorCodeReturnedEquals: val }
                                        : undefined,
                                  }
                                : r,
                            ),
                          );
                        }}
                        placeholder="404"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Redirect</span>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Host Name</Label>
                      <Input
                        value={rule.Redirect.HostName ?? ''}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          setRoutingRules((prev) =>
                            prev.map((r, j) =>
                              j === i ? { ...r, Redirect: { ...r.Redirect, HostName: val } } : r,
                            ),
                          );
                        }}
                        placeholder="example.com"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Protocol</Label>
                      <Select
                        value={rule.Redirect.Protocol ?? ''}
                        onValueChange={(val) =>
                          setRoutingRules((prev) =>
                            prev.map((r, j) =>
                              j === i
                                ? { ...r, Redirect: { ...r.Redirect, Protocol: val || null } }
                                : r,
                            ),
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="(unchanged)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="https">https</SelectItem>
                          <SelectItem value="http">http</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Replace Key Prefix With</Label>
                      <Input
                        value={rule.Redirect.ReplaceKeyPrefixWith ?? ''}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          setRoutingRules((prev) =>
                            prev.map((r, j) =>
                              j === i
                                ? { ...r, Redirect: { ...r.Redirect, ReplaceKeyPrefixWith: val } }
                                : r,
                            ),
                          );
                        }}
                        placeholder="new-prefix/"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">HTTP Redirect Code</Label>
                      <Input
                        type="number"
                        value={rule.Redirect.HttpRedirectCode ?? ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : null;
                          setRoutingRules((prev) =>
                            prev.map((r, j) =>
                              j === i
                                ? { ...r, Redirect: { ...r.Redirect, HttpRedirectCode: val } }
                                : r,
                            ),
                          );
                        }}
                        placeholder="301"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRoutingRules((prev) => [...prev, { Redirect: {} }])}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Rule
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoutingDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRoutingRules} disabled={updateBucketMutation.isPending}>
              {updateBucketMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
