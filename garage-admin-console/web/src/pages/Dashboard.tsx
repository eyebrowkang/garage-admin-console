import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Card,
  CardContent,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Alert,
  AlertDescription,
  AlertTitle,
} from '@garage/ui';
import { ChevronRight } from 'lucide-react';
import { AddActionIcon } from '@/lib/action-icons';
import { api, proxyPath } from '@/lib/api';
import { isMfExplicitlyConfigured } from '@/mf-init';
import { getApiErrorMessage } from '@garage/web-shared';
import { ConfirmDialog } from '@garage/ui';
import { ClusterStatusMonitor } from '@/components/dashboard/ClusterStatusMonitor';
import { ModulePageHeader } from '@garage/ui';
import { toast } from '@garage/ui';
import { useClusters } from '@/hooks/useClusters';
import type {
  ClusterSummary,
  GetClusterHealthResponse,
  GetClusterStatusResponse,
} from '@/types/garage';

type ClusterFormState = {
  name: string;
  endpoint: string;
  adminToken: string;
  metricToken: string;
  s3Endpoint: string;
  s3Region: string;
  s3ForcePathStyle: boolean;
};

type ClusterUpdatePayload = {
  name?: string;
  endpoint?: string;
  adminToken?: string;
  metricToken?: string;
  s3Endpoint?: string | null;
  s3Region?: string | null;
  s3ForcePathStyle?: boolean | null;
};

const normalizeEndpoint = (value: string) => value.trim().replace(/\/+$/, '');

const emptyForm: ClusterFormState = {
  name: '',
  endpoint: '',
  adminToken: '',
  metricToken: '',
  s3Endpoint: '',
  s3Region: '',
  s3ForcePathStyle: true,
};

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [clusterForm, setClusterForm] = useState<ClusterFormState>(emptyForm);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<ClusterFormState>(emptyForm);
  const [editCluster, setEditCluster] = useState<ClusterSummary | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ClusterSummary | null>(null);
  const [formError, setFormError] = useState('');
  const [editError, setEditError] = useState('');

  const { data: clusters = [], isLoading, error } = useClusters();

  // Fetch health for all clusters with auto-refresh
  const healthQueries = useQueries({
    queries: clusters.map((cluster) => ({
      queryKey: ['clusterHealth', cluster.id],
      queryFn: async () => {
        const res = await api.get<GetClusterHealthResponse>(
          proxyPath(cluster.id, '/v2/GetClusterHealth'),
        );
        return res.data;
      },
      enabled: clusters.length > 0,
      staleTime: 30000,
      refetchInterval: 30000,
    })),
  });

  // Fetch status (for node info) for all clusters with auto-refresh
  const statusQueries = useQueries({
    queries: clusters.map((cluster) => ({
      queryKey: ['clusterStatus', cluster.id],
      queryFn: async () => {
        const res = await api.get<GetClusterStatusResponse>(
          proxyPath(cluster.id, '/v2/GetClusterStatus'),
        );
        return res.data;
      },
      enabled: clusters.length > 0,
      staleTime: 30000,
      refetchInterval: 30000,
    })),
  });

  // Build clusters with status for monitoring. useQueries preserves input
  // order, so the per-cluster results line up with `clusters` by index.
  const clustersWithStatus = clusters.map((cluster, index) => {
    const healthQuery = healthQueries[index];
    const health = healthQuery?.data;
    const healthError = healthQuery?.error;
    const healthStatus = health?.status ?? (healthError ? 'unreachable' : 'unknown');
    const isLoading = !health && !healthError;

    return {
      cluster,
      health,
      status: statusQueries[index]?.data,
      healthStatus: healthStatus as
        | 'healthy'
        | 'degraded'
        | 'unavailable'
        | 'unreachable'
        | 'unknown',
      isLoading,
    };
  });

  const createMutation = useMutation({
    mutationFn: async (data: ClusterFormState) => {
      const endpoint = normalizeEndpoint(data.endpoint);
      // Check for duplicate endpoint
      const existing = clusters.find(
        (c) => normalizeEndpoint(c.endpoint).toLowerCase() === endpoint.toLowerCase(),
      );
      if (existing) {
        throw new Error(`Cluster with endpoint "${endpoint}" already exists as "${existing.name}"`);
      }
      const s3Endpoint = data.s3Endpoint.trim() || undefined;
      const payload = {
        name: data.name.trim(),
        endpoint,
        adminToken: data.adminToken.trim(),
        metricToken: data.metricToken.trim() || undefined,
        s3Endpoint,
        s3Region: data.s3Region.trim() || undefined,
        s3ForcePathStyle: s3Endpoint ? data.s3ForcePathStyle : undefined,
      };
      await api.post('/clusters', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      setIsCreateDialogOpen(false);
      setClusterForm(emptyForm);
      setFormError('');
      toast({ title: 'Cluster connected', variant: 'success' });
    },
    onError: (err) => {
      setFormError(getApiErrorMessage(err, 'Failed to connect cluster.'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ClusterUpdatePayload }) => {
      await api.put(`/clusters/${id}`, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      queryClient.invalidateQueries({ queryKey: ['clusterHealth', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['clusterStatus', variables.id] });
      setIsEditDialogOpen(false);
      setEditForm(emptyForm);
      setEditCluster(null);
      setEditError('');
      toast({ title: 'Cluster updated', variant: 'success' });
    },
    onError: (err) => {
      setEditError(getApiErrorMessage(err, 'Failed to update cluster.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/clusters/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      setDeleteConfirm(null);
      toast({ title: 'Cluster disconnected', variant: 'success' });
    },
    onError: (err) => {
      toast({
        title: 'Failed to disconnect',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    },
  });

  const isCreateDisabled =
    !clusterForm.name.trim() ||
    !clusterForm.endpoint.trim() ||
    !clusterForm.adminToken.trim() ||
    createMutation.isPending;

  const isEditDisabled =
    !editForm.name.trim() || !editForm.endpoint.trim() || updateMutation.isPending;

  const openEditDialog = (cluster: ClusterSummary) => {
    setEditCluster(cluster);
    setEditForm({
      name: cluster.name,
      endpoint: cluster.endpoint,
      adminToken: '',
      metricToken: '',
      s3Endpoint: cluster.s3Endpoint ?? '',
      s3Region: cluster.s3Region ?? '',
      s3ForcePathStyle: cluster.s3ForcePathStyle !== 'false',
    });
    setEditError('');
    setIsEditDialogOpen(true);
  };

  const handleEditSave = () => {
    if (!editCluster) return;

    const payload: ClusterUpdatePayload = {};
    const name = editForm.name.trim();
    const endpoint = normalizeEndpoint(editForm.endpoint);

    if (name && name !== editCluster.name) {
      payload.name = name;
    }

    if (endpoint && endpoint !== normalizeEndpoint(editCluster.endpoint)) {
      const existing = clusters.find(
        (c) =>
          c.id !== editCluster.id &&
          normalizeEndpoint(c.endpoint).toLowerCase() === endpoint.toLowerCase(),
      );
      if (existing) {
        setEditError(`Cluster with endpoint "${endpoint}" already exists as "${existing.name}"`);
        return;
      }
      payload.endpoint = endpoint;
    }

    if (editForm.adminToken.trim()) {
      payload.adminToken = editForm.adminToken.trim();
    }

    if (editForm.metricToken.trim()) {
      payload.metricToken = editForm.metricToken.trim();
    }

    const newS3Endpoint = editForm.s3Endpoint.trim() || null;
    if (newS3Endpoint !== (editCluster.s3Endpoint ?? null)) {
      payload.s3Endpoint = newS3Endpoint;
    }

    const newS3Region = editForm.s3Region.trim() || null;
    if (newS3Region !== (editCluster.s3Region ?? null)) {
      payload.s3Region = newS3Region;
    }

    const currentPathStyle = editCluster.s3ForcePathStyle !== 'false';
    if (editForm.s3ForcePathStyle !== currentPathStyle) {
      payload.s3ForcePathStyle = editForm.s3ForcePathStyle;
    }

    if (Object.keys(payload).length === 0) {
      setEditError('No changes to save.');
      return;
    }

    updateMutation.mutate({ id: editCluster.id, data: payload });
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <ModulePageHeader
        title="Dashboard"
        description="Cluster-level overview first. Open a cluster for deeper operations and diagnostics."
        actions={
          <Dialog
            open={isCreateDialogOpen}
            onOpenChange={(open) => {
              setIsCreateDialogOpen(open);
              if (!open) {
                setFormError('');
                setClusterForm(emptyForm);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <AddActionIcon className="h-4 w-4" /> Connect
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Connect Garage Cluster</DialogTitle>
                <DialogDescription>Add a new existing Garage cluster to manage.</DialogDescription>
              </DialogHeader>
              <ClusterForm
                form={clusterForm}
                setForm={setClusterForm}
                mode="create"
                error={formError}
              />
              <DialogFooter>
                <Button
                  onClick={() => createMutation.mutate(clusterForm)}
                  disabled={isCreateDisabled}
                >
                  {createMutation.isPending ? 'Connecting...' : 'Connect'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) {
            setEditError('');
            setEditForm(emptyForm);
            setEditCluster(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Update Cluster</DialogTitle>
            <DialogDescription>
              Edit connection details. Leave token fields blank to keep existing values.
            </DialogDescription>
          </DialogHeader>
          <ClusterForm form={editForm} setForm={setEditForm} mode="edit" error={editError} />
          <DialogFooter>
            <Button onClick={handleEditSave} disabled={isEditDisabled}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load clusters</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(error, 'Unable to fetch clusters.')}
          </AlertDescription>
        </Alert>
      )}

      {/* Initial load skeleton — mirrors the S3 Browser HomePage card grid so
          the two dashboards load identically (skeleton, not a bare spinner). */}
      {isLoading && (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border-border/70">
              <CardContent className="h-44 animate-pulse bg-muted/30" />
            </Card>
          ))}
        </div>
      )}

      {/* Cluster Status Monitor */}
      {clusters.length > 0 && (
        <ClusterStatusMonitor
          clustersWithStatus={clustersWithStatus}
          onEditCluster={openEditDialog}
          onDeleteCluster={setDeleteConfirm}
          onAddCluster={() => setIsCreateDialogOpen(true)}
        />
      )}

      {/* Empty State */}
      {!isLoading && clusters.length === 0 && (
        <Card className="border-dashed border-2 bg-muted/30">
          <CardContent className="h-64 flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <AddActionIcon className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">No clusters connected</h3>
              <p className="text-muted-foreground">
                Start by connecting your first Garage cluster.
              </p>
            </div>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(true)}>
              Connect Now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Disconnect Cluster"
        description={`Are you sure you want to disconnect "${deleteConfirm?.name}"? This will remove it from the console but won't affect the cluster itself.`}
        tier="danger"
        confirmText="Disconnect"
        onConfirm={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

function ClusterForm({
  form,
  setForm,
  mode,
  error,
}: {
  form: ClusterFormState;
  setForm: (form: ClusterFormState) => void;
  mode: 'create' | 'edit';
  error: string;
}) {
  const isEdit = mode === 'edit';
  const hasAdvancedValues = !!(form.s3Endpoint || form.s3Region || !form.s3ForcePathStyle);
  const [advancedOpen, setAdvancedOpen] = useState(isEdit && hasAdvancedValues);

  return (
    <div className="-mx-1 max-h-[min(70vh,560px)] overflow-y-auto px-1">
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="name">Friendly Name</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Production Cluster"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="endpoint">Endpoint URL</Label>
          <Input
            id="endpoint"
            value={form.endpoint}
            onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
            placeholder="http://10.0.0.1:3903"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="token">Admin Token{isEdit ? ' (optional)' : ''}</Label>
          <Input
            id="token"
            type="password"
            value={form.adminToken}
            onChange={(e) => setForm({ ...form, adminToken: e.target.value })}
            placeholder={isEdit ? 'Leave blank to keep current token' : 'Garage Admin API Token'}
          />
          {isEdit && (
            <p className="text-xs text-muted-foreground">
              Leave blank to keep the existing admin token.
            </p>
          )}
        </div>

        {/* Collapsible advanced section */}
        <div>
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex w-full items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight
              className={`h-4 w-4 shrink-0 transition-transform ${advancedOpen ? 'rotate-90' : ''}`}
            />
            Advanced
          </button>

          {advancedOpen && (
            <div className="mt-3 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="metric-token">
                  Metric Token{isEdit ? ' — leave blank to keep' : ''}
                </Label>
                <Input
                  id="metric-token"
                  type="password"
                  value={form.metricToken}
                  onChange={(e) => setForm({ ...form, metricToken: e.target.value })}
                  placeholder={
                    isEdit
                      ? 'Leave blank to keep current metric token'
                      : 'Token for /metrics endpoint'
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Falls back to admin token if not set.
                </p>
              </div>

              {isMfExplicitlyConfigured && (
                <>
                  <div className="flex items-center gap-2 pt-1">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs font-medium text-muted-foreground">
                      S3 Object Storage
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="s3-endpoint">S3 Endpoint</Label>
                    <Input
                      id="s3-endpoint"
                      value={form.s3Endpoint}
                      onChange={(e) => setForm({ ...form, s3Endpoint: e.target.value })}
                      placeholder="Auto: same host, port 3900"
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave blank to derive from the admin endpoint.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="s3-region">S3 Region</Label>
                    <Input
                      id="s3-region"
                      value={form.s3Region}
                      onChange={(e) => setForm({ ...form, s3Region: e.target.value })}
                      placeholder="garage"
                    />
                    <p className="text-xs text-muted-foreground">
                      Garage ignores this but some S3 clients require it.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="s3-path-style"
                      checked={form.s3ForcePathStyle}
                      onCheckedChange={(checked) => setForm({ ...form, s3ForcePathStyle: checked })}
                    />
                    <Label htmlFor="s3-path-style" className="cursor-pointer font-normal">
                      Force path-style access
                    </Label>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
