/**
 * Dashboard — lists every S3 connection as a Card with CRUD actions.
 *
 * Visual contract mirrors garage-admin-console/web/src/pages/Dashboard.tsx +
 * ClusterStatusMonitor 1:1 so the two products read as the same suite:
 *   - ModulePageHeader-style title row
 *   - "Connection Fleet Summary" overview card (border-primary/30 bg-primary/5)
 *   - md:grid-cols-2 grid of connection cards, tinted by reachability
 *   - three metric tiles per card with lucide-icon labels
 *   - Open / Edit / Remove actions in the same h-9 button row
 */
import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Edit2,
  Globe,
  HardDrive,
  Link2Off,
  Plus,
  Server,
  XCircle,
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@garage/ui';

import { api } from '@/lib/api';
import { connectionDisplayMeta, formatShortDate } from '@/lib/connection-display';
import type { Bucket as BucketInfo, Connection } from '@/lib/types';

interface ConnectionFormData {
  name: string;
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
}

const EMPTY_FORM: ConnectionFormData = {
  name: '',
  endpoint: '',
  region: 'us-east-1',
  forcePathStyle: true,
  accessKeyId: '',
  secretAccessKey: '',
};

const normalizeEndpoint = (value: string) => value.trim().replace(/\/+$/, '');

type Status = 'healthy' | 'unreachable' | 'checking';

interface ConnectionStatus {
  buckets?: BucketInfo[];
  error?: Error;
  isLoading: boolean;
  status: Status;
}

const statusConfig = {
  healthy: {
    label: 'Healthy',
    icon: CheckCircle2,
    badge: 'success' as const,
    iconClass: 'text-green-600',
    bgClass: 'bg-green-50 border-green-200',
  },
  unreachable: {
    label: 'Unreachable',
    icon: XCircle,
    badge: 'destructive' as const,
    iconClass: 'text-destructive',
    bgClass: 'bg-destructive/5 border-destructive/30',
  },
  checking: {
    label: 'Checking',
    icon: Activity,
    badge: 'secondary' as const,
    iconClass: 'text-primary',
    bgClass: 'bg-primary/5 border-primary/25',
  },
};

export function HomePage({ onOpenConnection }: { onOpenConnection: (id: string) => void }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Connection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null);
  const [formError, setFormError] = useState('');

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

  const createMut = useMutation({
    mutationFn: async (data: ConnectionFormData) => {
      const endpoint = normalizeEndpoint(data.endpoint);
      const dup = connections.find(
        (c) => normalizeEndpoint(c.endpoint).toLowerCase() === endpoint.toLowerCase(),
      );
      if (dup) throw new Error(`A connection for "${endpoint}" already exists as "${dup.name}".`);
      const res = await api.post<Connection>('/connections', { ...data, endpoint });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] });
      setAddOpen(false);
      setFormError('');
    },
    onError: (err: Error) => setFormError(err.message || 'Failed to create connection.'),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ConnectionFormData> }) => {
      const res = await api.put<Connection>(`/connections/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] });
      setEditTarget(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/connections/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] });
      setDeleteTarget(null);
    },
  });

  return (
    <div className="space-y-6">
      {/* ModulePageHeader */}
      <div className="flex flex-col gap-2 sm:gap-3 border-b border-border/70 pb-3 sm:pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-0.5 sm:space-y-1">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Endpoint-level overview first. Open a connection for bucket browsing and object
            operations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end shrink-0">
          <Dialog
            open={addOpen}
            onOpenChange={(o) => {
              setAddOpen(o);
              if (!o) setFormError('');
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Add Connection
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Add S3 Connection</DialogTitle>
                <DialogDescription>
                  Add an S3-compatible endpoint to manage. Credentials are encrypted at rest.
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
        </div>
      </div>

      {list.error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load connections</AlertTitle>
          <AlertDescription>{(list.error as Error).message}</AlertDescription>
        </Alert>
      )}

      {/* Fleet summary — pixel match for ClusterStatusMonitor's overview card */}
      {connections.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="grid gap-4 p-4 sm:p-5 md:grid-cols-5">
            <div className="md:col-span-2">
              <p className="text-xs font-medium uppercase tracking-wider text-primary/70">
                Overview
              </p>
              <h2 className="mt-0.5 text-lg sm:text-xl font-semibold">Connection Fleet Summary</h2>
              <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
                Reachability and bucket counts across all configured endpoints.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm md:col-span-3 md:grid-cols-4 sm:gap-3">
              <SummaryStat label="Healthy" value={summary.healthy} tone="text-green-700" />
              <SummaryStat
                label="Unreachable"
                value={summary.unreachable}
                tone="text-destructive"
              />
              <SummaryStat label="Checking" value={summary.checking} />
              <SummaryStat label="Buckets" value={summary.buckets} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connection grid */}
      {connections.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {connections.map((connection) => (
            <ConnectionCard
              key={connection.id}
              connection={connection}
              status={
                statusById.get(connection.id) ?? { isLoading: true, status: 'checking' }
              }
              onOpen={() => onOpenConnection(connection.id)}
              onEdit={() => setEditTarget(connection)}
              onDelete={() => setDeleteTarget(connection)}
            />
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
        open={editTarget !== null}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Connection</DialogTitle>
            <DialogDescription>
              Leave secret fields blank to keep the existing credentials.
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <ConnectionForm
              initial={{
                name: editTarget.name,
                endpoint: editTarget.endpoint,
                region: editTarget.region,
                forcePathStyle: editTarget.forcePathStyle,
                accessKeyId: '',
                secretAccessKey: '',
              }}
              mode="edit"
              error=""
              busy={updateMut.isPending}
              onSubmit={(d) => {
                if (!editTarget) return;
                const patch: Partial<ConnectionFormData> = {
                  name: d.name,
                  endpoint: normalizeEndpoint(d.endpoint),
                  region: d.region,
                  forcePathStyle: d.forcePathStyle,
                };
                if (d.accessKeyId) patch.accessKeyId = d.accessKeyId;
                if (d.secretAccessKey) patch.secretAccessKey = d.secretAccessKey;
                updateMut.mutate({ id: editTarget.id, data: patch });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Remove Connection</DialogTitle>
            <DialogDescription>
              Remove “{deleteTarget?.name}” from this console? Buckets and objects in the underlying
              S3 endpoint are not touched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              {deleteMut.isPending ? 'Removing…' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tracking-tight ${tone ?? ''}`}>{value}</div>
    </div>
  );
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
  const meta = connectionDisplayMeta(connection);
  const config = statusConfig[status.status];
  const StatusIcon = config.icon;
  const bucketCount = status.buckets?.length ?? 0;

  return (
    <Card className={`border ${config.bgClass} transition-shadow hover:shadow-md`}>
      <CardContent className="space-y-3 p-4 sm:p-5">
        {/* Header row: name + endpoint + status badge — no avatar, mirrors admin */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              onClick={onOpen}
              className="inline-flex items-center gap-2 text-base font-semibold text-left hover:text-primary transition-colors"
            >
              {connection.name}
            </button>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {connection.endpoint}
            </div>
          </div>
          <Badge variant={config.badge} className="shrink-0">
            <StatusIcon className={`mr-1 h-3.5 w-3.5 ${config.iconClass}`} />
            {config.label}
          </Badge>
        </div>

        {/* Metrics row — icon + label, matches admin tile shape */}
        <div className="grid gap-2 grid-cols-3">
          <MetricTile icon={Globe} label="Provider" value={meta.provider} />
          <MetricTile icon={HardDrive} label="Region" value={connection.region} />
          <MetricTile
            icon={Server}
            label="Buckets"
            value={status.status === 'healthy' ? String(bucketCount) : '—'}
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
              Updated {formatShortDate(connection.updatedAt)}
            </span>
          </span>
        </div>

        {/* Actions — same shape and h-9 sizing as admin's cluster cards */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            className="h-9"
            onClick={onOpen}
            disabled={status.status !== 'healthy'}
          >
            <ArrowRight className="mr-2 h-4 w-4" />
            Open
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={onEdit}>
            <Edit2 className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
          >
            <Link2Off className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Remove</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-2">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{label}</span>
      </div>
      <div className="truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function ConnectionForm({
  initial,
  mode,
  error,
  busy,
  onSubmit,
}: {
  initial: ConnectionFormData;
  mode: 'create' | 'edit';
  error: string;
  busy: boolean;
  onSubmit: (data: ConnectionFormData) => void;
}) {
  const [form, setForm] = useState(initial);
  const isEdit = mode === 'edit';
  const canSubmit =
    form.name.trim() &&
    form.endpoint.trim() &&
    (isEdit ? true : form.accessKeyId.trim() && form.secretAccessKey.trim());

  return (
    <>
      <div className="grid gap-4 py-2">
        <div className="grid gap-2">
          <Label htmlFor="conn-name">Friendly Name</Label>
          <Input
            id="conn-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Production Garage"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="conn-endpoint">Endpoint URL</Label>
          <Input
            id="conn-endpoint"
            value={form.endpoint}
            placeholder="https://s3.example.com"
            onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="conn-region">Region</Label>
            <Input
              id="conn-region"
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
            />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <input
              id="forcePathStyle"
              type="checkbox"
              checked={form.forcePathStyle}
              onChange={(e) => setForm({ ...form, forcePathStyle: e.target.checked })}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <label htmlFor="forcePathStyle" className="text-sm">
              Path-style addressing
            </label>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="conn-key">Access Key ID{isEdit ? ' (optional)' : ''}</Label>
          <Input
            id="conn-key"
            value={form.accessKeyId}
            placeholder={isEdit ? 'Leave blank to keep existing' : 'AKIA…'}
            onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="conn-secret">Secret Access Key{isEdit ? ' (optional)' : ''}</Label>
          <Input
            id="conn-secret"
            type="password"
            value={form.secretAccessKey}
            placeholder={isEdit ? 'Leave blank to keep existing' : ''}
            onChange={(e) => setForm({ ...form, secretAccessKey: e.target.value })}
          />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(form)} disabled={!canSubmit || busy}>
          {busy ? (isEdit ? 'Saving…' : 'Adding…') : isEdit ? 'Save Changes' : 'Add Connection'}
        </Button>
      </DialogFooter>
    </>
  );
}
