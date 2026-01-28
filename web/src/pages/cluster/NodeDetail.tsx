import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Server, HardDrive, Activity, Database, Wrench, Camera } from 'lucide-react';
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
  useNodeStatistics,
  useCreateMetadataSnapshot,
  useLaunchRepairOperation,
} from '@/hooks/useNodes';
import { ConfirmDialog } from '@/components/cluster/ConfirmDialog';
import { formatBytes, formatRelativeSeconds } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';

const REPAIR_OPERATIONS = [
  { value: 'tables', label: 'Tables', description: 'Verify and repair all metadata tables' },
  { value: 'blocks', label: 'Blocks', description: 'Verify block integrity and rebalance' },
  { value: 'versions', label: 'Versions', description: 'Verify object versions consistency' },
  { value: 'block_refs', label: 'Block Refs', description: 'Verify block reference counts' },
  { value: 'block_rc', label: 'Block RC', description: 'Recalculate block reference counts' },
  { value: 'rebalance', label: 'Rebalance', description: 'Rebalance data across nodes' },
  { value: 'scrub', label: 'Scrub', description: 'Full data scrub and verification' },
];

export function NodeDetail() {
  const { nid } = useParams<{ nid: string }>();
  const { clusterId } = useClusterContext();

  const [snapshotDialogOpen, setSnapshotDialogOpen] = useState(false);
  const [repairDialogOpen, setRepairDialogOpen] = useState(false);
  const [selectedRepairOp, setSelectedRepairOp] = useState('tables');

  const { data: status, isLoading, error } = useNodes(clusterId);
  const { data: stats } = useNodeStatistics(clusterId, nid);
  const snapshotMutation = useCreateMetadataSnapshot(clusterId);
  const repairMutation = useLaunchRepairOperation(clusterId);

  if (!nid) {
    return <div className="p-4">Invalid node ID</div>;
  }

  if (isLoading) {
    return <div className="p-4">Loading node details...</div>;
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

  if (!node) {
    return <div className="p-4">Node not found</div>;
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
      await repairMutation.mutateAsync({ operation: selectedRepairOp, nodeId: nid });
      toast({
        title: 'Repair operation started',
        description: `${selectedRepairOp} operation has been launched`,
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to={`/clusters/${clusterId}/nodes`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{node.hostname || 'Unknown Host'}</h1>
              {node.draining ? (
                <Badge variant="warning">Draining</Badge>
              ) : node.isUp ? (
                <Badge variant="success">Up</Badge>
              ) : (
                <Badge variant="destructive">Down</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground font-mono">{node.id}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSnapshotDialogOpen(true)}>
            <Camera className="h-4 w-4 mr-2" />
            Create Snapshot
          </Button>
          <Button variant="outline" onClick={() => setRepairDialogOpen(true)}>
            <Wrench className="h-4 w-4 mr-2" />
            Repair
          </Button>
        </div>
      </div>

      {/* Node Info */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Server className="h-4 w-4" />
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
            <div className="font-mono text-lg">{node.addr || '-'}</div>
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
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${((node.dataPartition.total - node.dataPartition.available) / node.dataPartition.total) * 100}%`,
                    }}
                  />
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  {Math.round(
                    ((node.dataPartition.total - node.dataPartition.available) /
                      node.dataPartition.total) *
                      100,
                  )}
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
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${((node.metadataPartition.total - node.metadataPartition.available) / node.metadataPartition.total) * 100}%`,
                    }}
                  />
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  {Math.round(
                    ((node.metadataPartition.total - node.metadataPartition.available) /
                      node.metadataPartition.total) *
                      100,
                  )}
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
      {nodeStats && (
        <Card>
          <CardHeader>
            <CardTitle>Node Statistics</CardTitle>
            <CardDescription>Detailed statistics from this node</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-slate-50/80 border rounded-lg p-4 whitespace-pre-wrap break-words text-slate-700">
              {nodeStats.freeform || 'No statistics available'}
            </pre>
          </CardContent>
        </Card>
      )}

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
              <Label>Operation Type</Label>
              <Select value={selectedRepairOp} onValueChange={setSelectedRepairOp}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPAIR_OPERATIONS.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      <div>
                        <div className="font-medium">{op.label}</div>
                        <div className="text-xs text-muted-foreground">{op.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
