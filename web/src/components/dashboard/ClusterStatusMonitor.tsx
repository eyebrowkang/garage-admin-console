import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Server,
  Database,
  HardDrive,
  Activity,
  Pencil,
  Link2Off,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/format';
import type { ClusterSummary, GetClusterHealthResponse, GetClusterStatusResponse } from '@/types/garage';

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

export function ClusterStatusMonitor({
  clustersWithStatus,
  onEditCluster,
  onDeleteCluster,
}: ClusterStatusMonitorProps) {
  const problemClusters = clustersWithStatus.filter(
    (c) =>
      c.healthStatus === 'unavailable' ||
      c.healthStatus === 'unreachable' ||
      c.healthStatus === 'degraded',
  );
  const checkingClusters = clustersWithStatus.filter(
    (c) => c.healthStatus === 'unknown' || c.isLoading,
  );
  const healthyClusters = clustersWithStatus.filter((c) => c.healthStatus === 'healthy');

  const totalNodes = clustersWithStatus.reduce((sum, c) => {
    return sum + (c.status?.nodes?.length ?? 0);
  }, 0);

  const totalNodesUp = clustersWithStatus.reduce((sum, c) => {
    return sum + (c.status?.nodes?.filter((n) => n.isUp).length ?? 0);
  }, 0);

  if (clustersWithStatus.length === 0) {
    return null;
  }

  const hasProblems = problemClusters.length > 0;
  const hasChecking = checkingClusters.length > 0;

  const summary = hasProblems
    ? {
        title: `${problemClusters.length} Cluster${problemClusters.length > 1 ? 's' : ''} Need Attention`,
        description: `Issues detected in ${problemClusters.length} of ${clustersWithStatus.length} clusters`,
        icon: AlertTriangle,
        cardClass: 'border-red-200 bg-red-50/50',
        iconClass: 'bg-red-100 text-red-600',
        titleClass: 'text-red-900',
        stats: [
          { label: 'Issues', value: problemClusters.length, valueClass: 'text-red-900' },
          {
            label: 'Nodes Up',
            value: `${totalNodesUp}/${totalNodes}`,
            valueClass: 'text-slate-900',
          },
        ],
      }
    : hasChecking
      ? {
          title: 'Checking Cluster Health',
          description: `${checkingClusters.length} cluster${checkingClusters.length > 1 ? 's' : ''} still reporting.`,
          icon: Activity,
          cardClass: 'border-slate-200 bg-slate-50/60',
          iconClass: 'bg-slate-100 text-slate-600',
          titleClass: 'text-slate-900',
          stats: [
            { label: 'Checking', value: checkingClusters.length, valueClass: 'text-slate-900' },
            { label: 'Healthy', value: healthyClusters.length, valueClass: 'text-emerald-700' },
          ],
        }
      : {
          title: 'All Systems Operational',
          description: `${clustersWithStatus.length} clusters, ${totalNodes} nodes running smoothly`,
          icon: CheckCircle2,
          cardClass: 'border-green-200 bg-green-50/50',
          iconClass: 'bg-green-100 text-green-600',
          titleClass: 'text-green-900',
          stats: [
            { label: 'Clusters', value: clustersWithStatus.length, valueClass: 'text-green-900' },
            { label: 'Nodes', value: totalNodesUp, valueClass: 'text-green-900' },
          ],
        };

  const SummaryIcon = summary.icon;

  return (
    <div className="space-y-6">
      <Card className={summary.cardClass}>
        <CardContent className="py-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div
                className={`h-12 w-12 rounded-full flex items-center justify-center shrink-0 ${summary.iconClass}`}
              >
                <SummaryIcon className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h2 className={`text-xl font-bold leading-tight ${summary.titleClass}`}>
                  {summary.title}
                </h2>
                <p className="text-sm text-slate-600 mt-1">{summary.description}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm w-full sm:w-auto sm:flex sm:gap-6 sm:justify-end">
              {summary.stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className={`text-2xl font-bold tabular-nums ${stat.valueClass}`}>
                    {stat.value}
                  </div>
                  <div className="text-slate-600">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:[grid-template-columns:repeat(auto-fit,minmax(480px,1fr))]">
        {clustersWithStatus.map((item) => (
          <ClusterStatusCard
            key={item.cluster.id}
            item={item}
            onEdit={() => onEditCluster(item.cluster)}
            onDelete={() => onDeleteCluster(item.cluster)}
          />
        ))}
      </div>
    </div>
  );
}

interface ClusterStatusCardProps {
  item: ClusterWithStatus;
  onEdit: () => void;
  onDelete: () => void;
}

function ClusterStatusCard({ item, onEdit, onDelete }: ClusterStatusCardProps) {
  const { cluster, health, status, healthStatus, isLoading } = item;

  const statusConfig = {
    healthy: {
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      icon: CheckCircle2,
      label: 'Healthy',
    },
    degraded: {
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      icon: AlertTriangle,
      label: 'Degraded',
    },
    unavailable: {
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      icon: XCircle,
      label: 'Unavailable',
    },
    unreachable: {
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      icon: XCircle,
      label: 'Unreachable',
    },
    unknown: {
      color: 'text-slate-600',
      bgColor: 'bg-slate-50',
      borderColor: 'border-slate-200',
      icon: Activity,
      label: 'Checking',
    },
  };

  const config = statusConfig[healthStatus];
  const Icon = config.icon;
  const canNavigate = healthStatus === 'healthy';

  const nodes = status?.nodes ?? [];
  const nodesUp = nodes.filter((n) => n.isUp).length;
  const nodesDown = nodes.filter((n) => !n.isUp).length;
  const nodesDraining = nodes.filter((n) => n.draining).length;
  const problemNodes = nodes.filter((n) => !n.isUp || n.draining);

  const totalCapacity = nodes.reduce((sum, n) => sum + (n.role?.capacity ?? 0), 0);

  const dataPartitionUsed = nodes.reduce(
    (sum, n) => sum + (n.dataPartition ? n.dataPartition.total - n.dataPartition.available : 0),
    0,
  );
  const dataPartitionTotal = nodes.reduce((sum, n) => sum + (n.dataPartition?.total ?? 0), 0);

  const metadataPartitionUsed = nodes.reduce(
    (sum, n) =>
      sum + (n.metadataPartition ? n.metadataPartition.total - n.metadataPartition.available : 0),
    0,
  );
  const metadataPartitionTotal = nodes.reduce(
    (sum, n) => sum + (n.metadataPartition?.total ?? 0),
    0,
  );

  const statusMessage = (() => {
    if (healthStatus === 'healthy') {
      return nodes.length > 0 ? `${nodesUp}/${nodes.length} nodes online` : 'All checks passing';
    }
    if (healthStatus === 'unknown' || isLoading) {
      return 'Checking cluster health...';
    }
    if (healthStatus === 'unreachable') {
      return 'Unable to reach cluster health endpoint.';
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
      const nodesInfo = nodes.length
        ? `${nodesDown} down, ${nodesDraining} draining`
        : null;
      return [nodesInfo, parts].filter(Boolean).join(' • ') || 'Cluster degraded.';
    }
    return 'Status unavailable.';
  })();

  const hasMetrics = Boolean(health || status);
  const showDiagnostics =
    !hasMetrics &&
    (healthStatus === 'unreachable' || healthStatus === 'unavailable' || healthStatus === 'degraded');
  const shortId = cluster.id.length > 12 ? `${cluster.id.slice(0, 8)}…` : cluster.id;
  const emptyStateMessage =
    healthStatus === 'unreachable'
      ? 'Unable to reach the cluster health endpoint.'
      : healthStatus === 'unavailable'
        ? 'Cluster reported unavailable. Health metrics not returned.'
        : healthStatus === 'degraded'
          ? 'Cluster reported degraded. Waiting for detailed metrics.'
          : 'Health and node metrics are still loading.';

  return (
    <Card
      className={`${config.borderColor} ${
        healthStatus === 'degraded' || healthStatus === 'unavailable' || healthStatus === 'unreachable'
          ? 'shadow-md'
          : 'shadow-sm'
      } w-full max-w-[640px] h-[410px]`}
    >
      <CardContent className="p-5 h-full">
        <div className="flex h-full flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={`h-10 w-10 rounded-xl ${config.bgColor} flex items-center justify-center shrink-0`}
              >
                <Icon className={`h-5 w-5 ${config.color}`} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {canNavigate ? (
                    <Link
                      to={`/clusters/${cluster.id}`}
                      className="inline-block"
                    >
                      <h3 className="font-semibold text-slate-900 truncate transition-colors hover:text-primary">
                        {cluster.name}
                      </h3>
                    </Link>
                  ) : (
                    <span
                      className="font-semibold text-slate-500 cursor-not-allowed"
                      title="Cluster is unhealthy and cannot be opened"
                    >
                      {cluster.name}
                    </span>
                  )}
                  <Badge
                    variant={
                      healthStatus === 'healthy'
                        ? 'success'
                        : healthStatus === 'degraded'
                          ? 'warning'
                          : healthStatus === 'unavailable' || healthStatus === 'unreachable'
                            ? 'destructive'
                            : 'secondary'
                    }
                    className="text-xs"
                  >
                    {config.label}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground truncate">{cluster.endpoint}</div>
                <div className={`text-xs mt-1 ${config.color}`}>{statusMessage}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
              <Button variant="outline" size="sm" onClick={onEdit} className="w-full sm:w-auto">
                <Pencil className="h-4 w-4 mr-1" /> Edit
              </Button>
              <Button variant="destructive" size="sm" onClick={onDelete} className="w-full sm:w-auto">
                <Link2Off className="h-4 w-4 mr-1" /> Disconnect
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            {!hasMetrics && (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <div>{emptyStateMessage}</div>
                {showDiagnostics && (
                  <div className="mt-3 space-y-2 text-[11px] text-slate-500">
                    <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                      <span>Endpoint</span>
                      <span className="font-medium text-slate-700 truncate min-w-0">
                        {cluster.endpoint}
                      </span>
                    </div>
                    <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                      <span>Cluster ID</span>
                      <span className="font-mono text-slate-700">{shortId}</span>
                    </div>
                    <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                      <span>Health Check</span>
                      <span className="font-medium text-slate-700">/v2/GetClusterHealth</span>
                    </div>
                    <div>Auto-retrying every 30s.</div>
                  </div>
                )}
              </div>
            )}

            {hasMetrics && (
              <div className="space-y-4 h-full overflow-auto pr-1">
                {health && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
                    <div className="flex items-center justify-between p-2 rounded bg-slate-50">
                      <span className="text-slate-600">Partitions OK</span>
                      <span className="font-semibold text-slate-900 tabular-nums">
                        {health.partitionsAllOk}/{health.partitions}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-slate-50">
                      <span className="text-slate-600">Quorum OK</span>
                      <span className="font-semibold text-slate-900 tabular-nums">
                        {health.partitionsQuorum}/{health.partitions}
                      </span>
                    </div>
                  </div>
                )}

                {status && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-sm">
                    <div className="flex items-center gap-2 p-2 rounded bg-slate-50">
                      <Database className="h-4 w-4 text-slate-400" />
                      <span className="text-slate-600">Nodes</span>
                      <span className="ml-auto font-semibold text-slate-900 tabular-nums">
                        {nodesUp}/{nodes.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded bg-slate-50">
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span className="text-slate-600">Down</span>
                      <span className="ml-auto font-semibold text-slate-900 tabular-nums">
                        {nodesDown}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded bg-slate-50">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span className="text-slate-600">Draining</span>
                      <span className="ml-auto font-semibold text-slate-900 tabular-nums">
                        {nodesDraining}
                      </span>
                    </div>
                  </div>
                )}

                {totalCapacity > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-slate-600">
                        <HardDrive className="h-4 w-4" />
                        Configured Capacity
                      </div>
                      <span className="font-semibold text-slate-900 tabular-nums">
                        {formatBytes(totalCapacity)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground pl-6">
                      Total storage capacity configured for this cluster
                    </div>
                  </div>
                )}

                {dataPartitionTotal > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Data Partition</span>
                      <span className="font-semibold text-slate-900 tabular-nums">
                        {formatBytes(dataPartitionUsed)} / {formatBytes(dataPartitionTotal)}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all rounded-full"
                        style={{ width: `${(dataPartitionUsed / dataPartitionTotal) * 100}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {((dataPartitionUsed / dataPartitionTotal) * 100).toFixed(1)}% used
                    </div>
                  </div>
                )}

                {metadataPartitionTotal > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Metadata Partition</span>
                      <span className="font-semibold text-slate-900 tabular-nums">
                        {formatBytes(metadataPartitionUsed)} / {formatBytes(metadataPartitionTotal)}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 transition-all rounded-full"
                        style={{ width: `${(metadataPartitionUsed / metadataPartitionTotal) * 100}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {((metadataPartitionUsed / metadataPartitionTotal) * 100).toFixed(1)}% used
                    </div>
                  </div>
                )}

                {problemNodes.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Nodes with Issues ({problemNodes.length})
                    </div>
                    <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                      {problemNodes.map((node) => (
                        <div
                          key={node.id}
                          className="flex items-center justify-between p-2 rounded bg-red-50 border border-red-200 text-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Server className="h-3.5 w-3.5 text-red-600 shrink-0" />
                            <span className="text-xs truncate">{node.id.substring(0, 16)}...</span>
                          </div>
                          <Badge variant="destructive" className="text-xs shrink-0 ml-2">
                            {!node.isUp ? 'Down' : node.draining ? 'Draining' : 'Issue'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
