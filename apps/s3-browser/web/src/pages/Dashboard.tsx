import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  Pencil,
  HardDrive,
  Globe,
  Loader2,
  AlertCircle,
  FolderOpen,
} from 'lucide-react';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';
import { useToast } from '@/hooks/use-toast';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@garage-admin/ui';
import { ConnectionFormDialog, type ConnectionFormData } from '@/components/ConnectionFormDialog';
import { DeleteConnectionDialog } from '@/components/DeleteConnectionDialog';

interface Connection {
  id: string;
  name: string;
  endpoint: string;
  region: string | null;
  bucket: string | null;
  pathStyle: boolean;
  createdAt: string;
  updatedAt: string;
}

const ADMIN_BRIDGE_PREFIX = 'admin-bridge:';

function getConnectionDisplayName(connection: Connection) {
  const trimmedName = connection.name.trim();

  if (!trimmedName) {
    return 'Unnamed connection';
  }

  if (trimmedName.startsWith(ADMIN_BRIDGE_PREFIX)) {
    return 'Admin bridge connection';
  }

  return trimmedName;
}

function getConnectionInternalId(connection: Connection) {
  return connection.name.trim().startsWith(ADMIN_BRIDGE_PREFIX) ? connection.name : null;
}

function ConnectionFact({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'mono' | 'muted';
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={[
          'mt-1 text-sm leading-relaxed text-foreground',
          tone === 'mono' ? 'break-all font-mono text-xs' : '',
          tone === 'muted' ? 'italic text-muted-foreground' : '',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}

export function Dashboard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [deletingConnection, setDeletingConnection] = useState<Connection | null>(null);

  const {
    data: connections = [],
    isLoading,
    error,
  } = useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: async () => {
      const res = await api.get('/connections');
      return res.data;
    },
  });
  const connectionCountLabel = `${connections.length} saved connection${connections.length === 1 ? '' : 's'}`;

  const createMutation = useMutation({
    mutationFn: async (data: ConnectionFormData) => {
      const res = await api.post('/connections', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      setShowCreateDialog(false);
      toast({ title: 'Connection created', description: 'S3 connection added successfully.' });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Failed to create connection',
        description: getApiErrorMessage(err),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ConnectionFormData> }) => {
      const res = await api.put(`/connections/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      setEditingConnection(null);
      toast({ title: 'Connection updated', description: 'S3 connection updated successfully.' });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Failed to update connection',
        description: getApiErrorMessage(err),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/connections/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      setDeletingConnection(null);
      toast({ title: 'Connection deleted', description: 'S3 connection removed.' });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Failed to delete connection',
        description: getApiErrorMessage(err),
      });
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connections</h1>
          <p className="text-sm text-muted-foreground">
            Manage your S3-compatible storage connections.
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Loading connections...</h2>
              <p className="text-sm text-muted-foreground">
                Fetching your saved S3-compatible endpoints.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Unable to load connections</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(error, 'Failed to load connections')}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Connections</h1>
          <p className="text-sm text-muted-foreground">
            Manage your S3-compatible storage connections.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {connections.length > 0 && (
            <div className="text-sm text-muted-foreground">{connectionCountLabel}</div>
          )}
          <Button className="w-full sm:w-auto" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4" />
            Add Connection
          </Button>
        </div>
      </div>

      {connections.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="flex flex-col items-start justify-center py-12 text-left sm:items-center sm:py-16 sm:text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <HardDrive className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No connections configured yet</h3>
            <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
              Add an S3-compatible storage connection to start browsing buckets and objects here.
            </p>
            <Button className="mt-6 w-full sm:w-auto" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" />
              Add Connection
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div role="list" aria-label="Connection cards" className="grid gap-4 xl:grid-cols-2">
          {connections.map((conn) => (
            <Card
              key={conn.id}
              role="listitem"
              className="overflow-hidden border-border/70 shadow-sm transition-shadow hover:shadow-md"
            >
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <HardDrive className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <CardTitle className="break-words text-base leading-snug">
                      {getConnectionDisplayName(conn)}
                    </CardTitle>
                    <CardDescription className="flex items-start gap-1.5 text-xs [overflow-wrap:anywhere]">
                      <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0">{conn.endpoint}</span>
                    </CardDescription>
                  </div>
                </div>

                {getConnectionInternalId(conn) && (
                  <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2.5">
                    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Internal ID
                    </div>
                    <div className="mt-1 break-all font-mono text-[11px] leading-relaxed text-foreground">
                      {getConnectionInternalId(conn)}
                    </div>
                  </div>
                )}

                <dl className="grid gap-3 md:grid-cols-3">
                  <ConnectionFact
                    label="Bucket"
                    value={conn.bucket || 'All accessible buckets'}
                    tone={conn.bucket ? 'mono' : 'muted'}
                  />
                  <ConnectionFact
                    label="Region"
                    value={conn.region || 'Auto-detect from endpoint'}
                    tone={conn.region ? 'default' : 'muted'}
                  />
                  <ConnectionFact
                    label="Addressing"
                    value={conn.pathStyle ? 'Path-style' : 'Virtual-hosted'}
                  />
                </dl>

                <div className="flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex gap-2 sm:flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 sm:flex-none"
                      aria-label={`Edit ${getConnectionDisplayName(conn)}`}
                      onClick={() => setEditingConnection(conn)}
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive sm:flex-none"
                      aria-label={`Delete ${getConnectionDisplayName(conn)}`}
                      onClick={() => setDeletingConnection(conn)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    className="w-full sm:w-auto"
                    aria-label={`Browse ${getConnectionDisplayName(conn)}`}
                    onClick={() => navigate(`/connections/${conn.id}`)}
                  >
                    <FolderOpen className="h-4 w-4" />
                    Browse
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <ConnectionFormDialog
        key={showCreateDialog ? 'create-open' : 'create-closed'}
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
      />

      {editingConnection && (
        <ConnectionFormDialog
          open={!!editingConnection}
          onOpenChange={(open) => !open && setEditingConnection(null)}
          onSubmit={(data) => updateMutation.mutate({ id: editingConnection.id, data })}
          isLoading={updateMutation.isPending}
          initialData={editingConnection}
        />
      )}

      {deletingConnection && (
        <DeleteConnectionDialog
          open={!!deletingConnection}
          onOpenChange={(open) => !open && setDeletingConnection(null)}
          onConfirm={() => deleteMutation.mutate(deletingConnection.id)}
          isLoading={deleteMutation.isPending}
          connectionName={deletingConnection.name}
        />
      )}
    </div>
  );
}
