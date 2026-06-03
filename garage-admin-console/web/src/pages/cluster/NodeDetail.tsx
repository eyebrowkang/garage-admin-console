import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { HardDrive, Activity, Database, RefreshCw, type LucideIcon } from 'lucide-react';
import {
  Button,
  Badge,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Alert,
  AlertDescription,
  AlertTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@garage/ui';
import { useClusterContext } from '@/contexts/ClusterContext';
import {
  useNodes,
  useNodeInfo,
  useNodeStatistics,
  useCreateMetadataSnapshot,
  useLaunchRepairOperation,
} from '@/hooks/useNodes';
import { ConfirmDialog } from '@garage/ui';
import { CopyButton } from '@garage/ui';
import { DetailPageHeader } from '@/components/cluster/DetailPageHeader';
import { InlineLoadingState } from '@garage/ui';
import { PageLoadingState } from '@garage/ui';
import { RepairActionIcon, SnapshotActionIcon } from '@/lib/action-icons';
import { formatBytes, formatRelativeSeconds, getApiErrorMessage } from '@garage/web-shared';
import { toast } from '@garage/ui';
import type { RepairType, ScrubCommand } from '@/types/garage';

const REPAIR_OPERATIONS = [
  { value: 'tables', label: 'Tables', description: 'Verify and repair all metadata tables' },
  { value: 'blocks', label: 'Blocks', description: 'Verify block integrity and rebalance' },
  { value: 'versions', label: 'Versions', description: 'Verify object versions consistency' },
  {
    value: 'multipartUploads',
    label: 'Multipart Uploads',
    description: 'Repair multipart upload metadata',
  },
  { value: 'blockRefs', label: 'Block Refs', description: 'Verify block reference counts' },
  { value: 'blockRc', label: 'Block RC', description: 'Recalculate block reference counts' },
  { value: 'rebalance', label: 'Rebalance', description: 'Rebalance data across nodes' },
  { value: 'aliases', label: 'Aliases', description: 'Rebuild bucket alias metadata' },
  {
    value: 'clearResyncQueue',
    label: 'Clear Resync Queue',
    description: 'Clear pending resync tasks',
  },
  { value: 'scrub', label: 'Scrub', description: 'Full data scrub and verification' },
] as const;

const SCRUB_COMMANDS = [
  { value: 'start', label: 'Start' },
  { value: 'pause', label: 'Pause' },
  { value: 'resume', label: 'Resume' },
  { value: 'cancel', label: 'Cancel' },
] as const;

type RepairOperationValue = (typeof REPAIR_OPERATIONS)[number]['value'];

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
  const [selectedRepairOp, setSelectedRepairOp] = useState<RepairOperationValue>('tables');
  const [scrubCommand, setScrubCommand] = useState<ScrubCommand>('start');

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
  const snapshotMutation = useCreateMetadataSnapshot(clusterId);
  const repairMutation = useLaunchRepairOperation(clusterId);

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

  const handleSnapshot = async () => {
    try {
      await snapshotMutation.mutateAsync(nid);
      toast({
        title: 'Snapshot created',
        description: 'Metadata snapshot has been created',
        variant: 'success',
      });
      setSnapshotDialogOpen(false);
    } catch (err) {
      toast({
        title: 'Snapshot failed',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const handleRepair = async () => {
    try {
      const repairType: RepairType =
        selectedRepairOp === 'scrub' ? { scrub: scrubCommand } : selectedRepairOp;
      const repairLabel =
        REPAIR_OPERATIONS.find((op) => op.value === selectedRepairOp)?.label ?? selectedRepairOp;
      const repairSuffix = selectedRepairOp === 'scrub' ? ` (${scrubCommand})` : '';
      await repairMutation.mutateAsync({ repairType, nodeId: nid });
      toast({
        title: 'Repair operation started',
        description: `${repairLabel}${repairSuffix} operation has been launched`,
      });
      setRepairDialogOpen(false);
    } catch (err) {
      toast({
        title: 'Repair failed',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

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
        title={node.hostname || 'Unknown Host'}
        subtitle={node.id}
        badges={statusBadge}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setSnapshotDialogOpen(true)}>
              <SnapshotActionIcon className="h-4 w-4" />
              Create Snapshot
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRepairDialogOpen(true)}>
              <RepairActionIcon className="h-4 w-4" />
              Repair
            </Button>
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
        </TabsList>

        {/* ---------------- Overview ---------------- */}
        <TabsContent value="overview" className="space-y-4">
          {/* Quick stats strip */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
            <div className="bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Status</div>
              <div className="text-base font-semibold">
                {node.draining ? 'Draining' : node.isUp ? 'Online' : 'Offline'}
              </div>
              {!node.isUp && node.lastSeenSecsAgo !== null && (
                <div className="text-xs text-muted-foreground">
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

      {/* Snapshot Confirmation */}
      <ConfirmDialog
        open={snapshotDialogOpen}
        onOpenChange={setSnapshotDialogOpen}
        title="Create Metadata Snapshot"
        description="This will create a snapshot of the metadata database on this node. This is a non-destructive operation."
        onConfirm={handleSnapshot}
        isLoading={snapshotMutation.isPending}
      />

      {/* Repair Dialog */}
      <Dialog open={repairDialogOpen} onOpenChange={setRepairDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Launch Repair Operation</DialogTitle>
            <DialogDescription>
              Repair operations can be resource-intensive. Choose carefully.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Repair Type</Label>
              <Select
                value={selectedRepairOp}
                onValueChange={(value) => setSelectedRepairOp(value as RepairOperationValue)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPAIR_OPERATIONS.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {REPAIR_OPERATIONS.find((op) => op.value === selectedRepairOp)?.description}
              </p>
            </div>
            {selectedRepairOp === 'scrub' && (
              <div className="space-y-2">
                <Label>Scrub Command</Label>
                <Select
                  value={scrubCommand}
                  onValueChange={(value) => setScrubCommand(value as ScrubCommand)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCRUB_COMMANDS.map((command) => (
                      <SelectItem key={command.value} value={command.value}>
                        {command.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRepairDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRepair} disabled={repairMutation.isPending}>
              {repairMutation.isPending ? 'Starting...' : 'Start Repair'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
