import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Badge,
  Alert,
  AlertDescription,
  AlertTitle,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TabHotkeys,
} from '@garage/ui';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { api, proxyPath } from '@/lib/api';
import { formatBytes, formatShortId, getApiErrorMessage } from '@garage/web-shared';
import { ConfirmDialog } from '@garage/ui';
import { ModulePageHeader } from '@garage/ui';
import { PageLoadingState } from '@garage/ui';
import {
  AddActionIcon,
  DeleteActionIcon,
  InspectActionIcon,
  RevertActionIcon,
  SaveActionIcon,
} from '@/lib/action-icons';
import { toast } from '@garage/ui';
import { useClusterContext } from '@/contexts/ClusterContext';
import type {
  ApplyClusterLayoutResponse,
  ClusterLayoutSkipDeadNodesResponse,
  GetClusterLayoutHistoryResponse,
  GetClusterLayoutResponse,
  GetClusterStatusResponse,
  LayoutNodeRole,
  NodeRoleChange,
  NodeResp,
  PreviewClusterLayoutChangesResponse,
  UpdateClusterLayoutRequest,
} from '@/types/garage';

type EditableNode = {
  id: string;
  zone: string;
  capacity: string;
  tags: string;
};

type ZoneMode = 'maximum' | 'atLeast';

const formatZoneRedundancy = (value?: GetClusterLayoutResponse['parameters']['zoneRedundancy']) => {
  if (!value) return '—';
  if (value === 'maximum') return 'Maximum';
  if ('atLeast' in value) return `At least ${value.atLeast}`;
  return '—';
};

export function LayoutManager() {
  const { clusterId } = useClusterContext();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [nodeDialogOpen, setNodeDialogOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<EditableNode | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{ id: string; hostname: string } | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [applyResultDialogOpen, setApplyResultDialogOpen] = useState(false);
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState('');

  const [previewResult, setPreviewResult] = useState<PreviewClusterLayoutChangesResponse | null>(
    null,
  );
  const [applyResult, setApplyResult] = useState<ApplyClusterLayoutResponse | null>(null);
  const [skipResult, setSkipResult] = useState<ClusterLayoutSkipDeadNodesResponse | null>(null);

  const [applyVersionInput, setApplyVersionInput] = useState('');
  const [skipVersionInput, setSkipVersionInput] = useState('');
  const [allowMissingData, setAllowMissingData] = useState(false);

  const [zoneModeInput, setZoneModeInput] = useState<ZoneMode | null>(null);
  const [zoneAtLeastInput, setZoneAtLeastInput] = useState('');
  const [paramError, setParamError] = useState('');

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

  const historyQuery = useQuery<GetClusterLayoutHistoryResponse>({
    queryKey: ['clusterLayoutHistory', clusterId],
    queryFn: async () => {
      const res = await api.get<GetClusterLayoutHistoryResponse>(
        proxyPath(clusterId, '/v2/GetClusterLayoutHistory'),
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

  const layout = layoutQuery.data;
  const nodes = statusQuery.data?.nodes ?? [];
  const stagedChanges = layout?.stagedRoleChanges ?? [];
  const stagedParams = layout?.stagedParameters ?? null;
  const hasStagedChanges = stagedChanges.length > 0 || Boolean(stagedParams);
  const defaultApplyVersion = layout ? String(layout.version + 1) : '';
  const defaultSkipVersion =
    historyQuery.data?.currentVersion !== undefined
      ? String(historyQuery.data.currentVersion)
      : layout?.version !== undefined
        ? String(layout.version)
        : '';
  const layoutRedundancy = layout?.parameters?.zoneRedundancy;
  const defaultZoneMode: ZoneMode =
    layoutRedundancy === 'maximum' || !layoutRedundancy ? 'maximum' : 'atLeast';
  const defaultZoneAtLeast =
    layoutRedundancy && layoutRedundancy !== 'maximum' && 'atLeast' in layoutRedundancy
      ? String(layoutRedundancy.atLeast)
      : '2';

  const applyVersion = applyVersionInput || defaultApplyVersion;
  const skipVersion = skipVersionInput || defaultSkipVersion;
  const zoneMode = zoneModeInput ?? defaultZoneMode;
  const zoneAtLeast = zoneAtLeastInput || defaultZoneAtLeast;

  const updateLayoutMutation = useMutation({
    mutationFn: async (payload: UpdateClusterLayoutRequest) => {
      await api.post(proxyPath(clusterId, '/v2/UpdateClusterLayout'), payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clusterLayout', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['clusterStatus', clusterId] });
      if (removeConfirm) {
        setRemoveConfirm(null);
        toast({
          title: 'Node removal staged',
          description: 'Apply the layout to complete the removal.',
        });
      }
      setNodeDialogOpen(false);
      setSelectedNode(null);
      setActionError('');
      setApplyResult(null);
      setApplyResultDialogOpen(false);
      setPreviewResult(null);
      setZoneModeInput(null);
      setZoneAtLeastInput('');
    },
    onError: (err) => {
      setActionError(getApiErrorMessage(err, 'Failed to stage layout changes.'));
    },
  });

  const applyLayoutMutation = useMutation({
    mutationFn: async (version: number) => {
      const res = await api.post<ApplyClusterLayoutResponse>(
        proxyPath(clusterId, '/v2/ApplyClusterLayout'),
        { version },
      );
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['clusterLayout', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['clusterStatus', clusterId] });
      queryClient.invalidateQueries({ queryKey: ['clusterLayoutHistory', clusterId] });
      setApplyResult(data);
      setApplyResultDialogOpen(true);
      setPreviewResult(null);
      setApplyDialogOpen(false);
      setActionError('');
      setApplyVersionInput('');
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
      setPreviewResult(null);
      setApplyResult(null);
      setApplyResultDialogOpen(false);
      setActionError('');
      setRevertConfirmOpen(false);
      setApplyVersionInput('');
      setSkipVersionInput('');
      setZoneModeInput(null);
      setZoneAtLeastInput('');
    },
    onError: (err) => {
      setActionError(getApiErrorMessage(err, 'Failed to revert layout changes.'));
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<PreviewClusterLayoutChangesResponse>(
        proxyPath(clusterId, '/v2/PreviewClusterLayoutChanges'),
      );
      return res.data;
    },
    onSuccess: (data) => {
      setPreviewResult(data);
      setPreviewDialogOpen(true);
      setActionError('');
    },
    onError: (err) => {
      setActionError(getApiErrorMessage(err, 'Failed to preview layout changes.'));
    },
  });

  const skipDeadNodesMutation = useMutation({
    mutationFn: async (payload: { version: number; allowMissingData: boolean }) => {
      const res = await api.post<ClusterLayoutSkipDeadNodesResponse>(
        proxyPath(clusterId, '/v2/ClusterLayoutSkipDeadNodes'),
        payload,
      );
      return res.data;
    },
    onSuccess: (data) => {
      setSkipResult(data);
      setActionError('');
      toast({ title: 'Skip request submitted', variant: 'success' });
      setSkipVersionInput('');
    },
    onError: (err) => {
      setActionError(getApiErrorMessage(err, 'Failed to skip dead nodes.'));
    },
  });

  const openDialogForNode = (node: NodeResp) => {
    const role = rolesById.get(node.id);
    setSelectedNode({
      id: node.id,
      zone: role?.zone || 'default',
      capacity: role?.capacity != null ? (role.capacity / 1_000_000_000).toString() : '',
      tags: role?.tags?.join(', ') || '',
    });
    setNodeDialogOpen(true);
    setActionError('');
  };

  const handleStageNode = () => {
    if (!selectedNode) return;
    const capacityValue = selectedNode.capacity.trim();
    const parsedCapacity = capacityValue ? Number.parseFloat(capacityValue) : null;
    if (parsedCapacity !== null && (Number.isNaN(parsedCapacity) || parsedCapacity < 0)) {
      setActionError('Capacity must be a positive number in GB or left empty for gateway nodes.');
      return;
    }
    const capacityBytes =
      parsedCapacity === null ? null : Math.round(parsedCapacity * 1_000_000_000);

    updateLayoutMutation.mutate({
      roles: [
        {
          id: selectedNode.id,
          zone: selectedNode.zone.trim() || 'default',
          capacity: capacityBytes,
          tags: selectedNode.tags
            ? selectedNode.tags
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean)
            : [],
        },
      ],
    });
  };

  const handleStageParameters = () => {
    setParamError('');
    let zoneRedundancy: UpdateClusterLayoutRequest['parameters'];
    if (zoneMode === 'maximum') {
      zoneRedundancy = { zoneRedundancy: 'maximum' };
    } else {
      const value = Number.parseInt(zoneAtLeast, 10);
      if (Number.isNaN(value) || value < 1) {
        setParamError('At least value must be a positive integer.');
        return;
      }
      zoneRedundancy = { zoneRedundancy: { atLeast: value } };
    }

    updateLayoutMutation.mutate({ parameters: zoneRedundancy });
  };

  const handleApply = () => {
    const version = Number.parseInt(applyVersion, 10);
    if (Number.isNaN(version) || version < 0) {
      setActionError('Version must be a valid number.');
      return;
    }
    applyLayoutMutation.mutate(version);
  };

  const handleSkipDeadNodes = () => {
    const version = Number.parseInt(skipVersion, 10);
    if (Number.isNaN(version) || version < 0) {
      setActionError('Version must be a valid number.');
      return;
    }
    skipDeadNodesMutation.mutate({ version, allowMissingData });
  };

  if (layoutQuery.isLoading || statusQuery.isLoading || historyQuery.isLoading) {
    return <PageLoadingState label="Loading layout..." />;
  }

  if (layoutQuery.error || statusQuery.error || historyQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load layout</AlertTitle>
        <AlertDescription>
          {layoutQuery.error && getApiErrorMessage(layoutQuery.error, 'Failed to load layout.')}
          {statusQuery.error &&
            ` ${getApiErrorMessage(statusQuery.error, 'Failed to load nodes.')}`}
          {historyQuery.error &&
            ` ${getApiErrorMessage(historyQuery.error, 'Failed to load layout history.')}`}
        </AlertDescription>
      </Alert>
    );
  }

  const requestedTab = searchParams.get('tab');
  const activeTab =
    requestedTab === 'nodes' || requestedTab === 'history' ? requestedTab : 'overview';
  const handleTabChange = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === 'overview') next.delete('tab');
        else next.set('tab', value);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-4">
      <ModulePageHeader
        title="Layout"
        description="Stage, preview, and apply cluster layout changes with explicit version control."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => previewMutation.mutate()}
              disabled={!hasStagedChanges || previewMutation.isPending}
            >
              <InspectActionIcon className="h-4 w-4" />
              {previewMutation.isPending ? 'Previewing...' : 'Preview'}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setRevertConfirmOpen(true)}
              disabled={!hasStagedChanges}
            >
              <RevertActionIcon className="h-4 w-4" /> Revert
            </Button>
            <Button size="sm" onClick={() => setApplyDialogOpen(true)} disabled={!hasStagedChanges}>
              <SaveActionIcon className="h-4 w-4" /> Apply
            </Button>
          </>
        }
      />

      {actionError && (
        <Alert variant="destructive">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabHotkeys values={['overview', 'nodes', 'history']} onSelect={handleTabChange} />
        <TabsList>
          <TabsTrigger value="overview" title="Overview (press 1)">
            Overview
          </TabsTrigger>
          <TabsTrigger value="nodes" title="Nodes (press 2)">
            Nodes
            {nodes.length > 0 && (
              <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">
                {nodes.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" title="History (press 3)">
            History
          </TabsTrigger>
        </TabsList>

        {/* ---------------- Overview ---------------- */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
            <div className="bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Current Version</div>
              <div className="text-lg font-semibold tabular-nums">{layout?.version ?? '—'}</div>
            </div>
            <div className="bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Partition Size</div>
              <div className="text-lg font-semibold tabular-nums">
                {layout ? formatBytes(layout.partitionSize) : '—'}
              </div>
            </div>
            <div className="bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Zone Redundancy</div>
              <div className="text-lg font-semibold">
                {formatZoneRedundancy(layout?.parameters?.zoneRedundancy)}
              </div>
            </div>
            <div className="bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Staged Changes</div>
              <div className="text-lg font-semibold tabular-nums">
                {stagedChanges.length + (stagedParams ? 1 : 0)}
              </div>
            </div>
          </div>

          {hasStagedChanges && (
            <Alert variant="warning">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Staged changes pending</AlertTitle>
              <AlertDescription>
                Preview the new layout and apply changes when you are ready.
              </AlertDescription>
            </Alert>
          )}

          {hasStagedChanges && (
            <div className="space-y-2 rounded-md border bg-muted/10 p-3 text-sm">
              <div className="font-medium">Staged changes</div>
              {stagedParams && (
                <div>
                  Parameters: {formatZoneRedundancy(layout?.parameters?.zoneRedundancy)} →{' '}
                  {formatZoneRedundancy(stagedParams.zoneRedundancy)}
                </div>
              )}
              {stagedChanges.length > 0 && (
                <div className="space-y-1">
                  {stagedChanges.map((change) => {
                    const isRemoved = 'remove' in change && change.remove;
                    return (
                      <div key={change.id}>
                        {formatShortId(change.id, 10)} — {isRemoved ? 'Remove node' : 'Update role'}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Layout parameters */}
          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <div className="text-sm font-medium">Layout Parameters</div>
              <p className="text-sm text-muted-foreground">
                Stage changes to the layout computation parameters.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px] md:items-end">
              <div className="space-y-2">
                <Label>Zone Redundancy</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={zoneMode}
                    onValueChange={(value) => setZoneModeInput(value as ZoneMode)}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="maximum">Maximum</SelectItem>
                      <SelectItem value="atLeast">At least</SelectItem>
                    </SelectContent>
                  </Select>
                  {zoneMode === 'atLeast' && (
                    <Input
                      type="number"
                      min={1}
                      value={zoneAtLeast}
                      onChange={(e) => setZoneAtLeastInput(e.target.value)}
                      className="w-[120px]"
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Current: {formatZoneRedundancy(layout?.parameters?.zoneRedundancy)}
                </p>
                {paramError && <p className="text-xs text-destructive">{paramError}</p>}
              </div>
              <Button onClick={handleStageParameters} disabled={updateLayoutMutation.isPending}>
                {updateLayoutMutation.isPending ? 'Staging...' : 'Stage Parameters'}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ---------------- Nodes ---------------- */}
        <TabsContent value="nodes" className="space-y-3">
          {/* Desktop / tablet: table */}
          <div className="hidden overflow-hidden rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Node ID</TableHead>
                  <TableHead>Hostname</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Tags</TableHead>
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
                      <TableCell>{role?.zone || '—'}</TableCell>
                      <TableCell>
                        {role?.tags?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {role.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{role ? formatBytes(role.capacity ?? null) : '—'}</TableCell>
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
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openDialogForNode(node)}>
                            <AddActionIcon className="h-4 w-4" /> {role ? 'Edit' : 'Add'}
                          </Button>
                          {role && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() =>
                                setRemoveConfirm({
                                  id: node.id,
                                  hostname: node.hostname || node.id,
                                })
                              }
                            >
                              <DeleteActionIcon className="h-3.5 w-3.5" />
                              Remove
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {nodes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No nodes reported by the cluster.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: one card per node */}
          <div className="space-y-2 md:hidden">
            {nodes.map((node) => {
              const role = rolesById.get(node.id);
              const staged = stagedById.get(node.id);
              const isRemoved = staged && 'remove' in staged && staged.remove;
              return (
                <div key={node.id} className="space-y-2.5 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{node.hostname || 'Unknown'}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {formatShortId(node.id, 12)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {role ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Discovery</Badge>
                      )}
                      {staged &&
                        (isRemoved ? (
                          <Badge variant="destructive">Remove</Badge>
                        ) : (
                          <Badge variant="warning">Update</Badge>
                        ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <div>
                      <span className="text-muted-foreground">Zone: </span>
                      {role?.zone || '—'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Capacity: </span>
                      {role ? formatBytes(role.capacity ?? null) : '—'}
                    </div>
                  </div>
                  {role?.tags?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {role.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex gap-2 pt-0.5">
                    <Button variant="outline" size="sm" onClick={() => openDialogForNode(node)}>
                      <AddActionIcon className="h-4 w-4" /> {role ? 'Edit' : 'Add'}
                    </Button>
                    {role && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        onClick={() =>
                          setRemoveConfirm({ id: node.id, hostname: node.hostname || node.id })
                        }
                      >
                        <DeleteActionIcon className="h-3.5 w-3.5" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {nodes.length === 0 && (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No nodes reported by the cluster.
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" />
            Capacity uses SI units (1GB = 1,000,000,000 bytes).
          </div>
        </TabsContent>

        {/* ---------------- History ---------------- */}
        <TabsContent value="history" className="space-y-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border">
            <div className="bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Current Version</div>
              <div className="text-lg font-semibold tabular-nums">
                {historyQuery.data?.currentVersion}
              </div>
            </div>
            <div className="bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Min ACK Version</div>
              <div className="text-lg font-semibold tabular-nums">{historyQuery.data?.minAck}</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Storage Nodes</TableHead>
                  <TableHead>Gateway Nodes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyQuery.data?.versions?.map((version) => (
                  <TableRow key={version.version}>
                    <TableCell>v{version.version}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          version.status === 'Current'
                            ? 'success'
                            : version.status === 'Draining'
                              ? 'warning'
                              : 'secondary'
                        }
                      >
                        {version.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{version.storageNodes}</TableCell>
                    <TableCell>{version.gatewayNodes}</TableCell>
                  </TableRow>
                ))}
                {historyQuery.data?.versions?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      No layout history available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {historyQuery.data?.updateTrackers && (
            <div className="space-y-2 rounded-md border bg-muted/10 p-3 text-sm">
              <div className="font-medium">Node update trackers</div>
              <div className="space-y-1">
                {Object.entries(historyQuery.data.updateTrackers).map(([nodeId, trackers]) => (
                  <div key={nodeId}>
                    {formatShortId(nodeId, 10)} — ACK {trackers.ack}, SYNC {trackers.sync}, SYNC ACK{' '}
                    {trackers.syncAck}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
            <div className="font-medium text-warning">Skip Dead Nodes</div>
            <p className="text-sm text-foreground/80">
              Force progress in layout update trackers. Use only if nodes are permanently lost.
            </p>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div className="space-y-2">
                <Label>Layout Version</Label>
                <Input
                  type="number"
                  value={skipVersion}
                  onChange={(e) => setSkipVersionInput(e.target.value)}
                />
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={allowMissingData} onCheckedChange={setAllowMissingData} />
                  Allow missing data (unsafe)
                </label>
              </div>
              <Button
                variant="destructive"
                onClick={handleSkipDeadNodes}
                disabled={skipDeadNodesMutation.isPending}
              >
                {skipDeadNodesMutation.isPending ? 'Submitting...' : 'Skip Dead Nodes'}
              </Button>
            </div>
            {skipResult && (
              <div className="space-y-1 text-sm text-foreground/80">
                <div>ACK updated: {skipResult.ackUpdated.join(', ') || '—'}</div>
                <div>SYNC updated: {skipResult.syncUpdated.join(', ') || '—'}</div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Configure Node Dialog (single, shared by table + cards) */}
      <Dialog
        open={nodeDialogOpen}
        onOpenChange={(open) => {
          setNodeDialogOpen(open);
          if (!open) setSelectedNode(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Node</DialogTitle>
            <DialogDescription>
              Stage role changes for this node. Capacity uses GB (SI).
            </DialogDescription>
          </DialogHeader>
          {selectedNode && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Zone</Label>
                <Input
                  value={selectedNode.zone}
                  onChange={(e) => setSelectedNode({ ...selectedNode, zone: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Capacity (GB)</Label>
                <Input
                  type="number"
                  value={selectedNode.capacity}
                  onChange={(e) => setSelectedNode({ ...selectedNode, capacity: e.target.value })}
                  placeholder="Leave empty for gateway"
                />
              </div>
              <div className="grid gap-2">
                <Label>Tags (comma separated)</Label>
                <Input
                  value={selectedNode.tags}
                  onChange={(e) => setSelectedNode({ ...selectedNode, tags: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNodeDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStageNode} disabled={updateLayoutMutation.isPending}>
              {updateLayoutMutation.isPending ? 'Staging...' : 'Stage Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog
        open={previewDialogOpen}
        onOpenChange={(open) => {
          setPreviewDialogOpen(open);
          if (!open) setPreviewResult(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Layout Preview</DialogTitle>
            <DialogDescription>Computed layout based on staged changes</DialogDescription>
          </DialogHeader>
          {previewResult ? (
            'error' in previewResult ? (
              <Alert variant="destructive">
                <AlertTitle>Preview failed</AlertTitle>
                <AlertDescription>{previewResult.error}</AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="mb-2 text-sm font-medium">Layout computation output</div>
                  <pre className="max-h-[360px] overflow-auto whitespace-pre rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
                    {previewResult.message.join('\n')}
                  </pre>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-sm text-muted-foreground">Preview Version</div>
                    <div className="text-lg font-semibold">{previewResult.newLayout.version}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Partition Size</div>
                    <div className="text-lg font-semibold">
                      {formatBytes(previewResult.newLayout.partitionSize)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Zone Redundancy</div>
                    <div className="text-lg font-semibold">
                      {formatZoneRedundancy(previewResult.newLayout.parameters.zoneRedundancy)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Roles</div>
                    <div className="text-lg font-semibold">
                      {previewResult.newLayout.roles.length}
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="text-sm text-muted-foreground">No preview available.</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Dialog */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Layout Changes</DialogTitle>
            <DialogDescription>
              Applying staged changes will increment the layout version. Please confirm the new
              version number.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>New layout version</Label>
            <Input
              type="number"
              value={applyVersion}
              onChange={(e) => setApplyVersionInput(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={applyLayoutMutation.isPending}>
              {applyLayoutMutation.isPending ? 'Applying...' : 'Apply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Result Dialog */}
      <Dialog
        open={applyResultDialogOpen}
        onOpenChange={(open) => {
          setApplyResultDialogOpen(open);
          if (!open) setApplyResult(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Layout Applied</DialogTitle>
            <DialogDescription>Cluster layout changes have been applied.</DialogDescription>
          </DialogHeader>
          {applyResult ? (
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium">Layout computation output</div>
                <pre className="max-h-[360px] overflow-auto whitespace-pre rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
                  {applyResult.message.join('\n')}
                </pre>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-sm text-muted-foreground">Applied Version</div>
                  <div className="text-lg font-semibold">{applyResult.layout.version}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Partition Size</div>
                  <div className="text-lg font-semibold">
                    {formatBytes(applyResult.layout.partitionSize)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Zone Redundancy</div>
                  <div className="text-lg font-semibold">
                    {formatZoneRedundancy(applyResult.layout.parameters.zoneRedundancy)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Roles</div>
                  <div className="text-lg font-semibold">{applyResult.layout.roles.length}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No output available.</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyResultDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revertConfirmOpen}
        onOpenChange={setRevertConfirmOpen}
        title="Revert staged changes"
        description="This will clear all staged layout changes. The current layout remains unchanged."
        tier="danger"
        confirmText="Revert"
        onConfirm={() => revertLayoutMutation.mutate()}
        isLoading={revertLayoutMutation.isPending}
      />

      <ConfirmDialog
        open={!!removeConfirm}
        onOpenChange={(open) => !open && setRemoveConfirm(null)}
        title="Remove Node from Layout"
        description={`Remove "${removeConfirm?.hostname}" from the layout? This stages the removal and requires applying the layout.`}
        tier="danger"
        confirmText="Remove Node"
        onConfirm={() =>
          removeConfirm &&
          updateLayoutMutation.mutate({
            roles: [{ id: removeConfirm.id, remove: true }],
          })
        }
        isLoading={updateLayoutMutation.isPending}
      />
    </div>
  );
}
