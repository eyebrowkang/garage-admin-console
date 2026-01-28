import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { AlertCircle, CheckCircle2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { api, proxyPath } from '@/lib/api';
import { formatBytes, formatShortId } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import type {
  GetClusterLayoutResponse,
  GetClusterStatusResponse,
  LayoutNodeRole,
  NodeRoleChange,
  NodeResp,
} from '@/types/garage';

interface LayoutManagerProps {
  clusterId: string;
}

type EditableNode = {
  id: string;
  zone: string;
  capacity: string;
  tags: string;
};

export function LayoutManager({ clusterId }: LayoutManagerProps) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<EditableNode | null>(null);
  const [actionError, setActionError] = useState('');

  const layoutQuery = useQuery<GetClusterLayoutResponse>({
    queryKey: ['clusterLayout', clusterId],
    queryFn: async () => {
      const res = await api.get<GetClusterLayoutResponse>(
        proxyPath(clusterId, '/v2/GetClusterLayout'),
      );
      return res.data;
    },
  });

  const statusQuery = useQuery<GetClusterStatusResponse>({
    queryKey: ['clusterStatus', clusterId],
    queryFn: async () => {
      const res = await api.get<GetClusterStatusResponse>(
        proxyPath(clusterId, '/v2/GetClusterStatus'),
      );
      return res.data;
    },
  });

  const rolesById = useMemo(() => {
    const map = new Map<string, LayoutNodeRole>();
    layoutQuery.data?.roles?.forEach((role) => map.set(role.id, role));
    return map;
  }, [layoutQuery.data]);

  const stagedById = useMemo(() => {
    const map = new Map<string, NodeRoleChange>();
    layoutQuery.data?.stagedRoleChanges?.forEach((change) => map.set(change.id, change));
    return map;
  }, [layoutQuery.data]);

  const updateLayoutMutation = useMutation({
    mutationFn: async (data: EditableNode) => {
      const capacityValue = data.capacity.trim();
      const parsedCapacity = capacityValue ? Number.parseFloat(capacityValue) : null;
      if (parsedCapacity !== null && Number.isNaN(parsedCapacity)) {
        throw new Error('Capacity must be a number in GB or left empty for gateway nodes.');
      }
      const capacityBytes =
        parsedCapacity === null ? null : Math.round(parsedCapacity * 1_000_000_000);

      const payload = {
        roles: [
          {
            id: data.id,
            zone: data.zone.trim() || 'default',
            capacity: capacityBytes,
            tags: data.tags
              ? data.tags
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean)
              : [],
          },
        ],
      };

      await api.post(proxyPath(clusterId, '/v2/UpdateClusterLayout'), payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusterLayout', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['clusterStatus', clusterId] });
      setIsDialogOpen(false);
      setSelectedNode(null);
      setActionError('');
    },
    onError: (err) => {
      setActionError(getApiErrorMessage(err, 'Failed to stage layout changes.'));
    },
  });

  const removeNodeMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      const payload = { roles: [{ id: nodeId, remove: true }] };
      await api.post(proxyPath(clusterId, '/v2/UpdateClusterLayout'), payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusterLayout', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['clusterStatus', clusterId] });
      setActionError('');
    },
    onError: (err) => {
      setActionError(getApiErrorMessage(err, 'Failed to remove node from layout.'));
    },
  });

  const applyLayoutMutation = useMutation({
    mutationFn: async (version: number) => {
      await api.post(proxyPath(clusterId, '/v2/ApplyClusterLayout'), { version });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusterLayout', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['clusterStatus', clusterId] });
      setActionError('');
    },
    onError: (err) => {
      setActionError(getApiErrorMessage(err, 'Failed to apply layout changes.'));
    },
  });

  const revertLayoutMutation = useMutation({
    mutationFn: async () => {
      await api.post(proxyPath(clusterId, '/v2/RevertClusterLayout'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusterLayout', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['clusterStatus', clusterId] });
      setActionError('');
    },
    onError: (err) => {
      setActionError(getApiErrorMessage(err, 'Failed to revert layout changes.'));
    },
  });

  if (layoutQuery.isLoading || statusQuery.isLoading)
    return <div className="p-4">Loading layout...</div>;

  if (layoutQuery.error || statusQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load layout</AlertTitle>
        <AlertDescription>
          {layoutQuery.error && getApiErrorMessage(layoutQuery.error, 'Failed to load layout.')}
          {statusQuery.error &&
            ` ${getApiErrorMessage(statusQuery.error, 'Failed to load nodes.')}`}
        </AlertDescription>
      </Alert>
    );
  }

  const layout = layoutQuery.data;
  const nodes = statusQuery.data?.nodes ?? [];
  const stagedChanges = layout?.stagedRoleChanges ?? [];

  const openDialogForNode = (node: NodeResp) => {
    const role = rolesById.get(node.id);
    setSelectedNode({
      id: node.id,
      zone: role?.zone || 'default',
      capacity: role?.capacity != null ? (role.capacity / 1_000_000_000).toString() : '',
      tags: role?.tags?.join(', ') || '',
    });
    setIsDialogOpen(true);
    setActionError('');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle>Cluster Layout</CardTitle>
              <CardDescription>Manage storage nodes and capacity distribution</CardDescription>
            </div>
            <div className="flex gap-2">
              {stagedChanges.length > 0 && (
                <>
                  <Button variant="destructive" onClick={() => revertLayoutMutation.mutate()}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Revert
                  </Button>
                  <Button onClick={() => layout && applyLayoutMutation.mutate(layout.version + 1)}>
                    <Save className="mr-2 h-4 w-4" /> Apply Changes
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {stagedChanges.length > 0 && (
            <Alert className="mb-6" variant="warning">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Unsaved Changes</AlertTitle>
              <AlertDescription>
                You have {stagedChanges.length} staged changes. Apply them to update the cluster.
              </AlertDescription>
            </Alert>
          )}

          {actionError && (
            <Alert variant="destructive" className="mb-6">
              <AlertTitle>Action failed</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Node ID</TableHead>
                  <TableHead>Hostname</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Staged</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodes.map((node) => {
                  const role = rolesById.get(node.id);
                  const staged = stagedById.get(node.id);
                  const isRemoved = staged && 'remove' in staged && staged.remove;

                  return (
                    <TableRow key={node.id}>
                      <TableCell className="font-mono text-xs">
                        {formatShortId(node.id, 10)}
                      </TableCell>
                      <TableCell>{node.hostname || 'Unknown'}</TableCell>
                      <TableCell>{role?.zone || '-'}</TableCell>
                      <TableCell>{role ? formatBytes(role.capacity ?? null) : '-'}</TableCell>
                      <TableCell>
                        {role ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Discovery</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {staged ? (
                          isRemoved ? (
                            <Badge variant="destructive">Remove</Badge>
                          ) : (
                            <Badge variant="warning">Update</Badge>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Dialog
                            open={isDialogOpen && selectedNode?.id === node.id}
                            onOpenChange={(open) => {
                              setIsDialogOpen(open);
                              if (!open) setSelectedNode(null);
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openDialogForNode(node)}
                              >
                                <Plus className="h-4 w-4 mr-1" /> {role ? 'Edit' : 'Add'}
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Configure Node</DialogTitle>
                                <DialogDescription>
                                  Add or update node configuration in the layout.
                                </DialogDescription>
                              </DialogHeader>
                              {selectedNode && (
                                <div className="grid gap-4 py-4">
                                  <div className="grid gap-2">
                                    <Label>Zone</Label>
                                    <Input
                                      value={selectedNode.zone}
                                      onChange={(e) =>
                                        setSelectedNode({ ...selectedNode, zone: e.target.value })
                                      }
                                    />
                                  </div>
                                  <div className="grid gap-2">
                                    <Label>Capacity (GB)</Label>
                                    <Input
                                      type="number"
                                      value={selectedNode.capacity}
                                      onChange={(e) =>
                                        setSelectedNode({
                                          ...selectedNode,
                                          capacity: e.target.value,
                                        })
                                      }
                                      placeholder="Leave empty for gateway"
                                    />
                                  </div>
                                  <div className="grid gap-2">
                                    <Label>Tags (comma separated)</Label>
                                    <Input
                                      value={selectedNode.tags}
                                      onChange={(e) =>
                                        setSelectedNode({ ...selectedNode, tags: e.target.value })
                                      }
                                    />
                                  </div>
                                </div>
                              )}
                              <DialogFooter>
                                <Button
                                  onClick={() =>
                                    selectedNode && updateLayoutMutation.mutate(selectedNode)
                                  }
                                  disabled={updateLayoutMutation.isPending}
                                >
                                  {updateLayoutMutation.isPending ? 'Staging...' : 'Stage Changes'}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>

                          {role && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => {
                                if (confirm('Remove this node from the layout?'))
                                  removeNodeMutation.mutate(node.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {nodes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                      No nodes reported by the cluster.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" />
            Capacity uses SI units (1GB = 1,000,000,000 bytes).
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
