import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, proxyPath } from '@/lib/api';
import { formatBytes, formatRelativeSeconds, formatShortId } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { ConfirmDialog } from '@/components/cluster/ConfirmDialog';
import { ModulePageHeader } from '@/components/cluster/ModulePageHeader';
import { PageLoadingState } from '@/components/cluster/PageLoadingState';
import { ConnectActionIcon, RepairActionIcon, SnapshotActionIcon } from '@/lib/action-icons';
import { toast } from '@/hooks/use-toast';
import { NodeIcon } from '@/lib/entity-icons';
import {
  useConnectNodes,
  useCreateMetadataSnapshot,
  useLaunchRepairOperation,
} from '@/hooks/useNodes';
import type { GetClusterStatusResponse, NodeResp, RepairType, ScrubCommand } from '@/types/garage';

interface NodeListProps {
  clusterId: string;
}

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

export function ClusterNodeList({ clusterId }: NodeListProps) {
  const navigate = useNavigate();
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connectNodesInput, setConnectNodesInput] = useState('');
  const [connectError, setConnectError] = useState('');
  const [snapshotConfirmOpen, setSnapshotConfirmOpen] = useState(false);
  const [repairDialogOpen, setRepairDialogOpen] = useState(false);
  const [selectedRepairOp, setSelectedRepairOp] = useState<RepairOperationValue>('tables');
  const [scrubCommand, setScrubCommand] = useState<ScrubCommand>('start');

  const connectMutation = useConnectNodes(clusterId);
  const snapshotMutation = useCreateMetadataSnapshot(clusterId);
  const repairMutation = useLaunchRepairOperation(clusterId);
  const { data, isLoading, error } = useQuery<GetClusterStatusResponse>({
    queryKey: ['clusterStatus', clusterId],
    queryFn: async () => {
      const res = await api.get<GetClusterStatusResponse>(
        proxyPath(clusterId, '/v2/GetClusterStatus'),
      );
      return res.data;
    },
  });

  if (isLoading) return <PageLoadingState label="Loading nodes..." />;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load nodes</AlertTitle>
        <AlertDescription>
          {getApiErrorMessage(error, 'Node status could not be loaded.')}
        </AlertDescription>
      </Alert>
    );
  }

  const nodes = data?.nodes ?? [];

  const handleConnectNodes = async () => {
    const entries = connectNodesInput
      .split(/\n+/)
      .map((value) => value.trim())
      .filter(Boolean);
    const invalid = entries.filter((value) => !value.includes('@') || value.includes(','));
    if (entries.length === 0) {
      setConnectError('Enter at least one node in the form node_id@address.');
      return;
    }
    if (invalid.length > 0) {
      setConnectError(`Invalid entries: ${invalid.join(', ')}`);
      return;
    }
    setConnectError('');
    try {
      await connectMutation.mutateAsync({ nodes: entries });
      toast({ title: 'Connect request sent' });
      setConnectDialogOpen(false);
      setConnectNodesInput('');
    } catch (err) {
      setConnectError(getApiErrorMessage(err, 'Failed to connect nodes.'));
    }
  };

  const handleSnapshotAll = async () => {
    try {
      await snapshotMutation.mutateAsync('*');
      toast({ title: 'Snapshot created', description: 'Metadata snapshots requested.' });
      setSnapshotConfirmOpen(false);
    } catch (err) {
      toast({
        title: 'Snapshot failed',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const handleRepairAll = async () => {
    try {
      const repairType: RepairType =
        selectedRepairOp === 'scrub' ? { scrub: scrubCommand } : selectedRepairOp;
      const repairLabel =
        REPAIR_OPERATIONS.find((op) => op.value === selectedRepairOp)?.label ?? selectedRepairOp;
      const repairSuffix = selectedRepairOp === 'scrub' ? ` (${scrubCommand})` : '';
      await repairMutation.mutateAsync({ repairType });
      toast({
        title: 'Repair operation started',
        description: `${repairLabel}${repairSuffix} operation launched for all nodes.`,
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

  const getStatusBadge = (node: NodeResp) => {
    if (node.draining) {
      return <Badge variant="warning">Draining</Badge>;
    }
    return node.isUp ? (
      <Badge variant="success">Up</Badge>
    ) : (
      <Badge variant="destructive">Down</Badge>
    );
  };

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="Nodes"
        description="Cluster node inventory and cluster-wide node operations."
        meta={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <NodeIcon className="h-4 w-4" />
            Layout version:{' '}
            <span className="font-medium text-foreground">{data?.layoutVersion ?? '-'}</span>
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Dialog
              open={connectDialogOpen}
              onOpenChange={(open) => {
                setConnectDialogOpen(open);
                if (!open) {
                  setConnectNodesInput('');
                  setConnectError('');
                }
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <ConnectActionIcon className="mr-2 h-4 w-4" />
                  Connect Nodes
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Connect Cluster Nodes</DialogTitle>
                  <DialogDescription>
                    Instruct this Garage node to connect to other Garage nodes at
                    {' <node_id>@<net_address>'}. Node IDs are generated automatically on node
                    start.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label>Nodes</Label>
                  <Textarea
                    className="min-h-[140px] font-mono"
                    placeholder={`node_id@address
node_id@address`}
                    value={connectNodesInput}
                    onChange={(e) => {
                      setConnectNodesInput(e.target.value);
                      if (connectError) setConnectError('');
                    }}
                  />
                  <p className="text-xs text-muted-foreground">One node per line.</p>
                </div>
                {connectError && (
                  <Alert variant="destructive">
                    <AlertTitle>Connect failed</AlertTitle>
                    <AlertDescription>{connectError}</AlertDescription>
                  </Alert>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConnectDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleConnectNodes} disabled={connectMutation.isPending}>
                    {connectMutation.isPending ? 'Connecting...' : 'Connect'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button variant="outline" size="sm" onClick={() => setSnapshotConfirmOpen(true)}>
              <SnapshotActionIcon className="mr-2 h-4 w-4" />
              Create Snapshot
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRepairDialogOpen(true)}>
              <RepairActionIcon className="mr-2 h-4 w-4" />
              Launch Repair
            </Button>
          </div>
        }
      />

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Node</TableHead>
              <TableHead>Hostname</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Data Disk</TableHead>
              <TableHead>Metadata Disk</TableHead>
              <TableHead>Version</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodes.map((node) => (
              <TableRow
                key={node.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/clusters/${clusterId}/nodes/${node.id}`)}
              >
                <TableCell className="text-xs">{formatShortId(node.id, 10)}</TableCell>
                <TableCell>{node.hostname || '-'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{node.addr || '-'}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {getStatusBadge(node)}
                    {!node.isUp &&
                      node.lastSeenSecsAgo !== null &&
                      node.lastSeenSecsAgo !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          Last seen {formatRelativeSeconds(node.lastSeenSecsAgo)}
                        </span>
                      )}
                  </div>
                </TableCell>
                <TableCell>
                  {node.role ? (
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        Zone: <span className="text-foreground">{node.role.zone}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Capacity:{' '}
                        <span className="text-foreground">
                          {formatBytes(node.role.capacity ?? null)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {node.role.tags.length > 0 ? (
                          node.role.tags.map((tag) => (
                            <Badge key={`${node.id}-${tag}`} variant="outline">
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">No tags</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Unassigned</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {node.dataPartition
                    ? `${formatBytes(node.dataPartition.available)} / ${formatBytes(node.dataPartition.total)}`
                    : '-'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {node.metadataPartition
                    ? `${formatBytes(node.metadataPartition.available)} / ${formatBytes(node.metadataPartition.total)}`
                    : '-'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {node.garageVersion || '-'}
                </TableCell>
              </TableRow>
            ))}
            {nodes.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">
                  No nodes information available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={snapshotConfirmOpen}
        onOpenChange={setSnapshotConfirmOpen}
        title="Create Metadata Snapshot (All Nodes)"
        description="This will create a snapshot of the metadata database on all nodes. This is a non-destructive operation."
        confirmText="Create Snapshot"
        onConfirm={handleSnapshotAll}
        isLoading={snapshotMutation.isPending}
      />

      <Dialog open={repairDialogOpen} onOpenChange={setRepairDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Launch Repair Operation (All Nodes)</DialogTitle>
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
              onClick={handleRepairAll}
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
