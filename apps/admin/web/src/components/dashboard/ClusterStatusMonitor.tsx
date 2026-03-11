import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle2, HardDrive, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DisconnectActionIcon, EditActionIcon, OpenActionIcon } from '@/lib/action-icons';
import { formatBytes } from '@/lib/format';
import { NodeIcon } from '@/lib/entity-icons';
import type {
  ClusterSummary,
  GetClusterHealthResponse,
  GetClusterStatusResponse,
} from '@/types/garage';

interface ClusterWithStatus {
  cluster: ClusterSummary;
  health?: GetClusterHealthResponse;
  status?: GetClusterStatusResponse;
  healthStatus: 'healthy' | 'degraded' | 'unavailable' | 'unreachable' | 'unknown';
  isLoading: boolean;
}

interface ClusterStatusMonitorProps {
  clustersWithStatus: ClusterWithStatus[];
  onEditCluster: (cluster: ClusterSummary) => void;
  onDeleteCluster: (cluster: ClusterSummary) => void;
}

const statusConfig = {
  healthy: {
    label: 'Healthy',
    icon: CheckCircle2,
    badge: 'success' as const,
    iconClass: 'text-green-600',
    bgClass: 'bg-green-50 border-green-200',
  },
  degraded: {
    label: 'Degraded',
    icon: AlertTriangle,
    badge: 'warning' as const,
    iconClass: 'text-violet-700',
    bgClass: 'bg-violet-50 border-violet-200',
  },
  unavailable: {
    label: 'Unavailable',
    icon: XCircle,
    badge: 'destructive' as const,
    iconClass: 'text-destructive',
    bgClass: 'bg-destructive/5 border-destructive/30',
  },
  unreachable: {
    label: 'Unreachable',
    icon: XCircle,
    badge: 'destructive' as const,
    iconClass: 'text-destructive',
    bgClass: 'bg-destructive/5 border-destructive/30',
  },
  unknown: {
    label: 'Checking',
    icon: Activity,
    badge: 'secondary' as const,
    iconClass: 'text-primary',
    bgClass: 'bg-primary/5 border-primary/25',
  },
};

function getPressurePercent(status?: GetClusterStatusResponse) {
  const nodes = status?.nodes ?? [];
  if (nodes.length === 0) return null;

  const zoneStats = new Map<
    string,
    { capacity: number; dataUsed: number; dataTotal: number; metaUsed: number; metaTotal: number }
  >();

  for (const node of nodes) {
    const zone = node.role?.zone ?? 'unknown';
    const entry = zoneStats.get(zone) ?? {
      capacity: 0,
      dataUsed: 0,
      dataTotal: 0,
      metaUsed: 0,
      metaTotal: 0,
    };

    if (node.role?.capacity) entry.capacity += node.role.capacity;

    if (node.dataPartition) {
      entry.dataTotal += node.dataPartition.total;
      entry.dataUsed += node.dataPartition.total - node.dataPartition.available;
    }

    if (node.metadataPartition) {
      entry.metaTotal += node.metadataPartition.total;
      entry.metaUsed += node.metadataPartition.total - node.metadataPartition.available;
    }

    zoneStats.set(zone, entry);
  }

  const minZone = Array.from(zoneStats.values())
    .filter((entry) => entry.capacity > 0)
    .sort((a, b) => a.capacity - b.capacity)[0];

  if (!minZone) return null;

  const dataRatio = minZone.dataTotal > 0 ? minZone.dataUsed / minZone.dataTotal : 0;
  const metaRatio = minZone.metaTotal > 0 ? minZone.metaUsed / minZone.metaTotal : 0;

  return Math.max(dataRatio, metaRatio) * 100;
}

function getStatusMessage(item: ClusterWithStatus) {
  const nodes = item.status?.nodes ?? [];
  const nodesUp = nodes.filter((node) => node.isUp).length;

  if (item.healthStatus === 'healthy') {
    return nodes.length > 0 ? `${nodesUp}/${nodes.length} nodes online` : 'All checks passing';
  }
  if (item.healthStatus === 'unknown' || item.isLoading) return 'Checking cluster health...';
  if (item.healthStatus === 'unreachable') return 'Unable to reach health endpoint.';
  if (item.healthStatus === 'degraded') return 'Cluster degraded. Review details in cluster page.';
  return 'Cluster reports unavailable health.';
}

export function ClusterStatusMonitor({
  clustersWithStatus,
  onEditCluster,
  onDeleteCluster,
}: ClusterStatusMonitorProps) {
  if (clustersWithStatus.length === 0) return null;

  const healthy = clustersWithStatus.filter((item) => item.healthStatus === 'healthy').length;
  const warning = clustersWithStatus.filter((item) => item.healthStatus === 'degraded').length;
  const error = clustersWithStatus.filter(
    (item) => item.healthStatus === 'unavailable' || item.healthStatus === 'unreachable',
  ).length;
  const checking = clustersWithStatus.filter((item) => item.healthStatus === 'unknown').length;
  const totalNodes = clustersWithStatus.reduce(
    (sum, item) => sum + (item.status?.nodes?.length ?? 0),
    0,
  );
  const nodesUp = clustersWithStatus.reduce(
    (sum, item) => sum + (item.status?.nodes?.filter((node) => node.isUp).length ?? 0),
    0,
  );

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="grid gap-4 p-4 sm:p-5 md:grid-cols-5">
          <div className="md:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wider text-primary/70">Overview</p>
            <h2 className="mt-0.5 text-lg sm:text-xl font-semibold">Cluster Fleet Summary</h2>
            <p className="mt-1 text-sm text-muted-foreground hidden sm:block">
              Top-level health and capacity indicators for all connected clusters.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 text-sm md:col-span-3 md:grid-cols-4">
            <div className="rounded-lg border bg-card px-3 py-2">
              <div className="text-xs text-muted-foreground">Healthy</div>
              <div className="text-lg font-semibold text-green-700">{healthy}</div>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <div className="text-xs text-muted-foreground">Warnings</div>
              <div className="text-lg font-semibold text-violet-700">{warning}</div>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <div className="text-xs text-muted-foreground">Errors</div>
              <div className="text-lg font-semibold text-destructive">{error}</div>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <div className="text-xs text-muted-foreground">Nodes Up</div>
              <div className="text-lg font-semibold">
                {nodesUp}/{totalNodes}
              </div>
              {checking > 0 && (
                <div className="text-xs text-muted-foreground">Checking: {checking}</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {clustersWithStatus.map((item) => {
          const config = statusConfig[item.healthStatus];
          const StatusIcon = config.icon;
          const nodes = item.status?.nodes ?? [];
          const up = nodes.filter((node) => node.isUp).length;
          const pressure = getPressurePercent(item.status);
          const pressureVariant =
            pressure === null
              ? 'secondary'
              : pressure >= 85
                ? 'destructive'
                : pressure >= 70
                  ? 'warning'
                  : 'success';
          const capacityValues = nodes
            .map((node) => node.role?.capacity)
            .filter(
              (value): value is number => typeof value === 'number' && Number.isFinite(value),
            );
          const minCapacity = capacityValues.length > 0 ? Math.min(...capacityValues) : null;

          return (
            <Card
              key={item.cluster.id}
              className={`border ${config.bgClass} transition-shadow hover:shadow-md`}
            >
              <CardContent className="space-y-3 p-4 sm:p-5">
                {/* Header row: name + status badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={`/clusters/${item.cluster.id}`}
                      className="inline-flex items-center gap-2 text-base font-semibold hover:text-primary transition-colors"
                    >
                      {item.cluster.name}
                    </Link>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.cluster.endpoint}
                    </div>
                  </div>
                  <Badge variant={config.badge} className="shrink-0">
                    <StatusIcon className={`mr-1 h-3.5 w-3.5 ${config.iconClass}`} />
                    {config.label}
                  </Badge>
                </div>

                {/* Metrics row */}
                <div className="grid gap-2 grid-cols-3">
                  <div className="rounded-lg border bg-card p-2">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <NodeIcon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Nodes</span>
                    </div>
                    <div className="text-sm font-semibold">
                      {nodes.length > 0 ? `${up}/${nodes.length}` : '-'}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-card p-2">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Activity className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Partitions</span>
                    </div>
                    <div className="text-sm font-semibold">
                      {item.health
                        ? `${item.health.partitionsAllOk}/${item.health.partitions}`
                        : '-'}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-card p-2">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <HardDrive className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Pressure</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold">
                        {pressure === null ? '-' : `${pressure.toFixed(0)}%`}
                      </span>
                      <Badge variant={pressureVariant} className="text-[10px] px-1.5 py-0">
                        {pressure === null
                          ? 'N/A'
                          : pressure >= 85
                            ? 'High'
                            : pressure >= 70
                              ? 'Med'
                              : 'Low'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Status line + capacity */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{getStatusMessage(item)}</span>
                  {item.status?.nodes && item.status.nodes.length > 0 && minCapacity !== null && (
                    <>
                      <span className="text-border">|</span>
                      <span>
                        Min zone capacity:{' '}
                        <span className="font-medium text-foreground">
                          {formatBytes(minCapacity)}
                        </span>
                      </span>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <Button asChild size="sm" className="h-9">
                    <Link to={`/clusters/${item.cluster.id}`}>
                      <OpenActionIcon className="mr-2 h-4 w-4" />
                      Open
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => onEditCluster(item.cluster)}
                  >
                    <EditActionIcon className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onDeleteCluster(item.cluster)}
                  >
                    <DisconnectActionIcon className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Disconnect</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
