import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Activity, Database, HardDrive, LayoutGrid, AlertTriangle, BarChart2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { api, proxyPath } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { CapacityGauge } from '@/components/charts/CapacityGauge';
import { PartitionChart } from '@/components/charts/PartitionChart';
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

  const totalCapacity = layout?.roles?.reduce((sum, role) => sum + (role.capacity ?? 0), 0) ?? 0;
  const usableCapacity =
    layout?.roles?.reduce((sum, role) => sum + (role.usableCapacity ?? 0), 0) ?? 0;

  // Calculate actual used storage from node data partitions
  let totalUsed = 0;
  let totalAvailable = 0;
  if (status?.nodes) {
    for (const node of status.nodes) {
      if (node.dataPartition) {
        totalUsed += node.dataPartition.total - node.dataPartition.available;
        totalAvailable += node.dataPartition.available;
      }
    }
  }

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

      {/* Summary Cards Row */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {healthQuery.isLoading ? (
              <Badge variant="outline">Checking...</Badge>
            ) : (
              <Badge variant={statusVariant} className="text-lg px-3 py-1">
                {health?.status
                  ? health.status.charAt(0).toUpperCase() + health.status.slice(1)
                  : 'Unknown'}
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Nodes</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {health ? `${health.storageNodesUp}/${health.storageNodes}` : '-'}
            </div>
            <p className="text-xs text-muted-foreground">storage nodes online</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Layout</CardTitle>
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">v{layout?.version ?? '-'}</div>
            <p className="text-xs text-muted-foreground">
              {layout?.stagedRoleChanges?.length || 0} pending changes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Capacity</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(usableCapacity)}</div>
            <p className="text-xs text-muted-foreground">{formatBytes(totalUsed)} used</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Storage Usage</CardTitle>
            <CardDescription>Current storage utilization across all nodes</CardDescription>
          </CardHeader>
          <CardContent>
            <CapacityGauge
              used={totalUsed}
              total={totalUsed + totalAvailable}
              label="Data Storage"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Partition Health</CardTitle>
            <CardDescription>Distribution of partition states</CardDescription>
          </CardHeader>
          <CardContent>
            {health ? (
              <PartitionChart
                allOk={health.partitionsAllOk}
                quorumOk={health.partitionsQuorum - health.partitionsAllOk}
                degraded={health.partitions - health.partitionsQuorum}
                total={health.partitions}
              />
            ) : (
              <div className="h-[180px] flex items-center justify-center text-muted-foreground">
                Loading partition data...
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Health Details */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Cluster Health Details</CardTitle>
            <CardDescription>Detailed health metrics for the cluster</CardDescription>
          </div>
          <Activity className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Connected Nodes</div>
              <div className="text-xl font-semibold">
                {health ? `${health.connectedNodes}/${health.knownNodes}` : '-'}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Storage Nodes</div>
              <div className="text-xl font-semibold">
                {health ? `${health.storageNodesUp}/${health.storageNodes}` : '-'}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Partitions (Quorum)</div>
              <div className="text-xl font-semibold">
                {health ? `${health.partitionsQuorum}/${health.partitions}` : '-'}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Partitions (All OK)</div>
              <div className="text-xl font-semibold">
                {health ? `${health.partitionsAllOk}/${health.partitions}` : '-'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Layout Info */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Layout Configuration</CardTitle>
            <CardDescription>Current cluster layout settings</CardDescription>
          </div>
          <LayoutGrid className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Layout Version</div>
              <div className="text-xl font-semibold">{layout?.version ?? '-'}</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Roles in Layout</div>
              <div className="text-xl font-semibold">{layout?.roles?.length ?? '-'}</div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Partition Size</div>
              <div className="text-xl font-semibold">
                {layout ? formatBytes(layout.partitionSize) : '-'}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Assigned Capacity</div>
              <div className="text-xl font-semibold">{formatBytes(totalCapacity)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Cluster Statistics</CardTitle>
            <CardDescription>Raw statistics from the cluster</CardDescription>
          </div>
          <BarChart2 className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {statsQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading statistics...</div>
          ) : (
            <pre className="text-xs leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-4 whitespace-pre-wrap break-words text-slate-800 max-h-[400px] overflow-auto">
              {stats?.freeform || 'No statistics available.'}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
