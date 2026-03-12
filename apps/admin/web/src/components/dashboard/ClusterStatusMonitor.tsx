import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Badge, Button, Card, CardContent } from '@garage-admin/ui';
import { DisconnectActionIcon, EditActionIcon, OpenActionIcon } from '@/lib/action-icons';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';
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
    iconClass: 'text-success',
    borderClass: 'border-success-border/80',
  },
  degraded: {
    label: 'Degraded',
    icon: AlertTriangle,
    badge: 'warning' as const,
    iconClass: 'text-warning',
    borderClass: 'border-warning-border/80',
  },
  unavailable: {
    label: 'Unavailable',
    icon: XCircle,
    badge: 'destructive' as const,
    iconClass: 'text-destructive',
    borderClass: 'border-destructive/30',
  },
  unreachable: {
    label: 'Unreachable',
    icon: XCircle,
    badge: 'destructive' as const,
    iconClass: 'text-destructive',
    borderClass: 'border-destructive/30',
  },
  unknown: {
    label: 'Checking',
    icon: Activity,
    badge: 'secondary' as const,
    iconClass: 'text-primary',
    borderClass: 'border-primary/25',
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

function SummaryMetric({
  label,
  value,
  toneClass,
  detail,
}: {
  label: string;
  value: string | number;
  toneClass?: string;
  detail?: string;
}) {
  return (
    <div className="space-y-1 border-l border-border/60 pl-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className={cn('text-xl font-semibold leading-none tracking-tight', toneClass)}>
        {value}
      </div>
      {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
    </div>
  );
}

function ClusterMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-base font-semibold tracking-tight text-foreground">{value}</dd>
      {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
    </div>
  );
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
  const clusterCount = clustersWithStatus.length;
  const clusterCountLabel = `${clusterCount} connected cluster${clusterCount === 1 ? '' : 's'}`;
  const totalNodes = clustersWithStatus.reduce(
    (sum, item) => sum + (item.status?.nodes?.length ?? 0),
    0,
  );
  const nodesUp = clustersWithStatus.reduce(
    (sum, item) => sum + (item.status?.nodes?.filter((node) => node.isUp).length ?? 0),
    0,
  );
  const clusterGridClass = clusterCount > 1 ? 'md:grid-cols-2' : 'grid-cols-1';
  const isSingleCluster = clusterCount === 1;

  return (
    <div className="space-y-4">
      <Card className="border-border/60 bg-card/60 shadow-none">
        <CardContent className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Fleet status
            </p>
            <h2 className="text-lg font-semibold tracking-tight">{clusterCountLabel}</h2>
            <p className="text-sm text-muted-foreground">
              {isSingleCluster
                ? 'Open the cluster for buckets, keys, and layout work.'
                : 'Scan fleet health here, then open a cluster for deeper diagnostics.'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:flex lg:flex-wrap lg:justify-end lg:gap-6">
            <SummaryMetric label="Healthy" value={healthy} toneClass="text-success" />
            <SummaryMetric label="Warnings" value={warning} toneClass="text-warning" />
            <SummaryMetric label="Errors" value={error} toneClass="text-destructive" />
            <SummaryMetric
              label="Nodes up"
              value={`${nodesUp}/${totalNodes}`}
              detail={checking > 0 ? `Checking ${checking}` : undefined}
            />
          </div>
        </CardContent>
      </Card>

      <div
        role="list"
        aria-label="Cluster status cards"
        className={cn('grid gap-4', clusterGridClass)}
      >
        {clustersWithStatus.map((item) => {
          const config = statusConfig[item.healthStatus];
          const StatusIcon = config.icon;
          const nodes = item.status?.nodes ?? [];
          const up = nodes.filter((node) => node.isUp).length;
          const pressure = getPressurePercent(item.status);
          const capacityValues = nodes
            .map((node) => node.role?.capacity)
            .filter(
              (value): value is number => typeof value === 'number' && Number.isFinite(value),
            );
          const minCapacity = capacityValues.length > 0 ? Math.min(...capacityValues) : null;

          return (
            <div key={item.cluster.id} role="listitem">
              <Card
                className={cn(
                  'border bg-card transition-shadow hover:shadow-md',
                  config.borderClass,
                  isSingleCluster && 'rounded-2xl',
                )}
              >
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <Link
                        to={`/clusters/${item.cluster.id}`}
                        className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight transition-colors hover:text-primary"
                      >
                        {item.cluster.name}
                      </Link>
                      <div className="truncate text-sm text-muted-foreground">
                        {item.cluster.endpoint}
                      </div>
                    </div>
                    <Badge variant={config.badge} className="shrink-0">
                      <StatusIcon className={`mr-1 h-3.5 w-3.5 ${config.iconClass}`} />
                      {config.label}
                    </Badge>
                  </div>

                  <dl className="grid gap-4 border-y border-border/60 py-4 sm:grid-cols-3">
                    <ClusterMetric
                      label="Nodes"
                      value={nodes.length > 0 ? `${up}/${nodes.length}` : '-'}
                      detail={nodes.length > 0 ? `${up} online` : 'No node data yet'}
                    />
                    <ClusterMetric
                      label="Partitions OK"
                      value={
                        item.health
                          ? `${item.health.partitionsAllOk}/${item.health.partitions}`
                          : '-'
                      }
                      detail={item.health ? 'Health endpoint snapshot' : 'Waiting for health data'}
                    />
                    <ClusterMetric
                      label="Pressure"
                      value={pressure === null ? 'N/A' : `${pressure.toFixed(0)}%`}
                      detail={
                        pressure === null
                          ? 'No capacity data yet'
                          : pressure >= 85
                            ? 'High'
                            : pressure >= 70
                              ? 'Medium'
                              : 'Low'
                      }
                    />
                  </dl>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span>{getStatusMessage(item)}</span>
                    {item.status?.nodes && item.status.nodes.length > 0 && minCapacity !== null && (
                      <>
                        <span className="hidden text-border sm:inline">•</span>
                        <span>
                          Min zone capacity{' '}
                          <span className="font-medium text-foreground">
                            {formatBytes(minCapacity)}
                          </span>
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button asChild size="sm">
                        <Link to={`/clusters/${item.cluster.id}`}>
                          <OpenActionIcon className="h-4 w-4" />
                          Open Cluster
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEditCluster(item.cluster)}
                      >
                        <EditActionIcon className="h-4 w-4" />
                        Edit
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:justify-center"
                      onClick={() => onDeleteCluster(item.cluster)}
                    >
                      <DisconnectActionIcon className="h-4 w-4" />
                      Disconnect
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
