import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { HardDrive, Activity, Database, RefreshCw, type LucideIcon } from 'lucide-react';
import {
  Button,
  Badge,
  Alert,
  AlertDescription,
  AlertTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TabHotkeys,
  CopyButton,
  InlineLoadingState,
  PageLoadingState,
} from '@garage/ui';
import { useClusterContext } from '@/contexts/ClusterContext';
import { useNodes, useNodeInfo, useNodeStatistics } from '@/hooks/useNodes';
import { DetailPageHeader } from '@/components/cluster/DetailPageHeader';
import { SnapshotDialog, RepairDialog } from '@/components/cluster/NodeMaintenanceDialogs';
import { RepairActionIcon, SnapshotActionIcon } from '@/lib/action-icons';
import { formatBytes, formatRelativeSeconds, getApiErrorMessage } from '@garage/web-shared';

/** A storage-partition usage panel: available / total and a used-% meter. */
function PartitionMeter({
  title,
  icon: Icon,
  partition,
}: {
  title: string;
  icon: LucideIcon;
  partition: { available: number; total: number } | null | undefined;
}) {
  const usedPct =
    partition && partition.total > 0
      ? ((partition.total - partition.available) / partition.total) * 100
      : 0;
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
      </div>
      {partition ? (
        <>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Available</span>
            <span className="font-medium">{formatBytes(partition.available)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-medium">{formatBytes(partition.total)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${usedPct}%` }} />
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {Math.round(usedPct)}% used
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No data available</p>
      )}
    </div>
  );
}

export function NodeDetail() {
  const { nid } = useParams<{ nid: string }>();
  const { clusterId } = useClusterContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const [snapshotDialogOpen, setSnapshotDialogOpen] = useState(false);
  const [repairDialogOpen, setRepairDialogOpen] = useState(false);

  const { data: status, isLoading, error } = useNodes(clusterId);
  const {
    data: nodeInfo,
    isLoading: infoLoading,
    error: infoError,
  } = useNodeInfo(clusterId, nid || '');
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
    isFetching: statsFetching,
  } = useNodeStatistics(clusterId, nid);

  if (!nid) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Invalid node ID</AlertTitle>
        <AlertDescription>The requested node identifier is missing.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return <PageLoadingState label="Loading node details..." />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load node</AlertTitle>
        <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
      </Alert>
    );
  }

  const node = status?.nodes.find((n) => n.id === nid);
  const nodeInfoData = nodeInfo?.success?.[nid];
  const nodeInfoError = nodeInfo?.error?.[nid];

  if (!node) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Node not found</AlertTitle>
        <AlertDescription>
          The node may be offline or no longer part of the cluster.
        </AlertDescription>
      </Alert>
    );
  }

  const nodeStats = stats?.success?.[nid];
  const nodeStatsError = stats?.error?.[nid];

  const requestedTab = searchParams.get('tab');
  const activeTab = requestedTab === 'statistics' ? 'statistics' : 'overview';
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

  const statusBadge = node.draining ? (
    <Badge variant="warning">Draining</Badge>
  ) : node.isUp ? (
    <Badge variant="success">Up</Badge>
  ) : (
    <Badge variant="destructive">Down</Badge>
  );

  return (
    <div className="space-y-4">
      <DetailPageHeader
        breadcrumbs={[
          { label: 'Nodes', to: `/clusters/${clusterId}/nodes` },
          { label: node.hostname || 'Unknown Host' },
        ]}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-initial"
              onClick={() => setSnapshotDialogOpen(true)}
            >
              <SnapshotActionIcon className="h-4 w-4" />
              Create Snapshot
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-initial"
              onClick={() => setRepairDialogOpen(true)}
            >
              <RepairActionIcon className="h-4 w-4" />
              Repair
            </Button>
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabHotkeys values={['overview', 'statistics']} onSelect={handleTabChange} />
        <TabsList>
          <TabsTrigger value="overview" title="Overview (press 1)">
            Overview
          </TabsTrigger>
          <TabsTrigger value="statistics" title="Statistics (press 2)">
            Statistics
          </TabsTrigger>
        </TabsList>

        {/* ---------------- Overview ---------------- */}
        <TabsContent value="overview" className="space-y-4">
          {/* Quick stats strip */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
            <div className="bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Status</div>
              <div className="mt-1 flex">{statusBadge}</div>
              {!node.isUp && node.lastSeenSecsAgo !== null && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Last seen {formatRelativeSeconds(node.lastSeenSecsAgo)}
                </div>
              )}
            </div>
            <div className="bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Address</div>
              {node.addr ? (
                <div className="inline-flex items-center gap-1 text-sm">
                  <span className="font-mono">{node.addr}</span>
                  <CopyButton value={node.addr} label="Node address" compact />
                </div>
              ) : (
                <div className="text-sm">—</div>
              )}
            </div>
            <div className="bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Version</div>
              <div className="text-base font-medium">{node.garageVersion || '—'}</div>
            </div>
            <div className="bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Zone</div>
              <div className="text-base font-medium">{node.role?.zone || 'Unassigned'}</div>
            </div>
          </div>

          {/* Daemon details */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Database className="h-4 w-4 text-muted-foreground" />
              Garage Daemon
            </div>
            {infoLoading ? (
              <InlineLoadingState label="Loading node info..." />
            ) : infoError ? (
              <Alert variant="destructive">
                <AlertTitle>Failed to load node info</AlertTitle>
                <AlertDescription>{getApiErrorMessage(infoError)}</AlertDescription>
              </Alert>
            ) : nodeInfoError ? (
              <Alert variant="destructive">
                <AlertTitle>Node info unavailable</AlertTitle>
                <AlertDescription>{nodeInfoError}</AlertDescription>
              </Alert>
            ) : nodeInfoData ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-sm text-muted-foreground">Garage Version</div>
                  <div className="font-medium">{nodeInfoData.garageVersion}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Rust Version</div>
                  <div className="font-medium">{nodeInfoData.rustVersion}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">DB Engine</div>
                  <div className="font-medium">{nodeInfoData.dbEngine}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Node ID</div>
                  <div className="inline-flex items-center gap-1 break-all font-medium">
                    <span className="font-mono text-sm">{nodeInfoData.nodeId}</span>
                    <CopyButton value={nodeInfoData.nodeId} label="Node ID" compact />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-muted-foreground">Features</div>
                  {nodeInfoData.garageFeatures && nodeInfoData.garageFeatures.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {nodeInfoData.garageFeatures.map((feature) => (
                        <Badge key={feature} variant="outline">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No features reported</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No node info available.</div>
            )}
          </div>

          {/* Role configuration */}
          {node.role && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="text-sm font-medium">Role Configuration</div>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <div className="text-sm text-muted-foreground">Zone</div>
                  <div className="font-medium">{node.role.zone}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Capacity</div>
                  <div className="font-medium">{formatBytes(node.role.capacity)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Tags</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {node.role.tags.length > 0 ? (
                      node.role.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">No tags</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Storage partitions */}
          <div className="grid gap-4 md:grid-cols-2">
            <PartitionMeter title="Data Partition" icon={HardDrive} partition={node.dataPartition} />
            <PartitionMeter
              title="Metadata Partition"
              icon={Database}
              partition={node.metadataPartition}
            />
          </div>
        </TabsContent>

        {/* ---------------- Statistics ---------------- */}
        <TabsContent value="statistics" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Node Statistics
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchStats()}
              disabled={statsFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${statsFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          {statsLoading ? (
            <InlineLoadingState label="Loading statistics..." />
          ) : statsError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load statistics</AlertTitle>
              <AlertDescription>{getApiErrorMessage(statsError)}</AlertDescription>
            </Alert>
          ) : nodeStatsError ? (
            <Alert variant="destructive">
              <AlertTitle>Statistics unavailable</AlertTitle>
              <AlertDescription>{nodeStatsError}</AlertDescription>
            </Alert>
          ) : (
            <pre className="max-h-[600px] overflow-auto whitespace-pre rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
              {nodeStats?.freeform || 'No statistics available'}
            </pre>
          )}
        </TabsContent>
      </Tabs>

      <SnapshotDialog
        clusterId={clusterId}
        open={snapshotDialogOpen}
        onOpenChange={setSnapshotDialogOpen}
        nodeId={nid}
        nodeLabel={node.hostname || 'this node'}
      />
      <RepairDialog
        clusterId={clusterId}
        open={repairDialogOpen}
        onOpenChange={setRepairDialogOpen}
        nodeId={nid}
        nodeLabel={node.hostname || 'this node'}
      />
    </div>
  );
}
