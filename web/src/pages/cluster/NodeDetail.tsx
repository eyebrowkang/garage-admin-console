import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { HardDrive, Activity, Database, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useClusterContext } from '@/contexts/ClusterContext';
import {
  useNodes,
  useNodeInfo,
  useNodeStatistics,
  useCreateMetadataSnapshot,
  useLaunchRepairOperation,
} from '@/hooks/useNodes';
import { ConfirmDialog } from '@/components/cluster/ConfirmDialog';
import { CopyButton } from '@/components/cluster/CopyButton';
import { DetailPageHeader } from '@/components/cluster/DetailPageHeader';
import { InlineLoadingState } from '@/components/cluster/InlineLoadingState';
import { PageLoadingState } from '@/components/cluster/PageLoadingState';
import { RepairActionIcon, SnapshotActionIcon } from '@/lib/action-icons';
import { NodeIcon } from '@/lib/entity-icons';
import { formatBytes, formatRelativeSeconds } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
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

export function NodeDetail() {
  const { nid } = useParams<{ nid: string }>();
  const { clusterId } = useClusterContext();

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
      toast({ title: 'Snapshot created', description: 'Metadata snapshot has been created' });
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

  return (
    <div className="space-y-6">
      <DetailPageHeader
        backTo={`/clusters/${clusterId}/nodes`}
        title={node.hostname || 'Unknown Host'}
        subtitle={node.id}
        badges={
          node.draining ? (
            <Badge variant="warning">Draining</Badge>
          ) : node.isUp ? (
            <Badge variant="success">Up</Badge>
          ) : (
            <Badge variant="destructive">Down</Badge>
          )
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setSnapshotDialogOpen(true)}>
              <SnapshotActionIcon className="h-4 w-4 mr-2" />
              Create Snapshot
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRepairDialogOpen(true)}>
              <RepairActionIcon className="h-4 w-4 mr-2" />
              Repair
            </Button>
          </>
        }
      />

      {/* Node Info */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <NodeIcon className="h-4 w-4" />
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {node.draining ? 'Draining' : node.isUp ? 'Online' : 'Offline'}
            </div>
            {!node.isUp && node.lastSeenSecsAgo !== null && (
              <div className="text-sm text-muted-foreground">
                Last seen {formatRelativeSeconds(node.lastSeenSecsAgo)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Address
            </CardTitle>
          </CardHeader>
          <CardContent>
            {node.addr ? (
              <div className="inline-flex items-center gap-1 text-lg">
                <span>{node.addr}</span>
                <CopyButton value={node.addr} label="Node address" />
              </div>
            ) : (
              <div className="text-lg">-</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Database className="h-4 w-4" />
              Version
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">{node.garageVersion || '-'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Zone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-medium">{node.role?.zone || 'Unassigned'}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Node Info</CardTitle>
          <CardDescription>Garage daemon details for this node</CardDescription>
        </CardHeader>
        <CardContent>
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
                <div className="inline-flex items-center gap-1 font-medium break-all">
                  <span>{nodeInfoData.nodeId}</span>
                  <CopyButton value={nodeInfoData.nodeId} label="Node ID" />
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="text-sm text-muted-foreground">Features</div>
                {nodeInfoData.garageFeatures && nodeInfoData.garageFeatures.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1">
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
        </CardContent>
      </Card>

      {/* Role & Capacity */}
      {node.role && (
        <Card>
          <CardHeader>
            <CardTitle>Role Configuration</CardTitle>
          </CardHeader>
          <CardContent>
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
                <div className="flex flex-wrap gap-1 mt-1">
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
          </CardContent>
        </Card>
      )}

      {/* Storage Info */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Data Partition
            </CardTitle>
          </CardHeader>
          <CardContent>
            {node.dataPartition ? (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Available</span>
                  <span className="font-medium">{formatBytes(node.dataPartition.available)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Total</span>
                  <span className="font-medium">{formatBytes(node.dataPartition.total)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${node.dataPartition.total > 0 ? ((node.dataPartition.total - node.dataPartition.available) / node.dataPartition.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  {node.dataPartition.total > 0
                    ? Math.round(
                        ((node.dataPartition.total - node.dataPartition.available) /
                          node.dataPartition.total) *
                          100,
                      )
                    : 0}
                  % used
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Metadata Partition
            </CardTitle>
          </CardHeader>
          <CardContent>
            {node.metadataPartition ? (
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Available</span>
                  <span className="font-medium">
                    {formatBytes(node.metadataPartition.available)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Total</span>
                  <span className="font-medium">{formatBytes(node.metadataPartition.total)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${node.metadataPartition.total > 0 ? ((node.metadataPartition.total - node.metadataPartition.available) / node.metadataPartition.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  {node.metadataPartition.total > 0
                    ? Math.round(
                        ((node.metadataPartition.total - node.metadataPartition.available) /
                          node.metadataPartition.total) *
                          100,
                      )
                    : 0}
                  % used
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Node Statistics */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Node Statistics</CardTitle>
              <CardDescription>Detailed statistics from this node</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchStats()}
              disabled={statsFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${statsFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
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
            <pre className="max-h-[600px] overflow-auto rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-relaxed whitespace-pre">
              {nodeStats?.freeform || 'No statistics available'}
            </pre>
          )}
        </CardContent>
      </Card>

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
            <Button
              variant="destructive"
              onClick={handleRepair}
              disabled={repairMutation.isPending}
            >
              {repairMutation.isPending ? 'Starting...' : 'Start Repair'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
