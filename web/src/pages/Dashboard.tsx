import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Server,
  Trash2,
  ArrowRight,
  Activity,
  MapPin,
  AlertTriangle,
  Database,
  HardDrive,
  Edit2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { api, proxyPath } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';
import { formatDateTime, formatBytes } from '@/lib/format';
import { ClusterHealthChart } from '@/components/charts/ClusterHealthChart';
import { NodeStatusChart } from '@/components/charts/NodeStatusChart';
import { ConfirmDialog } from '@/components/cluster/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import type {
  ClusterSummary,
  GetClusterHealthResponse,
  GetClusterStatusResponse,
} from '@/types/garage';

type ClusterFormState = {
  name: string;
  endpoint: string;
  region: string;
  adminToken: string;
  metricToken: string;
};

const emptyForm: ClusterFormState = {
  name: '',
  endpoint: '',
  region: '',
  adminToken: '',
  metricToken: '',
};

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [clusterForm, setClusterForm] = useState<ClusterFormState>(emptyForm);
  const [editingCluster, setEditingCluster] = useState<ClusterSummary | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<ClusterSummary | null>(null);
  const [formError, setFormError] = useState('');

  const {
    data: clusters = [],
    isLoading,
    error,
  } = useQuery<ClusterSummary[]>({
    queryKey: ['clusters'],
    queryFn: async () => {
      const res = await api.get<ClusterSummary[]>('/clusters');
      return res.data;
    },
  });

  // Fetch health for all clusters
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
    })),
  });

  // Fetch status (for node info) for all clusters
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
    })),
  });

  // Build maps for quick lookup
  const healthById = new Map<string, GetClusterHealthResponse | undefined>();
  const statusById = new Map<string, GetClusterStatusResponse | undefined>();
  clusters.forEach((cluster, index) => {
    healthById.set(cluster.id, healthQueries[index]?.data);
    statusById.set(cluster.id, statusQueries[index]?.data);
  });

  // Calculate aggregate statistics
  const healthyClusters = clusters.filter((c) => healthById.get(c.id)?.status === 'healthy').length;
  const degradedClusters = clusters.filter(
    (c) => healthById.get(c.id)?.status === 'degraded',
  ).length;
  const unavailableClusters = clusters.filter(
    (c) =>
      healthById.get(c.id)?.status === 'unavailable' || healthQueries[clusters.indexOf(c)]?.error,
  ).length;

  let totalNodes = 0;
  let totalNodesUp = 0;
  let totalCapacity = 0;
  let totalUsed = 0;

  clusters.forEach((cluster) => {
    const status = statusById.get(cluster.id);
    if (status?.nodes) {
      totalNodes += status.nodes.length;
      totalNodesUp += status.nodes.filter((n) => n.isUp).length;
      status.nodes.forEach((node) => {
        if (node.role?.capacity) {
          totalCapacity += node.role.capacity;
        }
        if (node.dataPartition) {
          totalUsed += node.dataPartition.total - node.dataPartition.available;
        }
      });
    }
  });

  // Node status data for chart
  const nodeStatusData = clusters.map((cluster) => {
    const status = statusById.get(cluster.id);
    const nodes = status?.nodes || [];
    return {
      clusterName: cluster.name,
      up: nodes.filter((n) => n.isUp && !n.draining).length,
      down: nodes.filter((n) => !n.isUp).length,
      draining: nodes.filter((n) => n.draining).length,
    };
  });

  const createMutation = useMutation({
    mutationFn: async (data: ClusterFormState) => {
      const payload = {
        name: data.name.trim(),
        endpoint: data.endpoint.trim(),
        region: data.region.trim() || undefined,
        adminToken: data.adminToken.trim(),
        metricToken: data.metricToken.trim() || undefined,
      };
      await api.post('/clusters', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      setIsCreateDialogOpen(false);
      setClusterForm(emptyForm);
      setFormError('');
      toast({ title: 'Cluster connected' });
    },
    onError: (err) => {
      setFormError(getApiErrorMessage(err, 'Failed to connect cluster.'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ClusterFormState }) => {
      const payload = {
        name: data.name.trim(),
        endpoint: data.endpoint.trim(),
        region: data.region.trim() || undefined,
        adminToken: data.adminToken.trim() || undefined,
        metricToken: data.metricToken.trim() || undefined,
      };
      await api.put(`/clusters/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      setIsEditDialogOpen(false);
      setEditingCluster(null);
      setClusterForm(emptyForm);
      setFormError('');
      toast({ title: 'Cluster updated' });
    },
    onError: (err) => {
      setFormError(getApiErrorMessage(err, 'Failed to update cluster.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/clusters/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusters'] });
      setDeleteConfirm(null);
      toast({ title: 'Cluster disconnected' });
    },
    onError: (err) => {
      toast({
        title: 'Failed to disconnect',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    },
  });

  const handleOpenEdit = (cluster: ClusterSummary) => {
    setEditingCluster(cluster);
    setClusterForm({
      name: cluster.name,
      endpoint: cluster.endpoint,
      region: cluster.region || '',
      adminToken: '',
      metricToken: '',
    });
    setFormError('');
    setIsEditDialogOpen(true);
  };

  const isCreateDisabled =
    !clusterForm.name.trim() ||
    !clusterForm.endpoint.trim() ||
    !clusterForm.adminToken.trim() ||
    createMutation.isPending;

  const isUpdateDisabled =
    !clusterForm.name.trim() || !clusterForm.endpoint.trim() || updateMutation.isPending;

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage your Garage storage clusters from a centralized view.
          </p>
        </div>

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
            <Button
              size="lg"
              className="shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
            >
              <Plus className="mr-2 h-5 w-5" /> Connect Cluster
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
              showTokenFields
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
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load clusters</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(error, 'Unable to fetch clusters.')}
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      {clusters.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Server className="h-4 w-4" />
                Total Clusters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{clusters.length}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {healthyClusters} healthy, {degradedClusters} degraded
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Database className="h-4 w-4" />
                Total Nodes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalNodes}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {totalNodesUp} online, {totalNodes - totalNodesUp} offline
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Total Capacity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatBytes(totalCapacity)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {formatBytes(totalUsed)} used
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Health Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {unavailableClusters > 0 ? (
                  <>
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <span className="text-2xl font-bold text-destructive">
                      {unavailableClusters}
                    </span>
                    <span className="text-sm text-muted-foreground">issues</span>
                  </>
                ) : (
                  <>
                    <div className="h-3 w-3 rounded-full bg-green-500" />
                    <span className="text-lg font-medium">All OK</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Section */}
      {clusters.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Cluster Health</CardTitle>
              <CardDescription>Overview of cluster availability status</CardDescription>
            </CardHeader>
            <CardContent>
              <ClusterHealthChart
                healthy={healthyClusters}
                degraded={degradedClusters}
                unavailable={unavailableClusters}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Node Status</CardTitle>
              <CardDescription>Node availability across clusters</CardDescription>
            </CardHeader>
            <CardContent>
              <NodeStatusChart data={nodeStatusData} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cluster Cards */}
      {clusters.length === 0 ? (
        <Card className="border-dashed border-2 bg-slate-50/50">
          <CardContent className="h-64 flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center">
              <Server className="h-8 w-8 text-slate-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">No clusters connected</h3>
              <p className="text-muted-foreground">
                Start by connecting your first Garage cluster.
              </p>
            </div>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(true)}>
              Connect Now
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {clusters.map((cluster, index) => {
            const health = healthById.get(cluster.id);
            const status = statusById.get(cluster.id);
            const healthQuery = healthQueries[index];
            const healthError = healthQuery?.error;
            const healthStatus = health?.status ?? (healthError ? 'unreachable' : 'unknown');
            const statusVariant =
              healthStatus === 'healthy'
                ? 'success'
                : healthStatus === 'degraded'
                  ? 'warning'
                  : healthStatus === 'unavailable' || healthStatus === 'unreachable'
                    ? 'destructive'
                    : 'secondary';
            const statusLabel =
              healthStatus === 'healthy'
                ? 'Healthy'
                : healthStatus === 'degraded'
                  ? 'Degraded'
                  : healthStatus === 'unavailable'
                    ? 'Unavailable'
                    : healthStatus === 'unreachable'
                      ? 'Unreachable'
                      : 'Unknown';

            const nodesUp = status?.nodes?.filter((n) => n.isUp).length ?? 0;
            const nodesTotal = status?.nodes?.length ?? 0;

            return (
              <Card
                key={cluster.id}
                className="group hover:shadow-xl transition-all duration-300 border-slate-200 bg-white/50 backdrop-blur-sm overflow-hidden relative"
              >
                <div className="absolute top-0 right-0 p-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={(e) => {
                      e.preventDefault();
                      handleOpenEdit(cluster);
                    }}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-8 w-8 rounded-full shadow-sm"
                    onClick={(e) => {
                      e.preventDefault();
                      setDeleteConfirm(cluster);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                      <Server className="h-5 w-5" />
                    </div>
                    <div>
                      {healthQuery?.isLoading ? (
                        <Badge variant="outline" className="text-xs">
                          Checking...
                        </Badge>
                      ) : (
                        <Badge variant={statusVariant} className="text-xs">
                          {statusLabel}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <CardTitle className="mt-4 text-xl font-bold">{cluster.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center text-slate-500">
                      <Activity className="h-4 w-4 mr-2 text-slate-400" />
                      <span className="truncate">{cluster.endpoint}</span>
                    </div>
                    <div className="flex items-center text-slate-500">
                      <MapPin className="h-4 w-4 mr-2 text-slate-400" />
                      <span>{cluster.region || 'Default Region'}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Added {formatDateTime(cluster.createdAt)}
                    </div>
                  </div>

                  {health && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-600">
                      <div className="flex items-center justify-between">
                        <span>Nodes up</span>
                        <span className="font-medium text-slate-900">
                          {nodesUp}/{nodesTotal}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span>Partitions OK</span>
                        <span className="font-medium text-slate-900">
                          {health.partitionsAllOk}/{health.partitions}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="pt-2">
                    <Link to={`/clusters/${cluster.id}`}>
                      <Button
                        className="w-full justify-between group-hover:bg-primary group-hover:text-white transition-colors"
                        variant="outline"
                      >
                        Manage Cluster
                        <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Cluster Dialog */}
      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) {
            setEditingCluster(null);
            setFormError('');
            setClusterForm(emptyForm);
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Cluster</DialogTitle>
            <DialogDescription>
              Update cluster settings. Leave token fields empty to keep existing values.
            </DialogDescription>
          </DialogHeader>
          <ClusterForm
            form={clusterForm}
            setForm={setClusterForm}
            showTokenFields={false}
            error={formError}
          />
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-token">Admin Token (leave empty to keep current)</Label>
              <Input
                id="edit-token"
                type="password"
                value={clusterForm.adminToken}
                onChange={(e) => setClusterForm({ ...clusterForm, adminToken: e.target.value })}
                placeholder="Enter new token to update"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-metric-token">Metric Token (optional)</Label>
              <Input
                id="edit-metric-token"
                type="password"
                value={clusterForm.metricToken}
                onChange={(e) => setClusterForm({ ...clusterForm, metricToken: e.target.value })}
                placeholder="Enter new metric token to update"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                editingCluster &&
                updateMutation.mutate({ id: editingCluster.id, data: clusterForm })
              }
              disabled={isUpdateDisabled}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

// Reusable form component
function ClusterForm({
  form,
  setForm,
  showTokenFields,
  error,
}: {
  form: ClusterFormState;
  setForm: (form: ClusterFormState) => void;
  showTokenFields: boolean;
  error: string;
}) {
  return (
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
        <Label htmlFor="region">Region</Label>
        <Input
          id="region"
          value={form.region}
          onChange={(e) => setForm({ ...form, region: e.target.value })}
          placeholder="us-east-1"
        />
      </div>
      {showTokenFields && (
        <>
          <div className="grid gap-2">
            <Label htmlFor="token">Admin Token</Label>
            <Input
              id="token"
              type="password"
              value={form.adminToken}
              onChange={(e) => setForm({ ...form, adminToken: e.target.value })}
              placeholder="Garage Admin API Token"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="metric-token">Metric Token (optional)</Label>
            <Input
              id="metric-token"
              type="password"
              value={form.metricToken}
              onChange={(e) => setForm({ ...form, metricToken: e.target.value })}
              placeholder="Token for /metrics endpoint"
            />
            <p className="text-xs text-muted-foreground">Falls back to admin token if not set</p>
          </div>
        </>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
