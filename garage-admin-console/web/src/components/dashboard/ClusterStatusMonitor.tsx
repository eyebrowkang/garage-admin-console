import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Gauge,
  MoreHorizontal,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  AddPlaceholderCard,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FleetCell,
  FleetListHeader,
  FleetListRow,
  FleetSummaryCard,
  FleetToolbar,
  FleetViewTransition,
  Meter,
  StatusCard,
  useMediaQuery,
  useViewMode,
  type MeterTone,
  type StatusAccent,
  type SummaryStat,
} from '@garage/ui';

// Shared column template for the cluster list table. The header strip and the
// rows are separate grid containers, so every column must be a fixed or `fr`
// width (never content-sized `auto`) — otherwise the empty header actions cell
// and the populated row actions cell size differently and the columns drift.
const LIST_GRID =
  'grid-cols-[minmax(0,1fr)_8rem] md:grid-cols-[minmax(7rem,1.25fr)_minmax(0,1.5fr)_4rem_5rem_7.5rem_5.5rem_7.5rem]';
import { DisconnectActionIcon, EditActionIcon, OpenActionIcon } from '@/lib/action-icons';
import { formatBytes } from '@garage/web-shared';
import { NodeIcon } from '@/lib/entity-icons';
import type {
  ClusterSummary,
  GetClusterHealthResponse,
  GetClusterStatusResponse,
} from '@/types/garage';

interface ClusterWithStatus {
  cluster: ClusterSummary;
  health?: GetClusterHealthResponse;
  status?: GetClusterStatusResponse;
  healthStatus: 'healthy' | 'degraded' | 'unavailable' | 'unreachable' | 'unknown';
  isLoading: boolean;
}

interface ClusterStatusMonitorProps {
  clustersWithStatus: ClusterWithStatus[];
  onEditCluster: (cluster: ClusterSummary) => void;
  onDeleteCluster: (cluster: ClusterSummary) => void;
  onAddCluster: () => void;
}

type HealthStatus = ClusterWithStatus['healthStatus'];
type BadgeVariant = 'secondary' | 'success' | 'warning' | 'destructive';

const statusConfig: Record<
  HealthStatus,
  { label: string; icon: LucideIcon; badge: BadgeVariant; accent: StatusAccent }
> = {
  healthy: { label: 'Healthy', icon: CheckCircle2, badge: 'success', accent: 'success' },
  degraded: { label: 'Degraded', icon: AlertTriangle, badge: 'warning', accent: 'warning' },
  unavailable: { label: 'Unavailable', icon: XCircle, badge: 'destructive', accent: 'destructive' },
  unreachable: { label: 'Unreachable', icon: XCircle, badge: 'destructive', accent: 'destructive' },
  unknown: { label: 'Checking', icon: Activity, badge: 'secondary', accent: 'neutral' },
};

function pressureTone(pressure: number | null): MeterTone {
  if (pressure === null) return 'neutral';
  if (pressure >= 85) return 'destructive';
  if (pressure >= 70) return 'warning';
  return 'success';
}

// Nodes / partitions read "all good" at 100%; anything missing is a warning,
// none up a problem. Used for the per-tile ratio meters.
function ratioTone(pct: number | null): MeterTone {
  if (pct === null) return 'neutral';
  if (pct >= 100) return 'success';
  if (pct > 0) return 'warning';
  return 'destructive';
}

interface ZoneStat {
  capacity: number;
  dataUsed: number;
  dataTotal: number;
  metaUsed: number;
  metaTotal: number;
}

// Garage replicates across zones, so a zone's capacity is the SUM of its nodes'
// capacities and the cluster is bounded by its smallest zone. Group per zone
// once; both the storage-pressure meter and the "min zone capacity" readout
// derive from this. (Comparing raw per-node capacities would understate a zone
// that spreads its capacity over several nodes.)
function buildZoneStats(status?: GetClusterStatusResponse): Map<string, ZoneStat> {
  const zoneStats = new Map<string, ZoneStat>();

  for (const node of status?.nodes ?? []) {
    const zone = node.role?.zone ?? 'unknown';
    const entry = zoneStats.get(zone) ?? {
      capacity: 0,
      dataUsed: 0,
      dataTotal: 0,
      metaUsed: 0,
      metaTotal: 0,
    };

    if (node.role?.capacity) entry.capacity += node.role.capacity;

    if (node.dataPartition) {
      entry.dataTotal += node.dataPartition.total;
      entry.dataUsed += node.dataPartition.total - node.dataPartition.available;
    }

    if (node.metadataPartition) {
      entry.metaTotal += node.metadataPartition.total;
      entry.metaUsed += node.metadataPartition.total - node.metadataPartition.available;
    }

    zoneStats.set(zone, entry);
  }

  return zoneStats;
}

/** Zones that actually carry capacity, smallest-capacity first. */
function zonesByCapacity(status?: GetClusterStatusResponse): ZoneStat[] {
  return Array.from(buildZoneStats(status).values())
    .filter((entry) => entry.capacity > 0)
    .sort((a, b) => a.capacity - b.capacity);
}

/** Storage pressure (%) of the tightest zone — whichever of data/meta is fuller. */
function pressureFromZone(minZone: ZoneStat | undefined): number | null {
  if (!minZone) return null;
  const dataRatio = minZone.dataTotal > 0 ? minZone.dataUsed / minZone.dataTotal : 0;
  const metaRatio = minZone.metaTotal > 0 ? minZone.metaUsed / minZone.metaTotal : 0;
  return Math.max(dataRatio, metaRatio) * 100;
}

function getStatusMessage(item: ClusterWithStatus) {
  // Healthy shows no status text at all — the Nodes tile + capacity already say
  // it; only non-healthy states get a message worth surfacing.
  if (item.healthStatus === 'healthy') return '';
  if (item.healthStatus === 'unknown' || item.isLoading) return 'Checking cluster health...';
  if (item.healthStatus === 'unreachable') return 'Unable to reach health endpoint.';
  if (item.healthStatus === 'degraded') return 'Cluster degraded. Review details in cluster page.';
  return 'Cluster reports unavailable health.';
}

/** Per-cluster derived values shared by the card and list renderers. */
function deriveCluster(item: ClusterWithStatus) {
  const config = statusConfig[item.healthStatus];
  const nodes = item.status?.nodes ?? [];
  const up = nodes.filter((node) => node.isUp).length;
  // Capacity is compared per ZONE (nodes in the same zone are summed), since
  // Garage's usable capacity is bounded by its smallest zone — not its smallest
  // node. The pressure meter reads from that same tightest zone.
  const minZone = zonesByCapacity(item.status)[0];
  const pressure = pressureFromZone(minZone);
  const minCapacity = minZone ? minZone.capacity : null;
  const nodesTotal = nodes.length;
  const partitionsOk = item.health?.partitionsAllOk ?? null;
  const partitionsTotal = item.health?.partitions ?? null;
  const nodesLabel = nodesTotal > 0 ? `${up}/${nodesTotal}` : '—';
  const partitionsLabel = item.health
    ? `${item.health.partitionsAllOk}/${item.health.partitions}`
    : '—';

  return {
    config,
    nodes,
    up,
    nodesTotal,
    pressure,
    minCapacity,
    partitionsOk,
    partitionsTotal,
    nodesLabel,
    partitionsLabel,
  };
}

export function ClusterStatusMonitor({
  clustersWithStatus,
  onEditCluster,
  onDeleteCluster,
  onAddCluster,
}: ClusterStatusMonitorProps) {
  const [view, setView] = useViewMode('garage.dashboard.view');
  // Mobile is card-only: the list view sheds metric columns on small screens, so
  // below md we ignore the stored preference and always render cards.
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const effectiveView = isDesktop ? view : 'card';

  if (clustersWithStatus.length === 0) return null;

  const healthy = clustersWithStatus.filter((item) => item.healthStatus === 'healthy').length;
  const warning = clustersWithStatus.filter((item) => item.healthStatus === 'degraded').length;
  const error = clustersWithStatus.filter(
    (item) => item.healthStatus === 'unavailable' || item.healthStatus === 'unreachable',
  ).length;
  const checking = clustersWithStatus.filter((item) => item.healthStatus === 'unknown').length;
  const totalNodes = clustersWithStatus.reduce(
    (sum, item) => sum + (item.status?.nodes?.length ?? 0),
    0,
  );
  const nodesUp = clustersWithStatus.reduce(
    (sum, item) => sum + (item.status?.nodes?.filter((node) => node.isUp).length ?? 0),
    0,
  );

  const stats: SummaryStat[] = [
    {
      label: 'Healthy',
      value: healthy,
      tone: 'success',
      icon: CheckCircle2,
      emphasized: healthy > 0,
    },
    {
      label: 'Warnings',
      value: warning,
      tone: 'warning',
      icon: AlertTriangle,
      emphasized: warning > 0,
    },
    { label: 'Errors', value: error, tone: 'destructive', icon: XCircle, emphasized: error > 0 },
    {
      label: 'Nodes Up',
      value: `${nodesUp}/${totalNodes}`,
      hint: checking > 0 ? `Checking: ${checking}` : undefined,
    },
  ];

  // Render as a fragment (not a wrapping div) so the summary / toolbar / grid
  // become direct children of the page's `space-y-4` container — keeping the
  // dashboard DOM structurally identical to the S3 Browser HomePage.
  // The aggregate summary only earns its space once the fleet is large enough to
  // be worth summarising; at 1–2 clusters it just restates the cards below it.
  const showSummary = clustersWithStatus.length >= 3;

  return (
    <>
      {showSummary && (
        <FleetSummaryCard
          title="Cluster Fleet Summary"
          description="Top-level health and capacity indicators for all connected clusters."
          stats={stats}
        />
      )}

      <FleetToolbar
        label="Clusters"
        count={clustersWithStatus.length}
        view={view}
        onViewChange={setView}
      />

      <FleetViewTransition view={effectiveView}>
        {effectiveView === 'card' ? (
          <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
            {clustersWithStatus.map((item) => (
              <ClusterCard
                key={item.cluster.id}
                item={item}
                onEdit={() => onEditCluster(item.cluster)}
                onDelete={() => onDeleteCluster(item.cluster)}
              />
            ))}
            {clustersWithStatus.length === 1 && (
              <AddPlaceholderCard label="Connect another cluster" onClick={onAddCluster} />
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <FleetListHeader
              primaryLabel="Cluster"
              metricLabels={['Endpoint', 'Nodes', 'Partitions', 'Pressure', 'Capacity']}
              gridClassName={LIST_GRID}
            />
            {clustersWithStatus.map((item) => (
              <ClusterRow
                key={item.cluster.id}
                item={item}
                onEdit={() => onEditCluster(item.cluster)}
                onDelete={() => onDeleteCluster(item.cluster)}
              />
            ))}
          </div>
        )}
      </FleetViewTransition>
    </>
  );
}

function ClusterActionsMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-foreground/70 hover:bg-muted hover:text-foreground"
          aria-label="More cluster actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <EditActionIcon className="h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onClick={onDelete}>
          <DisconnectActionIcon className="h-4 w-4" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ClusterCard({
  item,
  onEdit,
  onDelete,
}: {
  item: ClusterWithStatus;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    config,
    nodes,
    up,
    nodesTotal,
    pressure,
    minCapacity,
    partitionsOk,
    partitionsTotal,
    nodesLabel,
    partitionsLabel,
  } = deriveCluster(item);
  const StatusIcon = config.icon;
  const statusMsg = getStatusMessage(item);
  const nodesPct = nodesTotal > 0 ? (up / nodesTotal) * 100 : null;
  const partitionsPct =
    partitionsTotal && partitionsTotal > 0 ? ((partitionsOk ?? 0) / partitionsTotal) * 100 : null;

  return (
    <StatusCard accent={config.accent}>
      <div className="space-y-3 p-3 sm:p-5">
        {/* Header row: name + endpoint, status badge, overflow menu */}
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <Link
              to={`/clusters/${item.cluster.id}`}
              className="inline-flex max-w-full items-center gap-2 truncate text-sm font-semibold transition-colors hover:text-primary sm:text-base"
            >
              <span className="truncate">{item.cluster.name}</span>
            </Link>
            <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {item.cluster.endpoint}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant={config.badge}>
              <StatusIcon className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">{config.label}</span>
            </Badge>
            <ClusterActionsMenu onEdit={onEdit} onDelete={onDelete} />
          </div>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-2">
          <MetricTile
            icon={NodeIcon}
            label="Nodes"
            value={nodesLabel}
            meterValue={nodesPct}
            meterTone={ratioTone(nodesPct)}
          />
          <MetricTile
            icon={Boxes}
            label="Partitions"
            value={partitionsLabel}
            meterValue={partitionsPct}
            meterTone={ratioTone(partitionsPct)}
          />
          <PressureTile pressure={pressure} />
        </div>

        {/* Status line + capacity — healthy clusters show only the capacity, no
            status copy (the Nodes tile already conveys health). */}
        {(statusMsg || (nodes.length > 0 && minCapacity !== null)) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {statusMsg && <span>{statusMsg}</span>}
            {nodes.length > 0 && minCapacity !== null && (
              <>
                {statusMsg && <span className="text-border">|</span>}
                <span>
                  Min zone capacity:{' '}
                  <span className="font-medium text-foreground">{formatBytes(minCapacity)}</span>
                </span>
              </>
            )}
          </div>
        )}

        {/* Primary action — Edit/Disconnect live in the overflow menu above */}
        <div className="pt-1">
          <Button asChild size="sm" variant="outline" className="h-9">
            <Link to={`/clusters/${item.cluster.id}`}>
              <OpenActionIcon className="mr-2 h-4 w-4" />
              Open
            </Link>
          </Button>
        </div>
      </div>
    </StatusCard>
  );
}

function ClusterRow({
  item,
  onEdit,
  onDelete,
}: {
  item: ClusterWithStatus;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { config, pressure, minCapacity, nodesLabel, partitionsLabel } = deriveCluster(item);
  const StatusIcon = config.icon;

  const to = `/clusters/${item.cluster.id}`;

  return (
    <FleetListRow
      accent={config.accent}
      gridClassName={LIST_GRID}
      identity={
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              to={to}
              className="truncate text-sm font-semibold transition-colors hover:text-primary"
            >
              {item.cluster.name}
            </Link>
            <Badge variant={config.badge} className="shrink-0">
              <StatusIcon className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">{config.label}</span>
            </Badge>
          </div>
          {/* Endpoint owns its own column on md+, so surface it here only on mobile. */}
          <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground md:hidden">
            {item.cluster.endpoint}
          </div>
        </div>
      }
      metrics={[
        <FleetCell key="endpoint" mono value={item.cluster.endpoint} />,
        <FleetCell key="nodes" value={nodesLabel} />,
        <FleetCell key="partitions" value={partitionsLabel} />,
        <PressureCell key="pressure" pressure={pressure} />,
        <FleetCell key="capacity" value={minCapacity !== null ? formatBytes(minCapacity) : '—'} />,
      ]}
      actions={
        <>
          <Button asChild size="sm" variant="outline" className="h-8">
            <Link to={to}>
              <OpenActionIcon className="mr-1.5 h-4 w-4" />
              Open
            </Link>
          </Button>
          <ClusterActionsMenu onEdit={onEdit} onDelete={onDelete} />
        </>
      }
    />
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  meterValue,
  meterTone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  meterValue?: number | null;
  meterTone?: MeterTone;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
      <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      {meterValue != null && (
        <Meter value={meterValue} tone={meterTone} ariaLabel={label} className="mt-1.5" />
      )}
    </div>
  );
}

function PressureTile({ pressure }: { pressure: number | null }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
      <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        <Gauge className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Pressure</span>
      </div>
      <div className="text-sm font-semibold tabular-nums">
        {pressure === null ? '—' : `${pressure.toFixed(0)}%`}
      </div>
      {pressure !== null && (
        <Meter
          value={pressure}
          tone={pressureTone(pressure)}
          ariaLabel="Storage pressure"
          className="mt-1.5"
        />
      )}
    </div>
  );
}

/** Inline pressure cell for the list table: percent + a compact meter. */
function PressureCell({ pressure }: { pressure: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium tabular-nums text-foreground">
        {pressure === null ? '—' : `${pressure.toFixed(0)}%`}
      </span>
      {pressure !== null && (
        <Meter
          value={pressure}
          tone={pressureTone(pressure)}
          ariaLabel="Storage pressure"
          className="w-14"
        />
      )}
    </div>
  );
}
