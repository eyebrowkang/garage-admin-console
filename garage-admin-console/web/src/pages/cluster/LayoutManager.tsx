import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TabHotkeys,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ResourceList,
  type ResourceListColumn,
  type ResourceAction,
  CopyValue,
  EmptyValue,
  cn,
} from '@garage/ui';
import { AlertCircle, CheckCircle2, MoreHorizontal, SkipForward } from 'lucide-react';
import { api, proxyPath } from '@/lib/api';
import { formatBytes, formatShortId, getApiErrorMessage } from '@garage/web-shared';
import { ConfirmDialog } from '@garage/ui';
import { ModulePageHeader } from '@garage/ui';
import { PageLoadingState } from '@garage/ui';
import {
  AddActionIcon,
  DeleteActionIcon,
  EditActionIcon,
  InspectActionIcon,
  OpenActionIcon,
  RevertActionIcon,
  SaveActionIcon,
} from '@/lib/action-icons';
import { NodeIcon } from '@/lib/entity-icons';
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [nodeDialogOpen, setNodeDialogOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<EditableNode | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{ id: string; hostname: string } | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [applyResultDialogOpen, setApplyResultDialogOpen] = useState(false);
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
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
  // The redundancy the controls currently describe, and whether it differs from
  // what's applied — used to preview the pending change and to block no-op staging.
  const pendingZoneLabel = zoneMode === 'maximum' ? 'Maximum' : `At least ${zoneAtLeast || '—'}`;
  const zoneParamsChanged =
    zoneMode !== defaultZoneMode ||
    (zoneMode === 'atLeast' &&
      Number.parseInt(zoneAtLeast, 10) !== Number.parseInt(defaultZoneAtLeast, 10));

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

  // Layout-node list: each cluster-reported node, enriched with its layout role
  // and any staged change. Mirrors the Nodes list (ResourceList) for consistency.
  const layoutStatusBadge = (hasRole: boolean) =>
    hasRole ? <Badge variant="success">Assigned</Badge> : <Badge variant="secondary">Discovery</Badge>;
  const stagedBadge = (change?: NodeRoleChange) => {
    if (!change) return null;
    const removed = 'remove' in change && change.remove;
    return removed ? <Badge variant="destructive">Remove</Badge> : <Badge variant="warning">Update</Badge>;
  };

  const nodeColumns: ResourceListColumn<NodeResp>[] = [
    {
      id: 'node',
      header: 'Node',
      sortable: true,
      sortAccessor: (n) => n.hostname ?? n.id,
      mobileHidden: true,
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
      id: 'zone',
      header: 'Zone',
      sortable: true,
      sortAccessor: (n) => rolesById.get(n.id)?.zone ?? '',
      cell: (n) => {
        const role = rolesById.get(n.id);
        const tags = role?.tags ?? [];
        return role ? (
          <div className="space-y-1">
            <div className="text-sm text-foreground">{role.zone}</div>
            {tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                {tags.slice(0, 3).map((tag) => (
                  <Badge key={`${n.id}-${tag}`} variant="outline" className="font-normal">
                    {tag}
                  </Badge>
                ))}
                {tags.length > 3 && (
                  <span className="text-xs text-muted-foreground">+{tags.length - 3}</span>
                )}
              </div>
            )}
          </div>
        ) : (
          <EmptyValue label="Unassigned" className="text-xs" />
        );
      },
    },
    {
      id: 'capacity',
      header: 'Capacity',
      sortable: true,
      sortAccessor: (n) => rolesById.get(n.id)?.capacity ?? null,
      cellClassName: 'text-sm text-muted-foreground',
      cell: (n) => {
        const role = rolesById.get(n.id);
        return !role ? (
          <EmptyValue />
        ) : role.capacity == null ? (
          'Gateway'
        ) : (
          formatBytes(role.capacity)
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      mobileHidden: true,
      cell: (n) => layoutStatusBadge(rolesById.has(n.id)),
    },
    {
      id: 'staged',
      header: 'Staged',
      mobileHidden: true,
      cell: (n) => stagedBadge(stagedById.get(n.id)) ?? <EmptyValue />,
    },
  ];

  const nodeRowActions = (n: NodeResp): ResourceAction[] => {
    const role = rolesById.get(n.id);
    const items: ResourceAction[] = [
      {
        label: role ? 'Edit role' : 'Add to layout',
        icon: role ? EditActionIcon : AddActionIcon,
        onSelect: () => openDialogForNode(n),
      },
    ];
    if (role) {
      items.push({
        label: 'Remove from layout',
        icon: DeleteActionIcon,
        destructive: true,
        onSelect: () => setRemoveConfirm({ id: n.id, hostname: n.hostname || n.id }),
      });
    }
    items.push({
      label: 'Open node',
      icon: OpenActionIcon,
      onSelect: () => navigate(`/clusters/${clusterId}/nodes/${n.id}`),
    });
    return items;
  };

  return (
    <div className="space-y-4">
      <ModulePageHeader
        title="Layout"
        description="Stage, preview, and apply cluster layout changes with explicit version control."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="flex-1 sm:flex-initial"
              onClick={() => previewMutation.mutate()}
              disabled={!hasStagedChanges || previewMutation.isPending}
            >
              <InspectActionIcon className="h-4 w-4" />
              {previewMutation.isPending ? 'Previewing...' : 'Preview'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More layout actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onSelect={() => setApplyDialogOpen(true)}
                  disabled={!hasStagedChanges}
                >
                  <SaveActionIcon />
                  Apply changes
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setRevertConfirmOpen(true)}
                  disabled={!hasStagedChanges}
                  className="text-destructive focus:text-destructive"
                >
                  <RevertActionIcon />
                  Revert staged changes
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setSkipDialogOpen(true)}>
                  <SkipForward />
                  Skip dead nodes…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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

          {/* Zone redundancy parameter */}
          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <div className="text-sm font-medium">Zone Redundancy</div>
              <p className="text-sm text-muted-foreground">
                How many distinct zones each partition is replicated across. Staged like any other
                layout change — preview and apply to take effect.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex gap-2" role="group" aria-label="Zone redundancy mode">
                {(['maximum', 'atLeast'] as ZoneMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setZoneModeInput(mode)}
                    aria-pressed={zoneMode === mode}
                    className={cn(
                      'min-h-9 rounded-md border px-4 text-sm font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      zoneMode === mode
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {mode === 'maximum' ? 'Maximum' : 'At least'}
                  </button>
                ))}
              </div>
              {zoneMode === 'atLeast' && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={zoneAtLeast}
                    onChange={(e) => setZoneAtLeastInput(e.target.value)}
                    className="w-20"
                    aria-label="Minimum number of zones"
                  />
                  <span className="text-sm text-muted-foreground">zones</span>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {zoneMode === 'maximum'
                ? 'Spread copies across as many zones as possible (one per zone).'
                : 'Require every partition to span at least this many distinct zones.'}
            </p>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Current</span>
              <Badge variant="outline">
                {formatZoneRedundancy(layout?.parameters?.zoneRedundancy)}
              </Badge>
              {zoneParamsChanged && (
                <>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="warning">{pendingZoneLabel}</Badge>
                </>
              )}
            </div>

            {paramError && <p className="text-xs text-destructive">{paramError}</p>}

            <Button
              onClick={handleStageParameters}
              disabled={!zoneParamsChanged || updateLayoutMutation.isPending}
            >
              {updateLayoutMutation.isPending ? 'Staging...' : 'Stage change'}
            </Button>
          </div>
        </TabsContent>

        {/* ---------------- Nodes ---------------- */}
        <TabsContent value="nodes" className="space-y-3">
          <ResourceList
            items={nodes}
            getRowId={(n) => n.id}
            columns={nodeColumns}
            onRowClick={(n) => openDialogForNode(n)}
            getRowLabel={(n) => `Configure ${n.hostname || formatShortId(n.id, 10)}`}
            renderTitle={(n) => (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate font-medium">
                  {n.hostname || formatShortId(n.id, 16)}
                </span>
                {layoutStatusBadge(rolesById.has(n.id))}
                {stagedBadge(stagedById.get(n.id))}
              </div>
            )}
            renderSubtitle={(n) => (
              <CopyValue
                value={n.id}
                label="Node ID"
                className="max-w-full font-mono text-xs text-muted-foreground"
              >
                {formatShortId(n.id, 20)}
              </CopyValue>
            )}
            defaultSort={{ columnId: 'zone', direction: 'asc' }}
            search={{
              placeholder: 'Search by hostname, ID, zone, or tag...',
              predicate: (n, q) => {
                const role = rolesById.get(n.id);
                return (
                  n.id.toLowerCase().includes(q) ||
                  (n.hostname ?? '').toLowerCase().includes(q) ||
                  (role?.zone ?? '').toLowerCase().includes(q) ||
                  (role?.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
                );
              },
            }}
            filters={[
              {
                id: 'status',
                label: 'Status',
                options: [
                  { value: 'assigned', label: 'Assigned', predicate: (n) => rolesById.has(n.id) },
                  { value: 'discovery', label: 'Discovery', predicate: (n) => !rolesById.has(n.id) },
                ],
              },
            ]}
            actions={nodeRowActions}
            emptyState={{
              icon: NodeIcon,
              title: 'No nodes reported',
              description: 'The cluster has not reported any nodes yet.',
            }}
          />

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

      {/* Skip Dead Nodes Dialog */}
      <Dialog
        open={skipDialogOpen}
        onOpenChange={(open) => {
          setSkipDialogOpen(open);
          if (!open) {
            setSkipResult(null);
            setSkipVersionInput('');
            setAllowMissingData(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip Dead Nodes</DialogTitle>
            <DialogDescription>
              Force the layout update trackers forward past nodes that will never acknowledge. Use
              only when nodes are permanently lost.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Alert variant="warning">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Advanced recovery action</AlertTitle>
              <AlertDescription>
                Skipping advances sync progress without the missing nodes. “Allow missing data” can
                discard data those nodes still held — only enable it if they are gone for good.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label>Layout version</Label>
              <Input
                type="number"
                value={skipVersion}
                onChange={(e) => setSkipVersionInput(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={allowMissingData} onCheckedChange={setAllowMissingData} />
              Allow missing data (unsafe)
            </label>
            {skipResult && (
              <div className="space-y-1 rounded-md border bg-muted/20 p-3 text-sm">
                <div className="font-medium">Trackers advanced</div>
                <div className="text-muted-foreground">
                  ACK updated: {skipResult.ackUpdated.join(', ') || '—'}
                </div>
                <div className="text-muted-foreground">
                  SYNC updated: {skipResult.syncUpdated.join(', ') || '—'}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipDialogOpen(false)}>
              Close
            </Button>
            <Button
              variant="destructive"
              onClick={handleSkipDeadNodes}
              disabled={skipDeadNodesMutation.isPending}
            >
              {skipDeadNodesMutation.isPending ? 'Submitting...' : 'Skip Dead Nodes'}
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
