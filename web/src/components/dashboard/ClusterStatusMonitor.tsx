import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Server,
  Database,
  HardDrive,
  Activity,
  ExternalLink,
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
}

export function ClusterStatusMonitor({ clustersWithStatus }: ClusterStatusMonitorProps) {
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());

  const problemClusters = clustersWithStatus.filter(
    (c) =>
      c.healthStatus === 'unavailable' ||
      c.healthStatus === 'unreachable' ||
      c.healthStatus === 'degraded'
  );
  const healthyClusters = clustersWithStatus.filter((c) => c.healthStatus === 'healthy');
  const unknownClusters = clustersWithStatus.filter((c) => c.healthStatus === 'unknown');

  const totalNodes = clustersWithStatus.reduce((sum, c) => {
    return sum + (c.status?.nodes?.length ?? 0);
  }, 0);

  const totalNodesUp = clustersWithStatus.reduce((sum, c) => {
    return sum + (c.status?.nodes?.filter((n) => n.isUp).length ?? 0);
  }, 0);

  const toggleExpand = (clusterId: string) => {
    setExpandedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        next.add(clusterId);
      }
      return next;
    });
  };

  const isExpanded = (clusterId: string, hasProblems: boolean) => {
    return expandedClusters.has(clusterId) ?? hasProblems;
  };

  if (clustersWithStatus.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {problemClusters.length === 0 ? (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-green-900">All Systems Operational</h2>
                <p className="text-green-700 text-sm mt-1">
                  {clustersWithStatus.length} clusters, {totalNodes} nodes running smoothly
                </p>
              </div>
              <div className="flex gap-6 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-900">{clustersWithStatus.length}</div>
                  <div className="text-green-700">Clusters</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-900">{totalNodesUp}</div>
                  <div className="text-green-700">Nodes</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center animate-pulse">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-red-900">
                  {problemClusters.length} Cluster{problemClusters.length > 1 ? 's' : ''} Need
                  Attention
                </h2>
                <p className="text-red-700 text-sm mt-1">
                  Issues detected in {problemClusters.length} of {clustersWithStatus.length} clusters
                </p>
              </div>
              <div className="flex gap-6 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-900">{problemClusters.length}</div>
                  <div className="text-red-700">Issues</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-slate-900">
                    {totalNodesUp}/{totalNodes}
                  </div>
                  <div className="text-slate-700">Nodes Up</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {problemClusters.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            Clusters with Issues
          </h3>
          {problemClusters.map((item) => (
            <ClusterStatusCard
              key={item.cluster.id}
              item={item}
              isExpanded={isExpanded(item.cluster.id, true)}
              onToggleExpand={toggleExpand}
              variant="problem"
            />
          ))}
        </div>
      )}

      {healthyClusters.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            Healthy Clusters ({healthyClusters.length})
          </h3>
          <div className="space-y-2">
            {healthyClusters.map((item) => (
              <ClusterStatusCard
                key={item.cluster.id}
                item={item}
                isExpanded={isExpanded(item.cluster.id, false)}
                onToggleExpand={toggleExpand}
                variant="healthy"
              />
            ))}
          </div>
        </div>
      )}

      {unknownClusters.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Activity className="h-4 w-4 text-slate-600" />
            Loading ({unknownClusters.length})
          </h3>
          <div className="space-y-2">
            {unknownClusters.map((item) => (
              <ClusterStatusCard
                key={item.cluster.id}
                item={item}
                isExpanded={false}
                onToggleExpand={toggleExpand}
                variant="unknown"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ClusterStatusCardProps {
  item: ClusterWithStatus;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  variant: 'problem' | 'healthy' | 'unknown';
}

function ClusterStatusCard({ item, isExpanded, onToggleExpand, variant }: ClusterStatusCardProps) {
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
      label: 'Loading...',
    },
  };

  const config = statusConfig[healthStatus];
  const Icon = config.icon;

  const nodes = status?.nodes ?? [];
  const nodesUp = nodes.filter((n) => n.isUp).length;
  const nodesDown = nodes.filter((n) => !n.isUp).length;
  const nodesDraining = nodes.filter((n) => n.draining).length;
  const problemNodes = nodes.filter((n) => !n.isUp || n.draining);
  const totalCapacity = nodes.reduce((sum, n) => sum + (n.role?.capacity ?? 0), 0);
  const totalUsed = nodes.reduce(
    (sum, n) =>
      sum + (n.dataPartition ? n.dataPartition.total - n.dataPartition.available : 0),
    0
  );

  return (
    <Card className={`${config.borderColor} ${variant === 'problem' ? 'shadow-md' : ''} transition-all`}>
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button
                onClick={() => onToggleExpand(cluster.id)}
                className="hover:bg-slate-100 rounded p-1 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-slate-600" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-600" />
                )}
              </button>
              <div className={`h-8 w-8 rounded-lg ${config.bgColor} flex items-center justify-center shrink-0`}>
                <Icon className={`h-4 w-4 ${config.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-slate-900 truncate">{cluster.name}</h4>
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
                    className="text-xs shrink-0"
                  >
                    {config.label}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground truncate">{cluster.endpoint}</div>
              </div>
            </div>

            <div className="flex items-center gap-4 ml-4">
              {!isLoading && health && (
                <div className="hidden sm:flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Database className="h-4 w-4 text-slate-400" />
                    <span className="font-medium">
                      {nodesUp}/{nodes.length}
                    </span>
                  </div>
                  {health.partitionsAllOk !== health.partitions && (
                    <div className="flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">
                        {health.partitionsAllOk}/{health.partitions}
                      </span>
                    </div>
                  )}
                </div>
              )}
              <Link to={`/clusters/${cluster.id}`}>
                <Button variant="ghost" size="sm" className="h-8">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>

          {isExpanded && !isLoading && (
            <div className="pt-3 border-t space-y-3">
              {health && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center justify-between p-2 rounded bg-slate-50">
                    <span className="text-slate-600">Partitions OK</span>
                    <span className="font-semibold text-slate-900">
                      {health.partitionsAllOk}/{health.partitions}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-slate-50">
                    <span className="text-slate-600">Quorum OK</span>
                    <span className="font-semibold text-slate-900">
                      {health.partitionsQuorum}/{health.partitions}
                    </span>
                  </div>
                </div>
              )}

              {totalCapacity > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-slate-600">
                      <HardDrive className="h-4 w-4" />
                      Storage Capacity
                    </div>
                    <span className="font-semibold text-slate-900">
                      {formatBytes(totalUsed)} / {formatBytes(totalCapacity)}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all rounded-full"
                      style={{ width: `${(totalUsed / totalCapacity) * 100}%` }}
                    />
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
                          <span className="font-mono text-xs truncate">{node.id.substring(0, 16)}...</span>
                        </div>
                        <Badge variant="destructive" className="text-xs shrink-0 ml-2">
                          {!node.isUp ? 'Down' : node.draining ? 'Draining' : 'Issue'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {variant === 'healthy' && nodes.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Nodes ({nodes.length})
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2 p-2 rounded bg-green-50">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                      <span className="text-slate-600">Online:</span>
                      <span className="font-semibold text-slate-900">{nodesUp}</span>
                    </div>
                    {nodesDown > 0 && (
                      <div className="flex items-center gap-2 p-2 rounded bg-red-50">
                        <XCircle className="h-3.5 w-3.5 text-red-600" />
                        <span className="text-slate-600">Offline:</span>
                        <span className="font-semibold text-slate-900">{nodesDown}</span>
                      </div>
                    )}
                    {nodesDraining > 0 && (
                      <div className="flex items-center gap-2 p-2 rounded bg-amber-50">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        <span className="text-slate-600">Draining:</span>
                        <span className="font-semibold text-slate-900">{nodesDraining}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
