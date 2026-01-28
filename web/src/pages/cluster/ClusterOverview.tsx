import { useQuery } from '@tanstack/react-query';
import { Activity, Database, HardDrive, LayoutGrid } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { api, proxyPath } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import type {
  GetClusterHealthResponse,
  GetClusterLayoutResponse,
  GetClusterStatisticsResponse,
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

  const health = healthQuery.data;
  const layout = layoutQuery.data;
  const stats = statsQuery.data;

  const totalCapacity = layout?.roles?.reduce((sum, role) => sum + (role.capacity ?? 0), 0) ?? 0;
  const usableCapacity =
    layout?.roles?.reduce((sum, role) => sum + (role.usableCapacity ?? 0), 0) ?? 0;
  const capacityRatio =
    layout && totalCapacity > 0 ? Math.min(1, usableCapacity / totalCapacity) : 0;
  const assignedCapacityLabel = layout ? formatBytes(totalCapacity) : '-';
  const usableCapacityLabel = layout ? formatBytes(usableCapacity) : '-';

  const statusVariant =
    health?.status === 'healthy'
      ? 'success'
      : health?.status === 'degraded'
        ? 'warning'
        : health?.status === 'unavailable'
          ? 'destructive'
          : 'secondary';

  return (
    <div className="space-y-6">
      {(healthQuery.error || layoutQuery.error || statsQuery.error) && (
        <Alert variant="destructive">
          <AlertTitle>Cluster data unavailable</AlertTitle>
          <AlertDescription>
            {healthQuery.error && getApiErrorMessage(healthQuery.error, 'Failed to load health.')}
            {layoutQuery.error &&
              ` ${getApiErrorMessage(layoutQuery.error, 'Failed to load layout.')}`}
            {statsQuery.error &&
              ` ${getApiErrorMessage(statsQuery.error, 'Failed to load statistics.')}`}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Cluster Health</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              {healthQuery.isLoading ? (
                <Badge variant="outline">Checking...</Badge>
              ) : (
                <Badge variant={statusVariant}>{health?.status ? health.status : 'unknown'}</Badge>
              )}
              <span className="text-sm text-muted-foreground">Overall status</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Connected nodes</div>
                <div className="font-semibold text-slate-900">
                  {health ? `${health.connectedNodes}/${health.knownNodes}` : '-'}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Storage nodes</div>
                <div className="font-semibold text-slate-900">
                  {health ? `${health.storageNodesUp}/${health.storageNodes}` : '-'}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Partitions quorum</div>
                <div className="font-semibold text-slate-900">
                  {health ? `${health.partitionsQuorum}/${health.partitions}` : '-'}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Partitions OK</div>
                <div className="font-semibold text-slate-900">
                  {health ? `${health.partitionsAllOk}/${health.partitions}` : '-'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Layout Snapshot</CardTitle>
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Layout version</span>
              <span className="font-semibold text-slate-900">{layout?.version ?? '-'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Roles in layout</span>
              <span className="font-semibold text-slate-900">{layout?.roles?.length ?? '-'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Pending changes</span>
              <span className="font-semibold text-slate-900">
                {layout?.stagedRoleChanges?.length ?? '-'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Partition size</span>
              <span className="font-semibold text-slate-900">
                {layout ? formatBytes(layout.partitionSize) : '-'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Capacity Overview</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Assigned capacity</span>
                <span className="font-semibold text-slate-900">{assignedCapacityLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Usable capacity</span>
                <span className="font-semibold text-slate-900">{usableCapacityLabel}</span>
              </div>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${capacityRatio * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Usable capacity is calculated from layout partitions, not live usage.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Cluster Statistics</CardTitle>
          <Database className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {statsQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading statistics...</div>
          ) : (
            <pre className="text-xs bg-slate-50/80 border rounded-lg p-4 whitespace-pre-wrap break-words text-slate-700">
              {stats?.freeform || 'No statistics available.'}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
