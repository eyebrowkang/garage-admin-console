import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Badge,
  Alert,
  AlertDescription,
  AlertTitle,
  ResourceList,
  type ResourceListColumn,
  CopyValue,
  EmptyValue,
  Meter,
  type MeterTone,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@garage/ui';
import { MoreHorizontal } from 'lucide-react';
import { formatBytes, formatRelativeSeconds, formatShortId, getApiErrorMessage } from '@garage/web-shared';
import { ModulePageHeader } from '@garage/ui';
import { TableLoadingState } from '@/components/cluster/TableLoadingState';
import {
  ConnectActionIcon,
  OpenActionIcon,
  RepairActionIcon,
  SnapshotActionIcon,
} from '@/lib/action-icons';
import { NodeIcon } from '@/lib/entity-icons';
import { useClusterContext } from '@/contexts/ClusterContext';
import { useNodes } from '@/hooks/useNodes';
import {
  ConnectNodesDialog,
  RepairDialog,
  SnapshotDialog,
} from '@/components/cluster/NodeMaintenanceDialogs';
import type { FreeSpaceResp, NodeResp } from '@/types/garage';

function getStatusBadge(node: NodeResp) {
  if (node.draining) {
    return <Badge variant="warning">Draining</Badge>;
  }
  return node.isUp ? <Badge variant="success">Up</Badge> : <Badge variant="destructive">Down</Badge>;
}

/** Used fraction (0–100) of a storage partition, or null when unknown (sorts last). */
function usedPercent(partition?: FreeSpaceResp | null): number | null {
  if (!partition || partition.total <= 0) return null;
  return ((partition.total - partition.available) / partition.total) * 100;
}

/** A compact disk-usage meter with a used / total caption, color-coded by pressure. */
function DiskUsage({ partition }: { partition?: FreeSpaceResp | null }) {
  const pct = usedPercent(partition);
  if (pct === null || !partition) return <EmptyValue />;
  const tone: MeterTone = pct >= 90 ? 'destructive' : pct >= 70 ? 'warning' : 'success';
  const used = partition.total - partition.available;
  return (
    <div className="min-w-[7rem] max-w-[13rem] space-y-1">
      <Meter value={pct} tone={tone} ariaLabel={`Data partition ${Math.round(pct)}% used`} />
      <div className="flex justify-between gap-2 text-xs tabular-nums text-muted-foreground">
        <span className="text-foreground">{Math.round(pct)}%</span>
        <span>
          {formatBytes(used)} / {formatBytes(partition.total)}
        </span>
      </div>
    </div>
  );
}

export function ClusterNodeList() {
  const { clusterId } = useClusterContext();
  const navigate = useNavigate();
  const [connectOpen, setConnectOpen] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotNode, setSnapshotNode] = useState<NodeResp | null>(null);
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairNode, setRepairNode] = useState<NodeResp | null>(null);

  const { data, isLoading, error } = useNodes(clusterId);

  // A null node opens the dialog cluster-wide (Target defaults to All); a node
  // pre-selects it (the Target selector still lets you switch).
  const openSnapshot = (node: NodeResp | null) => {
    setSnapshotNode(node);
    setSnapshotOpen(true);
  };
  const openRepair = (node: NodeResp | null) => {
    setRepairNode(node);
    setRepairOpen(true);
  };

  const columns: ResourceListColumn<NodeResp>[] = [
    {
      id: 'node',
      header: 'Node',
      sortable: true,
      sortAccessor: (n) => n.hostname ?? n.id,
      mobileHidden: true, // identity becomes the mobile card title/subtitle
      cell: (n) => (
        <div className="min-w-0">
          <div className="font-medium text-foreground">{n.hostname || 'Unknown host'}</div>
          <CopyValue
            value={n.id}
            label="Node ID"
            className="max-w-[22ch] font-mono text-xs text-muted-foreground"
          >
            {formatShortId(n.id, 16)}
          </CopyValue>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      sortAccessor: (n) => (n.draining ? 'draining' : n.isUp ? 'up' : 'down'),
      // items-start keeps the badge at its content width instead of stretching
      // to fill the column.
      cell: (n) => (
        <div className="flex flex-col items-start gap-1">
          {getStatusBadge(n)}
          {!n.isUp && n.lastSeenSecsAgo != null && (
            <span className="text-xs text-muted-foreground">
              Last seen {formatRelativeSeconds(n.lastSeenSecsAgo)}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'zone',
      header: 'Zone',
      sortable: true,
      sortAccessor: (n) => n.role?.zone ?? '',
      cell: (n) =>
        n.role ? (
          <div className="space-y-1">
            <div className="text-sm text-foreground">{n.role.zone}</div>
            {n.role.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                {n.role.tags.slice(0, 2).map((tag) => (
                  <Badge key={`${n.id}-${tag}`} variant="outline" className="font-normal">
                    {tag}
                  </Badge>
                ))}
                {n.role.tags.length > 2 && (
                  <span className="text-xs text-muted-foreground">+{n.role.tags.length - 2}</span>
                )}
              </div>
            )}
          </div>
        ) : (
          <EmptyValue label="Unassigned" className="text-xs" />
        ),
    },
    {
      id: 'capacity',
      header: 'Capacity',
      sortable: true,
      sortAccessor: (n) => n.role?.capacity ?? null,
      cellClassName: 'text-sm text-muted-foreground',
      cell: (n) =>
        !n.role ? (
          <EmptyValue />
        ) : n.role.capacity == null ? (
          'Gateway'
        ) : (
          formatBytes(n.role.capacity)
        ),
    },
    {
      id: 'dataUsage',
      header: 'Data usage',
      sortable: true,
      sortAccessor: (n) => usedPercent(n.dataPartition),
      cell: (n) => <DiskUsage partition={n.dataPartition} />,
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
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setConnectOpen(true)}>
              <ConnectActionIcon className="h-4 w-4" />
              Connect Nodes
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More node actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => openSnapshot(null)}>
                  <SnapshotActionIcon />
                  Create snapshot
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openRepair(null)}>
                  <RepairActionIcon />
                  Launch repair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <ResourceList
        items={nodes}
        getRowId={(n) => n.id}
        columns={columns}
        onRowClick={(n) => navigate(`/clusters/${clusterId}/nodes/${n.id}`)}
        getRowLabel={(n) => `Open node ${n.hostname || formatShortId(n.id, 10)}`}
        renderTitle={(n) => (
          <CopyValue value={n.id} label="Node ID" className="max-w-full">
            {n.hostname || formatShortId(n.id, 16)}
          </CopyValue>
        )}
        renderSubtitle={(n) =>
          n.hostname ? (
            <CopyValue
              value={n.id}
              label="Node ID"
              className="max-w-full font-mono text-xs text-muted-foreground"
            >
              {formatShortId(n.id, 20)}
            </CopyValue>
          ) : null
        }
        defaultSort={{ columnId: 'status', direction: 'asc' }}
        search={{
          placeholder: 'Search by hostname, ID, address, zone, or tag...',
          predicate: (n, q) =>
            n.id.toLowerCase().includes(q) ||
            (n.hostname ?? '').toLowerCase().includes(q) ||
            (n.addr ?? '').toLowerCase().includes(q) ||
            (n.role?.zone ?? '').toLowerCase().includes(q) ||
            (n.role?.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
        }}
        filters={[
          {
            id: 'status',
            label: 'Status',
            options: [
              { value: 'up', label: 'Up', predicate: (n) => n.isUp && !n.draining },
              { value: 'draining', label: 'Draining', predicate: (n) => n.draining },
              { value: 'down', label: 'Down', predicate: (n) => !n.isUp },
            ],
          },
        ]}
        actions={(n) => [
          {
            label: 'Create snapshot',
            icon: SnapshotActionIcon,
            onSelect: () => openSnapshot(n),
          },
          {
            label: 'Launch repair',
            icon: RepairActionIcon,
            onSelect: () => openRepair(n),
          },
          {
            label: 'Open',
            icon: OpenActionIcon,
            onSelect: () => navigate(`/clusters/${clusterId}/nodes/${n.id}`),
          },
        ]}
        emptyState={{
          icon: NodeIcon,
          title: 'No nodes connected',
          description: 'Cluster nodes are not communicating or none have been connected.',
          action: (
            <Button variant="outline" size="sm" onClick={() => setConnectOpen(true)}>
              <ConnectActionIcon className="h-4 w-4 mr-2" /> Connect Nodes
            </Button>
          ),
        }}
      />

      <ConnectNodesDialog clusterId={clusterId} open={connectOpen} onOpenChange={setConnectOpen} />
      <SnapshotDialog
        clusterId={clusterId}
        open={snapshotOpen}
        onOpenChange={setSnapshotOpen}
        allowScopeSelection
        nodeId={snapshotNode?.id}
        nodeLabel={snapshotNode?.hostname ?? undefined}
      />
      <RepairDialog
        clusterId={clusterId}
        open={repairOpen}
        onOpenChange={setRepairOpen}
        allowScopeSelection
        nodeId={repairNode?.id}
        nodeLabel={repairNode?.hostname ?? undefined}
      />
    </div>
  );
}
