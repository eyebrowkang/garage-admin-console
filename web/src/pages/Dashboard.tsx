import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { api, proxyPath } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';
import { ConfirmDialog } from '@/components/cluster/ConfirmDialog';
import { ClusterStatusMonitor } from '@/components/dashboard/ClusterStatusMonitor';
import { toast } from '@/hooks/use-toast';
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
};

const emptyForm: ClusterFormState = {
  name: '',
  endpoint: '',
  adminToken: '',
  metricToken: '',
};

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [clusterForm, setClusterForm] = useState<ClusterFormState>(emptyForm);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
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

  // Build maps for quick lookup
  const healthById = new Map<string, GetClusterHealthResponse | undefined>();
  const statusById = new Map<string, GetClusterStatusResponse | undefined>();
  clusters.forEach((cluster, index) => {
    healthById.set(cluster.id, healthQueries[index]?.data);
    statusById.set(cluster.id, statusQueries[index]?.data);
  });

  // Build clusters with status for monitoring
  const clustersWithStatus = clusters.map((cluster, index) => {
    const health = healthById.get(cluster.id);
    const healthQuery = healthQueries[index];
    const healthError = healthQuery?.error;
    const healthStatus = health?.status ?? (healthError ? 'unreachable' : 'unknown');

    return {
      cluster,
      health,
      status: statusById.get(cluster.id),
      healthStatus: healthStatus as 'healthy' | 'degraded' | 'unavailable' | 'unreachable' | 'unknown',
      isLoading: healthQuery?.isLoading ?? true,
    };
  });

  const createMutation = useMutation({
    mutationFn: async (data: ClusterFormState) => {
      const endpoint = data.endpoint.trim().replace(/\/+$/, '');
      // Check for duplicate endpoint
      const existing = clusters.find(
        (c) => c.endpoint.replace(/\/+$/, '').toLowerCase() === endpoint.toLowerCase(),
      );
      if (existing) {
        throw new Error(`Cluster with endpoint "${endpoint}" already exists as "${existing.name}"`);
      }
      const payload = {
        name: data.name.trim(),
        endpoint,
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

  const isCreateDisabled =
    !clusterForm.name.trim() ||
    !clusterForm.endpoint.trim() ||
    !clusterForm.adminToken.trim() ||
    createMutation.isPending;

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

      {/* Cluster Status Monitor */}
      {clusters.length > 0 && <ClusterStatusMonitor clustersWithStatus={clustersWithStatus} />}

      {/* Empty State */}
      {clusters.length === 0 && (
        <Card className="border-dashed border-2 bg-slate-50/50">
          <CardContent className="h-64 flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center">
              <Plus className="h-8 w-8 text-slate-400" />
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
