/**
 * Dashboard — lists every S3 connection as a card or row with CRUD actions.
 *
 * Visual contract mirrors garage-admin-console/web/src/pages/Dashboard.tsx +
 * ClusterStatusMonitor so the two products read as the same suite: a neutral
 * FleetSummaryCard, a FleetToolbar (count + list/card toggle), StatusCard
 * entities carrying status via a full subtle border + badge, an Open primary
 * action with Edit/Disconnect tucked into a `⋯` menu, and a dashed
 * "+ add another" cell when the fleet holds a single endpoint.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Edit2,
  HardDrive,
  Link2Off,
  MoreHorizontal,
  Plus,
  Server,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  AddPlaceholderCard,
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  ModulePageHeader,
  StatusCard,
  useMediaQuery,
  useViewMode,
  type StatusAccent,
  type SummaryStat,
} from '@garage/ui';

import { formatDate } from '@garage/web-shared';
import { api } from '@/lib/api';
import { connectionProvider } from '@/lib/connection-display';
import {
  ConnectionForm,
  EMPTY_FORM,
  normalizeEndpoint,
  type ConnectionFormData,
} from '@/components/ConnectionForm';
import { toast } from '@garage/ui';
import type { Bucket as BucketInfo, Connection } from '@/lib/types';

type Status = 'healthy' | 'unreachable' | 'checking';

interface ConnectionStatus {
  buckets?: BucketInfo[];
  error?: Error;
  isLoading: boolean;
  status: Status;
}

type BadgeVariant = 'secondary' | 'success' | 'destructive';

const statusConfig: Record<
  Status,
  { label: string; icon: LucideIcon; badge: BadgeVariant; accent: StatusAccent }
> = {
  healthy: { label: 'Healthy', icon: CheckCircle2, badge: 'success', accent: 'success' },
  unreachable: { label: 'Unreachable', icon: XCircle, badge: 'destructive', accent: 'destructive' },
  checking: { label: 'Checking', icon: Activity, badge: 'secondary', accent: 'neutral' },
};

// Shared column template for the connection list table. Header strip and rows
// are separate grid containers, so columns are fixed/`fr` (never content-sized
// `auto`) to keep the empty-header and populated-row actions cells the same
// width — otherwise the columns drift out of alignment.
const LIST_GRID =
  'grid-cols-[minmax(0,1fr)_8rem] md:grid-cols-[minmax(7rem,1.2fr)_minmax(0,1.4fr)_7.5rem_4.5rem_4.5rem_6rem_7.5rem]';

export function HomePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Connection | null>(null);
  // Visibility is tracked apart from the target so closing keeps the form mounted
  // through the exit animation (matches the Add dialog); editTarget is only
  // replaced when a new edit opens, never cleared mid-close.
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null);
  const [formError, setFormError] = useState('');
  const [view, setView] = useViewMode('s3browser.home.view');
  // Mobile is card-only: the list view sheds metric columns on small screens, so
  // below md we ignore the stored preference and always render cards.
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const effectiveView = isDesktop ? view : 'card';

  const list = useQuery({
    queryKey: ['connections'],
    queryFn: async () => {
      const res = await api.get<Connection[]>('/connections');
      return res.data;
    },
  });

  const connections = list.data ?? [];

  // Probe each connection's bucket list to derive a live health signal —
  // mirrors Dashboard.tsx's per-cluster useQueries fan-out.
  const bucketQueries = useQueries({
    queries: connections.map((c) => ({
      queryKey: ['connection-buckets', c.id],
      queryFn: async () => {
        const res = await api.get<{ buckets: BucketInfo[] }>(`/connections/${c.id}/buckets`);
        return res.data.buckets;
      },
      enabled: connections.length > 0,
      staleTime: 60_000,
      refetchInterval: 60_000,
    })),
  });

  const statusById = new Map<string, ConnectionStatus>();
  connections.forEach((c, i) => {
    const q = bucketQueries[i];
    const error = q?.error as Error | undefined;
    let status: Status = 'checking';
    if (error) status = 'unreachable';
    else if (q?.data) status = 'healthy';
    statusById.set(c.id, {
      buckets: q?.data,
      error,
      isLoading: q?.isLoading ?? false,
      status,
    });
  });

  const summary = (() => {
    let healthy = 0;
    let unreachable = 0;
    let checking = 0;
    let buckets = 0;
    for (const c of connections) {
      const s = statusById.get(c.id);
      if (!s) continue;
      if (s.status === 'healthy') {
        healthy += 1;
        buckets += s.buckets?.length ?? 0;
      } else if (s.status === 'unreachable') unreachable += 1;
      else checking += 1;
    }
    return { healthy, unreachable, checking, buckets };
  })();

  const stats: SummaryStat[] = [
    {
      label: 'Healthy',
      value: summary.healthy,
      tone: 'success',
      icon: CheckCircle2,
      emphasized: summary.healthy > 0,
    },
    {
      label: 'Unreachable',
      value: summary.unreachable,
      tone: 'destructive',
      icon: XCircle,
      emphasized: summary.unreachable > 0,
    },
    {
      label: 'Checking',
      value: summary.checking,
      hint: summary.checking > 0 ? 'Probing endpoints…' : undefined,
    },
    { label: 'Buckets', value: summary.buckets },
  ];

  const createMut = useMutation({
    mutationFn: async (data: ConnectionFormData) => {
      const endpoint = normalizeEndpoint(data.endpoint);
      const dup = connections.find(
        (c) => normalizeEndpoint(c.endpoint).toLowerCase() === endpoint.toLowerCase(),
      );
      if (dup) throw new Error(`A connection for "${endpoint}" already exists as "${dup.name}".`);
      const payload = {
        ...data,
        endpoint,
        bucket: data.bucket.trim() || undefined,
      };
      const res = await api.post<Connection>('/connections', payload);
      return res.data;
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['connections'] });
      setAddOpen(false);
      setFormError('');
      toast({ title: 'Connected', description: created.name, variant: 'success' });
    },
    onError: (err: Error) => setFormError(err.message || 'Failed to create connection.'),
  });

  const updateMut = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Omit<ConnectionFormData, 'bucket'>> & { bucket?: string | null };
    }) => {
      const res = await api.put<Connection>(`/connections/${id}`, data);
      return res.data;
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['connections'] });
      setEditOpen(false);
      toast({ title: 'Connection updated', description: updated.name, variant: 'success' });
    },
    onError: (err: Error) => {
      toast({
        title: 'Failed to update connection',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/connections/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] });
      const name = deleteTarget?.name;
      setDeleteTarget(null);
      toast({ title: 'Connection disconnected', description: name, variant: 'success' });
    },
    onError: (err: Error) => {
      toast({
        title: 'Failed to disconnect connection',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Skip the ConnectionView step when there's only one bucket — the detour adds
  // a click without surfacing any choice. A scoped connection always has one.
  const openTarget = (connection: Connection, status: ConnectionStatus) => {
    const onlyBucket = connection.bucket
      ? connection.bucket
      : status.buckets?.length === 1
        ? (status.buckets[0]?.name ?? null)
        : null;
    return onlyBucket
      ? `/connections/${connection.id}/b/${encodeURIComponent(onlyBucket)}`
      : `/connections/${connection.id}`;
  };

  const openEdit = (connection: Connection) => {
    setEditTarget(connection);
    setEditOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <ModulePageHeader
        title="Dashboard"
        description="Endpoint-level overview first. Open a connection for bucket browsing and object operations."
        actions={
          <Dialog
            open={addOpen}
            onOpenChange={(o) => {
              setAddOpen(o);
              if (!o) setFormError('');
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" /> Connect
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[540px]">
              <DialogHeader>
                <DialogTitle>Connect to S3</DialogTitle>
                <DialogDescription>
                  Connect an S3-compatible endpoint to manage. Credentials are encrypted at rest.
                </DialogDescription>
              </DialogHeader>
              <ConnectionForm
                initial={EMPTY_FORM}
                mode="create"
                error={formError}
                busy={createMut.isPending}
                onSubmit={(d) => createMut.mutate(d)}
              />
            </DialogContent>
          </Dialog>
        }
      />

      {list.error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load connections</AlertTitle>
          <AlertDescription>{(list.error as Error).message}</AlertDescription>
        </Alert>
      )}

      {/* Aggregate summary only earns its space once the fleet is worth summarising;
          at 1–2 connections it merely restates the cards below. */}
      {connections.length >= 3 && (
        <FleetSummaryCard
          title="Connection Fleet Summary"
          description="Reachability and bucket counts across all configured endpoints."
          stats={stats}
        />
      )}
      {connections.length > 0 && (
        <FleetToolbar
          label="Connections"
          count={connections.length}
          view={view}
          onViewChange={setView}
        />
      )}

      {/* Card / list views — wrapped so switching layout fades the new one in. */}
      {connections.length > 0 && (
        <FleetViewTransition view={effectiveView}>
          {effectiveView === 'card' ? (
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
              {connections.map((connection) => {
                const status = statusById.get(connection.id) ?? {
                  isLoading: true,
                  status: 'checking' as const,
                };
                return (
                  <ConnectionCard
                    key={connection.id}
                    connection={connection}
                    status={status}
                    onOpen={() => navigate(openTarget(connection, status))}
                    onEdit={() => openEdit(connection)}
                    onDelete={() => setDeleteTarget(connection)}
                  />
                );
              })}
              {connections.length === 1 && (
                <AddPlaceholderCard
                  label="Connect another endpoint"
                  onClick={() => setAddOpen(true)}
                />
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <FleetListHeader
                primaryLabel="Connection"
                metricLabels={['Endpoint', 'Provider', 'Region', 'Buckets', 'Style']}
                gridClassName={LIST_GRID}
              />
              {connections.map((connection) => {
                const status = statusById.get(connection.id) ?? {
                  isLoading: true,
                  status: 'checking' as const,
                };
                return (
                  <ConnectionRow
                    key={connection.id}
                    connection={connection}
                    status={status}
                    onOpen={() => navigate(openTarget(connection, status))}
                    onEdit={() => openEdit(connection)}
                    onDelete={() => setDeleteTarget(connection)}
                  />
                );
              })}
            </div>
          )}
        </FleetViewTransition>
      )}

      {/* Initial load skeleton */}
      {list.isLoading && (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border-border/70">
              <CardContent className="h-44 animate-pulse bg-muted/30" />
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!list.isLoading && connections.length === 0 && (
        <Card className="border-2 border-dashed bg-muted/30">
          <CardContent className="flex h-64 flex-col items-center justify-center space-y-4 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Server className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">No connections yet</h3>
              <p className="text-muted-foreground">Add an S3-compatible endpoint to get started.</p>
            </div>
            <Button variant="outline" onClick={() => setAddOpen(true)}>
              Add Connection
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Edit dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          if (!o) setEditOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>Edit Connection</DialogTitle>
            <DialogDescription>
              Leave secret fields blank to keep the existing credentials.
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <ConnectionForm
              key={editTarget.id}
              initial={{
                name: editTarget.name,
                endpoint: editTarget.endpoint,
                region: editTarget.region,
                forcePathStyle: editTarget.forcePathStyle,
                accessKeyId: '',
                secretAccessKey: '',
                bucket: editTarget.bucket ?? '',
              }}
              mode="edit"
              error=""
              busy={updateMut.isPending}
              onSubmit={(d) => {
                if (!editTarget) return;
                const patch: Partial<Omit<ConnectionFormData, 'bucket'>> & {
                  bucket?: string | null;
                } = {
                  name: d.name,
                  endpoint: normalizeEndpoint(d.endpoint),
                  region: d.region,
                  forcePathStyle: d.forcePathStyle,
                };
                if (d.accessKeyId) patch.accessKeyId = d.accessKeyId;
                if (d.secretAccessKey) patch.secretAccessKey = d.secretAccessKey;
                const nextBucket = d.bucket.trim();
                const prevBucket = editTarget.bucket ?? '';
                if (nextBucket !== prevBucket) {
                  patch.bucket = nextBucket ? nextBucket : null;
                }
                updateMut.mutate({ id: editTarget.id, data: patch });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm — shared ConfirmDialog (danger tier), mirrors the admin Dashboard. */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Disconnect Connection"
        description={`Disconnect “${deleteTarget?.name}” from this console? Buckets and objects in the underlying S3 endpoint are not touched.`}
        tier="danger"
        confirmText="Disconnect"
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        isLoading={deleteMut.isPending}
      />
    </div>
  );
}

function ConnectionActionsMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-foreground/70 hover:bg-muted hover:text-foreground"
          aria-label="More connection actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Edit2 className="h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onClick={onDelete}>
          <Link2Off className="h-4 w-4" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function bucketsValue(connection: Connection, status: ConnectionStatus): string {
  if (connection.bucket) return connection.bucket;
  const bucketCount = status.buckets?.length ?? 0;
  return status.status === 'healthy' ? String(bucketCount) : '—';
}

function ConnectionCard({
  connection,
  status,
  onOpen,
  onEdit,
  onDelete,
}: {
  connection: Connection;
  status: ConnectionStatus;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const provider = connectionProvider(connection);
  const config = statusConfig[status.status];
  const StatusIcon = config.icon;
  const bucketCount = status.buckets?.length ?? 0;

  return (
    <StatusCard accent={config.accent}>
      <div className="space-y-3 p-3 sm:p-5">
        {/* Header row: name + provider chip + endpoint, status badge, overflow menu */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <button
                onClick={onOpen}
                className="truncate text-left text-base font-semibold transition-colors hover:text-primary"
              >
                {connection.name}
              </button>
              <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
                {provider}
              </Badge>
            </div>
            <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {connection.endpoint}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant={config.badge}>
              <StatusIcon className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">{config.label}</span>
            </Badge>
            <ConnectionActionsMenu onEdit={onEdit} onDelete={onDelete} />
          </div>
        </div>

        {/* Metrics row — provider moved to the chip above, so two roomy tiles. */}
        <div className="grid grid-cols-2 gap-2">
          <MetricTile icon={HardDrive} label="Region" value={connection.region} />
          <MetricTile
            icon={Server}
            label={connection.bucket ? 'Scoped' : 'Buckets'}
            value={bucketsValue(connection, status)}
          />
        </div>

        {/* Status line + addressing/updated */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {status.status === 'unreachable' && <span>Could not reach endpoint.</span>}
          {status.status === 'checking' && <span>Checking endpoint…</span>}
          {status.status === 'healthy' && (
            <span>
              {bucketCount} bucket{bucketCount === 1 ? '' : 's'} accessible
            </span>
          )}
          <span className="text-border">|</span>
          <span>
            {connection.forcePathStyle ? 'Path-style' : 'Virtual-host-style'} ·{' '}
            <span className="font-medium text-foreground">
              Updated {formatDate(connection.updatedAt)}
            </span>
          </span>
        </div>

        {/* Primary action — Edit/Disconnect live in the overflow menu above */}
        <div className="pt-1">
          <Button size="sm" variant="outline" className="h-9" onClick={onOpen}>
            <ArrowRight className="mr-2 h-4 w-4" />
            Open
          </Button>
        </div>
      </div>
    </StatusCard>
  );
}

function ConnectionRow({
  connection,
  status,
  onOpen,
  onEdit,
  onDelete,
}: {
  connection: Connection;
  status: ConnectionStatus;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const provider = connectionProvider(connection);
  const config = statusConfig[status.status];
  const StatusIcon = config.icon;

  return (
    <FleetListRow
      accent={config.accent}
      gridClassName={LIST_GRID}
      identity={
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={onOpen}
              className="truncate text-sm font-semibold transition-colors hover:text-primary"
            >
              {connection.name}
            </button>
            <Badge variant={config.badge} className="shrink-0">
              <StatusIcon className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">{config.label}</span>
            </Badge>
          </div>
          {/* Endpoint owns its own column on md+, so surface it here only on mobile. */}
          <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground md:hidden">
            {connection.endpoint}
          </div>
        </div>
      }
      metrics={[
        <FleetCell key="endpoint" mono value={connection.endpoint} />,
        <FleetCell key="provider" value={provider} />,
        <FleetCell key="region" value={connection.region} />,
        <FleetCell key="buckets" value={bucketsValue(connection, status)} />,
        <FleetCell key="style" value={connection.forcePathStyle ? 'Path-style' : 'Virtual-host'} />,
      ]}
      actions={
        <>
          <Button size="sm" variant="outline" className="h-8" onClick={onOpen}>
            <ArrowRight className="mr-1.5 h-4 w-4" />
            Open
          </Button>
          <ConnectionActionsMenu onEdit={onEdit} onDelete={onDelete} />
        </>
      }
    />
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
      <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="truncate text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
