import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Globe,
  LayoutGrid,
  Layers,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Alert,
  AlertDescription,
  AlertTitle,
  Meter,
  type MeterTone,
  TerminalOutput,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Label,
} from '@garage/ui';
import { ModulePageHeader } from '@garage/ui';
import { useClusterContext } from '@/contexts/ClusterContext';
import { useNodes } from '@/hooks/useNodes';
import { api, proxyPath } from '@/lib/api';
import { formatBytes, formatNum, getApiErrorMessage } from '@garage/web-shared';
import { NodeIcon } from '@/lib/entity-icons';
import type {
  GetClusterHealthResponse,
  GetClusterLayoutResponse,
  GetClusterStatisticsResponse,
  MultiNodeResponse,
  BlockErrorsResponse,
} from '@/types/garage';

/** Ratio → fill percent + health tone for the inline health meters. */
function ratio(num?: number, den?: number): { pct: number; tone: MeterTone } {
  if (!den || den <= 0) return { pct: 0, tone: 'neutral' };
  const pct = Math.max(0, Math.min(100, Math.round(((num ?? 0) / den) * 100)));
  const tone: MeterTone = pct >= 100 ? 'success' : pct >= 50 ? 'warning' : 'destructive';
  return { pct, tone };
}

export function ClusterOverview() {
  const { clusterId } = useClusterContext();

  // Domain check — Garage's `/check` special endpoint answers whether a
  // website-enabled bucket in THIS cluster serves a given domain (200 = yes,
  // 400 = no). It's a previously-missing convenience for verifying static-site
  // routing without leaving the console.
  const [checkOpen, setCheckOpen] = useState(false);
  const [domain, setDomain] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<
    { kind: 'managed' } | { kind: 'unmanaged' } | { kind: 'error'; message: string } | null
  >(null);

  const runDomainCheck = async () => {
    const value = domain.trim();
    if (!value) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await api.get(proxyPath(clusterId, '/check'), {
        params: { domain: value },
        // 200 and 400 are both expected answers, not failures — read the status.
        validateStatus: (s) => s === 200 || s === 400,
      });
      setCheckResult({ kind: res.status === 200 ? 'managed' : 'unmanaged' });
    } catch (err) {
      setCheckResult({ kind: 'error', message: getApiErrorMessage(err, 'Domain check failed.') });
    } finally {
      setChecking(false);
    }
  };

  const healthQuery = useQuery<GetClusterHealthResponse>({
    queryKey: ['clusterHealth', clusterId],
    queryFn: async () => {
      const res = await api.get<GetClusterHealthResponse>(
        proxyPath(clusterId, '/v2/GetClusterHealth'),
      );
      return res.data;
    },
    staleTime: 30000,
    refetchInterval: 30000,
  });

  const layoutQuery = useQuery<GetClusterLayoutResponse>({
    queryKey: ['clusterLayout', clusterId],
    queryFn: async () => {
      const res = await api.get<GetClusterLayoutResponse>(
        proxyPath(clusterId, '/v2/GetClusterLayout'),
      );
      return res.data;
    },
  });

  const statsQuery = useQuery<GetClusterStatisticsResponse>({
    queryKey: ['clusterStats', clusterId],
    queryFn: async () => {
      const res = await api.get<GetClusterStatisticsResponse>(
        proxyPath(clusterId, '/v2/GetClusterStatistics'),
      );
      return res.data;
    },
  });

  const statusQuery = useNodes(clusterId);

  // Fetch block errors to show alert if any exist
  const blockErrorsQuery = useQuery<MultiNodeResponse<BlockErrorsResponse>>({
    queryKey: ['blockErrors', clusterId, '*'],
    queryFn: async () => {
      const res = await api.get<MultiNodeResponse<BlockErrorsResponse>>(
        proxyPath(clusterId, '/v2/ListBlockErrors?node=*'),
      );
      return res.data;
    },
    staleTime: 60000,
  });

  const health = healthQuery.data;
  const layout = layoutQuery.data;
  const stats = statsQuery.data;
  const status = statusQuery.data;

  // Calculate block errors count
  let blockErrorCount = 0;
  if (blockErrorsQuery.data?.success) {
    for (const nodeData of Object.values(blockErrorsQuery.data.success)) {
      blockErrorCount += nodeData.blockErrors?.length || 0;
    }
  }

  const statusConfig = {
    healthy: {
      color: 'text-success',
      bgColor: 'bg-success/10',
      borderColor: 'border-success/30',
      icon: CheckCircle2,
      label: 'Healthy',
      badge: 'success' as const,
    },
    degraded: {
      color: 'text-warning',
      bgColor: 'bg-warning/10',
      borderColor: 'border-warning/30',
      icon: AlertTriangle,
      label: 'Degraded',
      badge: 'warning' as const,
    },
    unavailable: {
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
      borderColor: 'border-destructive/30',
      icon: XCircle,
      label: 'Unavailable',
      badge: 'destructive' as const,
    },
    unreachable: {
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
      borderColor: 'border-destructive/30',
      icon: XCircle,
      label: 'Unreachable',
      badge: 'destructive' as const,
    },
    unknown: {
      color: 'text-muted-foreground',
      bgColor: 'bg-muted',
      borderColor: 'border-border',
      icon: Activity,
      label: 'Checking',
      badge: 'secondary' as const,
    },
  };

  type HealthStatusKey = keyof typeof statusConfig;
  const rawHealthStatus = health?.status ?? '';
  const isKnownStatus = (value: string): value is HealthStatusKey => value in statusConfig;
  const healthStatus: HealthStatusKey = isKnownStatus(rawHealthStatus)
    ? rawHealthStatus
    : healthQuery.error
      ? 'unreachable'
      : healthQuery.isLoading
        ? 'unknown'
        : 'unknown';
  const config = statusConfig[healthStatus];
  const StatusIcon = config.icon;

  const nodes = status?.nodes ?? [];
  const nodesUp = nodes.filter((n) => n.isUp).length;
  const nodesDown = nodes.filter((n) => !n.isUp).length;
  const nodesDraining = nodes.filter((n) => n.draining).length;

  const statusMessage = (() => {
    if (healthStatus === 'healthy') {
      return nodes.length > 0 ? `${nodesUp}/${nodes.length} nodes online` : 'All checks passing';
    }
    if (healthStatus === 'unknown' || healthQuery.isLoading) {
      return 'Checking cluster health...';
    }
    if (healthStatus === 'unreachable') {
      return 'Unable to reach the cluster health endpoint.';
    }
    if (healthStatus === 'unavailable') {
      if (health?.partitions) {
        return `Partitions OK ${health.partitionsAllOk}/${health.partitions}`;
      }
      return 'Cluster unavailable. Some checks failed.';
    }
    if (healthStatus === 'degraded') {
      const parts = health?.partitions
        ? `Partitions OK ${health.partitionsAllOk}/${health.partitions}`
        : null;
      const nodesInfo = nodes.length ? `${nodesDown} down, ${nodesDraining} draining` : null;
      return [nodesInfo, parts].filter(Boolean).join(' • ') || 'Cluster degraded.';
    }
    return 'Status unavailable.';
  })();

  const hasLayout = Boolean(layout);

  const connectedRatio = ratio(health?.connectedNodes, health?.knownNodes);
  const storageRatio = ratio(health?.storageNodesUp, health?.storageNodes);
  const partitionsRatio = ratio(health?.partitionsAllOk, health?.partitions);
  const quorumRatio = ratio(health?.partitionsQuorum, health?.partitions);

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="Overview"
        description="Cluster-wide health, layout status, and statistics at a glance."
        actions={
          <Button variant="outline" onClick={() => setCheckOpen(true)}>
            <Globe className="h-4 w-4" />
            Check Domain
          </Button>
        }
      />

      {/* Block Errors Alert */}
      {blockErrorCount > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Block Errors Detected</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              {blockErrorCount} block error(s) require attention. This may indicate data corruption
              or synchronization issues.
            </span>
            <Link to={`/clusters/${clusterId}/blocks`}>
              <Button variant="outline" size="sm">
                View Blocks
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {(healthQuery.error || layoutQuery.error || statsQuery.error || statusQuery.error) && (
        <Alert variant="destructive">
          <AlertTitle>Cluster data unavailable</AlertTitle>
          <AlertDescription>
            {healthQuery.error && getApiErrorMessage(healthQuery.error, 'Failed to load health.')}
            {statusQuery.error &&
              ` ${getApiErrorMessage(statusQuery.error, 'Failed to load nodes status.')}`}
            {layoutQuery.error &&
              ` ${getApiErrorMessage(layoutQuery.error, 'Failed to load layout.')}`}
            {statsQuery.error &&
              ` ${getApiErrorMessage(statsQuery.error, 'Failed to load statistics.')}`}
          </AlertDescription>
        </Alert>
      )}

      <Card className={`relative overflow-hidden ${config.borderColor}`}>
        <div
          className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full ${config.bgColor} opacity-60 blur-2xl`}
        />
        <CardHeader className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4 min-w-0">
            <div
              className={`h-12 w-12 rounded-xl ${config.bgColor} flex items-center justify-center shrink-0`}
            >
              <StatusIcon className={`h-5 w-5 ${config.color}`} />
            </div>
            <div className="space-y-1 min-w-0">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Cluster Health
              </div>
              <CardTitle className="text-2xl">{config.label}</CardTitle>
              <CardDescription>{statusMessage}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative z-10 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                {
                  icon: Activity,
                  label: 'Connected Nodes',
                  value: health ? `${health.connectedNodes}/${health.knownNodes}` : '—',
                  r: connectedRatio,
                },
                {
                  icon: NodeIcon,
                  label: 'Storage Nodes',
                  value: health ? `${health.storageNodesUp}/${health.storageNodes}` : '—',
                  r: storageRatio,
                },
                {
                  icon: Layers,
                  label: 'Partitions OK',
                  value: health ? `${health.partitionsAllOk}/${health.partitions}` : '—',
                  r: partitionsRatio,
                },
                {
                  icon: ShieldCheck,
                  label: 'Quorum OK',
                  value: health ? `${health.partitionsQuorum}/${health.partitions}` : '—',
                  r: quorumRatio,
                },
              ] as const
            ).map(({ icon: Icon, label, value, r }) => (
              <div key={label} className="space-y-2 rounded-lg bg-muted px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card shadow-sm">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="font-semibold tabular-nums text-foreground">{value}</div>
                  </div>
                  {health && (
                    <div className="text-xs font-medium tabular-nums text-muted-foreground">
                      {r.pct}%
                    </div>
                  )}
                </div>
                <Meter
                  value={health ? r.pct : 0}
                  tone={health ? r.tone : 'neutral'}
                  ariaLabel={label}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border bg-card px-2 py-1">
              Nodes up: {status ? nodesUp : '—'}
            </span>
            <span className="rounded-full border bg-card px-2 py-1">
              Nodes down: {status ? nodesDown : '—'}
            </span>
            <span className="rounded-full border bg-card px-2 py-1">
              Draining: {status ? nodesDraining : '—'}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            Layout Summary
          </CardTitle>
          <CardDescription>Current cluster layout settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Layout Version</div>
              <div className="text-xl font-semibold">{hasLayout ? `v${layout?.version}` : '—'}</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Roles in Layout</div>
              <div className="text-xl font-semibold">{hasLayout ? layout?.roles?.length : '—'}</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Partition Size</div>
              <div className="text-xl font-semibold">
                {hasLayout ? formatBytes(layout?.partitionSize ?? 0) : '—'}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Staged Changes</div>
              <div className="text-xl font-semibold">
                {hasLayout
                  ? (layout?.stagedRoleChanges?.length ?? 0) + (layout?.stagedParameters ? 1 : 0)
                  : '—'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cluster statistics — structured cards when v2.3.0 fields are present,
          with the freeform CLI output always available underneath. */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Cluster Statistics</h2>
          <span className="text-xs text-muted-foreground">
            {stats?.bucketCount != null ? 'Structured + raw output' : 'Raw output from the cluster'}
          </span>
        </div>

        {stats?.bucketCount != null && (
          <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-5">
            {(
              [
                { label: 'Buckets', value: formatNum(stats.bucketCount ?? 0) },
                { label: 'Total Objects', value: formatNum(stats.totalObjectCount ?? 0) },
                {
                  label: 'Total Object Size',
                  value: formatBytes(stats.totalObjectBytes ?? 0),
                  hint: 'Before compression, dedup & replication',
                },
                { label: 'Data Space Available', value: formatBytes(stats.dataAvail ?? 0) },
                { label: 'Metadata Space Available', value: formatBytes(stats.metadataAvail ?? 0) },
              ] as { label: string; value: string; hint?: string }[]
            ).map(({ label, value, hint }) => (
              <div key={label} className="bg-card px-4 py-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-lg font-semibold tabular-nums">{value}</div>
                {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
              </div>
            ))}
            {stats.incompleteAvailInfo && (
              <div className="col-span-full flex items-center gap-2 bg-card px-4 py-2 text-xs text-warning">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Available space may be lower than reported — some nodes are disconnected.
              </div>
            )}
          </div>
        )}

        {stats?.bucketCount != null ? (
          <details className="group">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Raw output
            </summary>
            <div className="mt-2">
              <TerminalOutput
                command="garage stats"
                content={stats.freeform}
                onRefresh={() => statsQuery.refetch()}
                refreshing={statsQuery.isFetching}
              />
            </div>
          </details>
        ) : (
          <TerminalOutput
            command="garage stats"
            content={stats?.freeform ?? ''}
            onRefresh={() => statsQuery.refetch()}
            refreshing={statsQuery.isFetching}
            loading={statsQuery.isLoading}
            loadingLabel="Fetching cluster statistics…"
            emptyLabel="No statistics available."
          />
        )}
      </div>

      <Dialog
        open={checkOpen}
        onOpenChange={(open) => {
          setCheckOpen(open);
          if (!open) setCheckResult(null);
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Check domain</DialogTitle>
            <DialogDescription>
              Check whether a website-enabled bucket in this cluster serves a given domain — useful
              for verifying static-site routing before pointing DNS or a reverse proxy at it.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runDomainCheck();
            }}
          >
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="check-domain">Domain</Label>
                <Input
                  id="check-domain"
                  placeholder="files.example.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  autoComplete="off"
                  autoFocus
                />
              </div>
              {checkResult && (
                <div
                  className={
                    checkResult.kind === 'managed'
                      ? 'flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success'
                      : checkResult.kind === 'error'
                        ? 'flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'
                        : 'flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground'
                  }
                >
                  {checkResult.kind === 'managed' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : checkResult.kind === 'error' ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <span>
                    {checkResult.kind === 'managed' &&
                      'A website-enabled bucket in this cluster serves this domain.'}
                    {checkResult.kind === 'unmanaged' &&
                      'No website-enabled bucket in this cluster serves this domain.'}
                    {checkResult.kind === 'error' && checkResult.message}
                  </span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCheckOpen(false)}>
                Close
              </Button>
              <Button type="submit" disabled={!domain.trim() || checking}>
                {checking ? 'Checking…' : 'Check'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
