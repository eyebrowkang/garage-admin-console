import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Badge,
  Alert,
  AlertDescription,
  AlertTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ResourceList,
  type ResourceListColumn,
} from '@garage/ui';
import {
  formatBytes,
  formatRelativeSeconds,
  formatShortId,
  getApiErrorMessage,
} from '@garage/web-shared';
import { ConfirmDialog } from '@garage/ui';
import { CopyButton } from '@garage/ui';
import { ModulePageHeader } from '@garage/ui';
import { TableLoadingState } from '@/components/cluster/TableLoadingState';
import { ConnectActionIcon, RepairActionIcon, SnapshotActionIcon } from '@/lib/action-icons';
import { toast } from '@garage/ui';
import { NodeIcon } from '@/lib/entity-icons';
import { useClusterContext } from '@/contexts/ClusterContext';
import {
  useConnectNodes,
  useCreateMetadataSnapshot,
  useLaunchRepairOperation,
  useNodes,
} from '@/hooks/useNodes';
import type { NodeResp, RepairType, ScrubCommand } from '@/types/garage';

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

function getStatusBadge(node: NodeResp) {
  if (node.draining) {
    return <Badge variant="warning">Draining</Badge>;
  }
  return node.isUp ? (
    <Badge variant="success">Up</Badge>
  ) : (
    <Badge variant="destructive">Down</Badge>
  );
}

export function ClusterNodeList() {
  const { clusterId } = useClusterContext();
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
  const { data, isLoading, error } = useNodes(clusterId);

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
      await connectMutation.mutateAsync(entries);
      toast({ title: 'Connect request sent', variant: 'success' });
      setConnectDialogOpen(false);
      setConnectNodesInput('');
    } catch (err) {
      setConnectError(getApiErrorMessage(err, 'Failed to connect nodes.'));
    }
  };

  const handleSnapshotAll = async () => {
    try {
      await snapshotMutation.mutateAsync('*');
      toast({
        title: 'Snapshot created',
        description: 'Metadata snapshots requested.',
        variant: 'success',
      });
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

  const columns: ResourceListColumn<NodeResp>[] = [
    {
      id: 'id',
      header: 'Node',
      sortable: true,
      sortAccessor: (n) => n.id,
      mobileHidden: true,
      cellClassName: 'text-xs',
      cell: (n) => (
        <div className="inline-flex items-center gap-1">
          <span>{formatShortId(n.id, 10)}</span>
          <CopyButton value={n.id} label="Node ID" compact />
        </div>
      ),
    },
    {
      id: 'hostname',
      header: 'Hostname',
      sortable: true,
      sortAccessor: (n) => n.hostname ?? '',
      cell: (n) => n.hostname || '—',
    },
    {
      id: 'addr',
      header: 'Address',
      cellClassName: 'text-xs text-muted-foreground',
      cell: (n) =>
        n.addr ? (
          <div className="inline-flex items-center gap-1">
            <span>{n.addr}</span>
            <CopyButton value={n.addr} label="Node address" compact />
          </div>
        ) : (
          '—'
        ),
    },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      sortAccessor: (n) => (n.draining ? 'draining' : n.isUp ? 'up' : 'down'),
      cell: (n) => (
        <div className="flex flex-col gap-1">
          {getStatusBadge(n)}
          {!n.isUp && n.lastSeenSecsAgo !== null && n.lastSeenSecsAgo !== undefined && (
            <span className="text-xs text-muted-foreground">
              Last seen {formatRelativeSeconds(n.lastSeenSecsAgo)}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      sortable: true,
      sortAccessor: (n) => n.role?.zone ?? '',
      cell: (n) =>
        n.role ? (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">
              Zone: <span className="text-foreground">{n.role.zone}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Capacity:{' '}
              <span className="text-foreground">{formatBytes(n.role.capacity ?? null)}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {n.role.tags.length > 0 ? (
                n.role.tags.map((tag) => (
                  <Badge key={`${n.id}-${tag}`} variant="outline">
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
        ),
    },
    {
      id: 'dataDisk',
      header: 'Data Disk',
      cellClassName: 'text-xs text-muted-foreground',
      cell: (n) =>
        n.dataPartition
          ? `${formatBytes(n.dataPartition.available)} / ${formatBytes(n.dataPartition.total)}`
          : '—',
    },
    {
      id: 'metadataDisk',
      header: 'Metadata Disk',
      cellClassName: 'text-xs text-muted-foreground',
      cell: (n) =>
        n.metadataPartition
          ? `${formatBytes(n.metadataPartition.available)} / ${formatBytes(n.metadataPartition.total)}`
          : '—',
    },
    {
      id: 'version',
      header: 'Version',
      cellClassName: 'text-xs text-muted-foreground',
      cell: (n) => n.garageVersion || '—',
    },
  ];

  if (isLoading) return <TableLoadingState label="Loading nodes..." />;

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

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="Nodes"
        description="Cluster node inventory and cluster-wide node operations."
        meta={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <NodeIcon className="h-4 w-4" />
            Layout version:{' '}
            <span className="font-medium text-foreground">{data?.layoutVersion ?? '—'}</span>
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
                  <ConnectActionIcon className="h-4 w-4" />
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
              <SnapshotActionIcon className="h-4 w-4" />
              Create Snapshot
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRepairDialogOpen(true)}>
              <RepairActionIcon className="h-4 w-4" />
              Launch Repair
            </Button>
          </div>
        }
      />

      <ResourceList
        items={nodes}
        getRowId={(n) => n.id}
        columns={columns}
        onRowClick={(n) => navigate(`/clusters/${clusterId}/nodes/${n.id}`)}
        renderTitle={(n) => (
          <div className="inline-flex items-center gap-1 text-sm">
            <span>{n.hostname || formatShortId(n.id, 10)}</span>
            <CopyButton value={n.id} label="Node ID" compact />
          </div>
        )}
        search={{
          placeholder: 'Search by hostname, ID, address, zone, or tag...',
          predicate: (n, q) =>
            n.id.toLowerCase().includes(q) ||
            (n.hostname ?? '').toLowerCase().includes(q) ||
            (n.addr ?? '').toLowerCase().includes(q) ||
            (n.role?.zone ?? '').toLowerCase().includes(q) ||
            (n.role?.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
        }}
        emptyState={{
          icon: NodeIcon,
          title: 'No nodes connected',
          description: 'Cluster nodes are not communicating or none have been connected.',
          action: (
            <Button variant="outline" size="sm" onClick={() => setConnectDialogOpen(true)}>
              <ConnectActionIcon className="h-4 w-4 mr-2" /> Connect Nodes
            </Button>
          ),
        }}
      />

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
