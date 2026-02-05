import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart2,
  CheckCircle2,
  LayoutGrid,
  Layers,
  Server,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { api, proxyPath } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import type {
  GetClusterHealthResponse,
  GetClusterLayoutResponse,
  GetClusterStatisticsResponse,
  GetClusterStatusResponse,
  MultiNodeResponse,
  BlockErrorsResponse,
} from '@/types/garage';

interface ClusterOverviewProps {
  clusterId: string;
}

export function ClusterOverview({ clusterId }: ClusterOverviewProps) {
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

  const statusQuery = useQuery<GetClusterStatusResponse>({
    queryKey: ['clusterStatus', clusterId],
    queryFn: async () => {
      const res = await api.get<GetClusterStatusResponse>(
        proxyPath(clusterId, '/v2/GetClusterStatus'),
      );
      return res.data;
    },
    staleTime: 30000,
    refetchInterval: 30000,
  });

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
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      icon: CheckCircle2,
      label: 'Healthy',
      badge: 'success' as const,
    },
    degraded: {
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      icon: AlertTriangle,
      label: 'Degraded',
      badge: 'warning' as const,
    },
    unavailable: {
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      icon: XCircle,
      label: 'Unavailable',
      badge: 'destructive' as const,
    },
    unreachable: {
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      icon: XCircle,
      label: 'Unreachable',
      badge: 'destructive' as const,
    },
    unknown: {
      color: 'text-slate-600',
      bgColor: 'bg-slate-50',
      borderColor: 'border-slate-200',
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
  const hasStats = Boolean(stats?.freeform);

  return (
    <div className="space-y-6">
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
          <Badge variant={config.badge} className="text-sm px-3 py-1">
            {config.label}
          </Badge>
        </CardHeader>
        <CardContent className="relative z-10 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                <Activity className="h-4 w-4 text-slate-500" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Connected Nodes</div>
                <div className="font-semibold text-slate-900 tabular-nums">
                  {health ? `${health.connectedNodes}/${health.knownNodes}` : '-'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                <Server className="h-4 w-4 text-slate-500" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Storage Nodes</div>
                <div className="font-semibold text-slate-900 tabular-nums">
                  {health ? `${health.storageNodesUp}/${health.storageNodes}` : '-'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                <Layers className="h-4 w-4 text-slate-500" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Partitions OK</div>
                <div className="font-semibold text-slate-900 tabular-nums">
                  {health ? `${health.partitionsAllOk}/${health.partitions}` : '-'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                <ShieldCheck className="h-4 w-4 text-slate-500" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Quorum OK</div>
                <div className="font-semibold text-slate-900 tabular-nums">
                  {health ? `${health.partitionsQuorum}/${health.partitions}` : '-'}
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border bg-white px-2 py-1">
              Nodes up: {status ? nodesUp : '-'}
            </span>
            <span className="rounded-full border bg-white px-2 py-1">
              Nodes down: {status ? nodesDown : '-'}
            </span>
            <span className="rounded-full border bg-white px-2 py-1">
              Draining: {status ? nodesDraining : '-'}
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
              <div className="text-xl font-semibold">{hasLayout ? `v${layout?.version}` : '-'}</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Roles in Layout</div>
              <div className="text-xl font-semibold">{hasLayout ? layout?.roles?.length : '-'}</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Partition Size</div>
              <div className="text-xl font-semibold">
                {hasLayout ? formatBytes(layout?.partitionSize ?? 0) : '-'}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Pending Changes</div>
              <div className="text-xl font-semibold">
                {hasLayout ? layout?.stagedRoleChanges?.length ?? 0 : '-'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
            Cluster Statistics
          </CardTitle>
          <CardDescription>Raw statistics from the cluster</CardDescription>
        </CardHeader>
        <CardContent>
          {statsQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading statistics...</div>
          ) : (
            <pre className="text-xs leading-relaxed font-mono bg-slate-50 border border-slate-200 rounded-lg p-4 whitespace-pre overflow-auto max-h-[400px]">
              {hasStats ? stats?.freeform : 'No statistics available.'}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
