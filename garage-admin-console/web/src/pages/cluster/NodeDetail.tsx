import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  HardDrive,
  Activity,
  Database,
  RefreshCw,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  CopyButton,
  InlineLoadingState,
  PageLoadingState,
  TerminalOutput,
  cn,
} from '@garage/ui';
import { useClusterContext } from '@/contexts/ClusterContext';
import { useNodes, useNodeInfo, useNodeStatistics } from '@/hooks/useNodes';
import { DetailPageHeader } from '@/components/cluster/DetailPageHeader';
import { SnapshotDialog, RepairDialog } from '@/components/cluster/NodeMaintenanceDialogs';
import { RepairActionIcon, SnapshotActionIcon } from '@/lib/action-icons';
import {
  formatBytes,
  formatNum,
  formatRelativeSeconds,
  getApiErrorMessage,
} from '@garage/web-shared';
import type { NodeBlockManagerStats, NodeTableStats } from '@/types/garage';

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
            <div className="min-w-0 bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Address</div>
              {node.addr ? (
                <div className="mt-0.5 flex items-start gap-1 text-sm">
                  <span className="min-w-0 break-all font-mono">{node.addr}</span>
                  <CopyButton value={node.addr} label="Node address" compact className="shrink-0" />
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
              <div className="grid gap-4 md:grid-cols-2">
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
            <PartitionMeter
              title="Data Partition"
              icon={HardDrive}
              partition={node.dataPartition}
            />
            <PartitionMeter
              title="Metadata Partition"
              icon={Database}
              partition={node.metadataPartition}
            />
          </div>
        </TabsContent>

        {/* ---------------- Statistics ---------------- */}
        <TabsContent value="statistics" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Node Statistics
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchStats()}
              disabled={statsFetching}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', statsFetching && 'animate-spin')} />
              Refresh
            </Button>
          </div>
          {statsError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load statistics</AlertTitle>
              <AlertDescription>{getApiErrorMessage(statsError)}</AlertDescription>
            </Alert>
          ) : nodeStatsError ? (
            <Alert variant="destructive">
              <AlertTitle>Statistics unavailable</AlertTitle>
              <AlertDescription>{nodeStatsError}</AlertDescription>
            </Alert>
          ) : statsLoading ? (
            <InlineLoadingState label="Fetching node statistics..." />
          ) : nodeStats?.blockManagerStats || nodeStats?.tableStats ? (
            <>
              <BlockManagerPanel stats={nodeStats.blockManagerStats} />
              <TableStatsPanel tables={nodeStats.tableStats} />
              {nodeStats.freeform && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                    Raw output
                  </summary>
                  <div className="mt-2">
                    <TerminalOutput
                      command="garage stats"
                      content={nodeStats.freeform}
                      maxHeightClass="max-h-[400px]"
                    />
                  </div>
                </details>
              )}
            </>
          ) : (
            <TerminalOutput
              command="garage stats"
              content={nodeStats?.freeform ?? ''}
              onRefresh={() => refetchStats()}
              refreshing={statsFetching}
              loading={statsLoading}
              loadingLabel="Fetching node statistics…"
              emptyLabel="No statistics available."
              maxHeightClass="max-h-[600px]"
            />
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

function BlockManagerPanel({ stats }: { stats?: NodeBlockManagerStats | null }) {
  if (!stats) return null;
  const hasIssues = stats.resyncErrors > 0 || stats.resyncQueueLen > 0;
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <HardDrive className="h-4 w-4 text-muted-foreground" />
        Block Manager
      </div>
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
        <div className="bg-card px-4 py-3">
          <div className="text-xs text-muted-foreground">RC Entries</div>
          <div className="text-lg font-semibold tabular-nums">{formatNum(stats.rcEntries)}</div>
        </div>
        <div className="bg-card px-4 py-3">
          <div className="text-xs text-muted-foreground">Resync Queue</div>
          <div
            className={cn(
              'text-lg font-semibold tabular-nums',
              stats.resyncQueueLen > 0 && 'text-warning',
            )}
          >
            {formatNum(stats.resyncQueueLen)}
          </div>
        </div>
        <div className="bg-card px-4 py-3">
          <div className="text-xs text-muted-foreground">Resync Errors</div>
          <div
            className={cn(
              'text-lg font-semibold tabular-nums',
              stats.resyncErrors > 0 && 'text-destructive',
            )}
          >
            {formatNum(stats.resyncErrors)}
          </div>
        </div>
      </div>
      {hasIssues && (
        <div className="flex items-center gap-2 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {stats.resyncErrors > 0
            ? `${stats.resyncErrors} block(s) with resync errors`
            : `${stats.resyncQueueLen} block(s) queued for resync`}
        </div>
      )}
    </div>
  );
}

function TableStatsPanel({ tables }: { tables?: NodeTableStats[] | null }) {
  if (!tables || tables.length === 0) return null;
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Database className="h-4 w-4 text-muted-foreground" />
        Metadata Tables
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Table</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Merkle</TableHead>
              <TableHead className="text-right">Merkle Q</TableHead>
              <TableHead className="text-right">Insert Q</TableHead>
              <TableHead className="text-right">GC Q</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tables.map((t) => (
              <TableRow key={t.tableName}>
                <TableCell className="font-mono text-sm">{t.tableName}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNum(t.items)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNum(t.merkleItems)}
                </TableCell>
                <TableCell
                  className={cn('text-right tabular-nums', t.merkleQueueLen > 0 && 'text-warning')}
                >
                  {formatNum(t.merkleQueueLen)}
                </TableCell>
                <TableCell
                  className={cn('text-right tabular-nums', t.insertQueueLen > 0 && 'text-warning')}
                >
                  {formatNum(t.insertQueueLen)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNum(t.gcQueueLen)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
