import { useMemo, useState } from 'react';
import { Activity, Cog, Pencil, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useClusterContext } from '@/contexts/ClusterContext';
import {
  useWorkers,
  useWorkerInfo,
  useWorkerVariable,
  useSetWorkerVariable,
} from '@/hooks/useWorkers';
import { NodeSelector } from '@/components/cluster/NodeSelector';
import { InlineLoadingState } from '@/components/cluster/InlineLoadingState';
import { ModulePageHeader } from '@/components/cluster/ModulePageHeader';
import { RefreshActionIcon, SettingsActionIcon } from '@/lib/action-icons';
import { formatRelativeSeconds, formatShortId } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import type { WorkerInfo } from '@/types/garage';

export function WorkerManager() {
  const { clusterId } = useClusterContext();

  const [selectedNode, setSelectedNode] = useState<string>('*');
  const [stateFilter, setStateFilter] = useState<'all' | 'busy' | 'error'>('all');
  const [selectedWorker, setSelectedWorker] = useState<{
    nodeId: string;
    id: number;
    name: string;
  } | null>(null);
  const [setVariableNode, setSetVariableNode] = useState<string>('*');
  const [variableDialogOpen, setVariableDialogOpen] = useState(false);
  const [editVariable, setEditVariable] = useState<{ name: string; value: string } | null>(null);
  const [variableSearch, setVariableSearch] = useState('');

  const {
    data: workersData,
    isLoading,
    error,
    refetch,
  } = useWorkers(clusterId, selectedNode, {
    busyOnly: stateFilter === 'busy',
    errorOnly: stateFilter === 'error',
  });
  const { data: workerInfo, isLoading: workerInfoLoading } = useWorkerInfo(
    clusterId,
    selectedWorker?.nodeId || '*',
    selectedWorker?.id ?? -1,
  );
  const {
    data: allVariablesData,
    isLoading: allVariablesLoading,
    error: allVariablesError,
  } = useWorkerVariable(clusterId, selectedNode, null);
  const setVariableMutation = useSetWorkerVariable(clusterId);

  const openSetVariableDialog = (name = '', value = '') => {
    setEditVariable({ name, value });
    setSetVariableNode(selectedNode);
    setVariableDialogOpen(true);
  };

  // Collect all workers from the multi-node response
  const allWorkers: Array<WorkerInfo & { nodeId: string }> = [];
  if (workersData?.success) {
    for (const [nodeId, nodeWorkers] of Object.entries(workersData.success)) {
      if (Array.isArray(nodeWorkers)) {
        for (const worker of nodeWorkers) {
          allWorkers.push({ ...worker, nodeId });
        }
      }
    }
  }
  const sortedWorkers = [...allWorkers].sort(
    (a, b) => a.name.localeCompare(b.name) || a.nodeId.localeCompare(b.nodeId) || a.id - b.id,
  );
  const workerErrors = workersData?.error ? Object.entries(workersData.error) : [];
  const allVariablesErrors = allVariablesData?.error ? Object.entries(allVariablesData.error) : [];

  // Build a unified variable table: rows = variable names, columns = nodes
  const { nodeIds, variableRows } = useMemo(() => {
    if (!allVariablesData?.success) return { nodeIds: [] as string[], variableRows: [] as Array<{ name: string; values: Record<string, string | undefined> }> };
    const nodeIdSet = Object.keys(allVariablesData.success);
    const varMap = new Map<string, Record<string, string | undefined>>();
    for (const [nodeId, variables] of Object.entries(allVariablesData.success)) {
      for (const [name, value] of Object.entries(variables ?? {})) {
        if (!varMap.has(name)) varMap.set(name, {});
        varMap.get(name)![nodeId] = value;
      }
    }
    const q = variableSearch.toLowerCase().trim();
    let rows = Array.from(varMap.entries())
      .map(([name, values]) => ({ name, values }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (q) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          Object.values(r.values).some((v) => v?.toLowerCase().includes(q)),
      );
    }
    return { nodeIds: nodeIdSet, variableRows: rows };
  }, [allVariablesData, variableSearch]);

  const targetNodeLabel = setVariableNode === '*' ? 'all nodes' : 'the selected node';

  const handleSetVariable = async () => {
    if (!editVariable) return;

    try {
      await setVariableMutation.mutateAsync({
        nodeId: setVariableNode === '*' ? undefined : setVariableNode,
        variable: editVariable.name,
        value: editVariable.value,
      });
      toast({
        title: 'Variable updated',
        description: `${editVariable.name} has been set to ${editVariable.value}`,
      });
      setEditVariable(null);
      setVariableDialogOpen(false);
      setSetVariableNode(selectedNode);
    } catch (err) {
      toast({
        title: 'Failed to set variable',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const formatWorkerState = (state: WorkerInfo['state']) => {
    if (typeof state === 'string') {
      switch (state) {
        case 'busy':
          return { label: 'Busy', variant: 'default' as const };
        case 'idle':
          return { label: 'Idle', variant: 'secondary' as const };
        case 'done':
          return { label: 'Done', variant: 'success' as const };
        default:
          return { label: state, variant: 'outline' as const };
      }
    }
    if (state && typeof state === 'object' && 'throttled' in state) {
      const throttledState = state as { throttled: { durationSecs: number } };
      const duration = throttledState.throttled?.durationSecs;
      const durationLabel = typeof duration === 'number' ? ` (${duration.toFixed(1)}s)` : '';
      return { label: `Throttled${durationLabel}`, variant: 'warning' as const };
    }
    return { label: 'Unknown', variant: 'outline' as const };
  };

  const getStateBadge = (state: WorkerInfo['state']) => {
    const { label, variant } = formatWorkerState(state);
    return <Badge variant={variant}>{label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="Worker Management"
        description="Observe background workers and tune worker variables per node or cluster-wide."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshActionIcon className="h-4 w-4" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => openSetVariableDialog()}>
              <SettingsActionIcon className="h-4 w-4" />
              Set Variable
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5 min-w-[200px] flex-1 max-w-xs">
          <Label className="text-xs text-muted-foreground">Node</Label>
          <NodeSelector
            clusterId={clusterId}
            value={selectedNode}
            onChange={setSelectedNode}
            includeAll
          />
        </div>
        <div className="space-y-1.5 min-w-[160px]">
          <Label className="text-xs text-muted-foreground">State</Label>
          <Select
            value={stateFilter}
            onValueChange={(v) => setStateFilter(v as 'all' | 'busy' | 'error')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              <SelectItem value="busy">Busy</SelectItem>
              <SelectItem value="error">Errors</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Key Variables */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Cog className="h-5 w-5" />
                Key Variables
              </CardTitle>
              <CardDescription>Worker configuration variables for the selected node(s)</CardDescription>
            </div>
          </div>
          <div className="relative pt-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={variableSearch}
              onChange={(e) => setVariableSearch(e.target.value)}
              placeholder="Search variables..."
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {allVariablesLoading ? (
            <InlineLoadingState label="Loading variables..." />
          ) : allVariablesError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load variables</AlertTitle>
              <AlertDescription>{getApiErrorMessage(allVariablesError)}</AlertDescription>
            </Alert>
          ) : variableRows.length > 0 ? (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Variable</TableHead>
                    {nodeIds.map((nodeId) => (
                      <TableHead key={nodeId}>
                        {formatShortId(nodeId, 10)}
                      </TableHead>
                    ))}
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variableRows.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium text-sm">{row.name}</TableCell>
                      {nodeIds.map((nodeId) => (
                        <TableCell key={nodeId} className="font-mono text-xs">
                          {row.values[nodeId] !== undefined ? row.values[nodeId] : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      ))}
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            openSetVariableDialog(
                              row.name,
                              Object.values(row.values).find((v) => v !== undefined) || '',
                            )
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {allVariablesErrors.length > 0 && (
                <Alert variant="warning">
                  <AlertTitle>Partial results</AlertTitle>
                  <AlertDescription>
                    {allVariablesErrors.map(([nodeId, message]) => (
                      <div key={nodeId} className="text-xs">
                        {formatShortId(nodeId, 8)}: {message}
                      </div>
                    ))}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-6">
              {variableSearch ? 'No variables match your search' : 'No variables returned.'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Worker List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Workers
          </CardTitle>
          <CardDescription>Background worker processes and their current state</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <InlineLoadingState label="Loading workers..." />
          ) : error ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load workers</AlertTitle>
              <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {workerErrors.length > 0 && (
                <Alert variant="warning">
                  <AlertTitle>Partial results</AlertTitle>
                  <AlertDescription>
                    {workerErrors.map(([nodeId, message]) => (
                      <div key={nodeId} className="text-xs">
                        {formatShortId(nodeId, 8)}: {message}
                      </div>
                    ))}
                  </AlertDescription>
                </Alert>
              )}
              {sortedWorkers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Worker</TableHead>
                      <TableHead>Node</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Queue</TableHead>
                      <TableHead>Errors</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Tranquility</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedWorkers.map((worker) => (
                      <TableRow key={`${worker.nodeId}-${worker.id}`}>
                        <TableCell>
                          <div className="font-medium">{worker.name}</div>
                          <div className="text-xs text-muted-foreground">#{worker.id}</div>
                        </TableCell>
                        <TableCell className="text-xs">{formatShortId(worker.nodeId, 8)}</TableCell>
                        <TableCell>{getStateBadge(worker.state)}</TableCell>
                        <TableCell className="tabular-nums">{worker.queueLength ?? '-'}</TableCell>
                        <TableCell>
                          <div className="tabular-nums font-medium">{worker.errors}</div>
                          <div className="text-xs text-muted-foreground">
                            {worker.consecutiveErrors} consecutive
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          {worker.progress ? (
                            <span className="text-xs">{worker.progress}</span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {worker.tranquility !== undefined && worker.tranquility !== null
                            ? `${worker.tranquility}ms`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setSelectedWorker({
                                nodeId: worker.nodeId,
                                id: worker.id,
                                name: worker.name,
                              })
                            }
                          >
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <Cog className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No workers found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Workers may not be available for the selected node
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Worker Detail Sheet */}
      <Sheet open={!!selectedWorker} onOpenChange={(open) => !open && setSelectedWorker(null)}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedWorker?.name}</SheetTitle>
            <SheetDescription className="text-xs">
              Node: {selectedWorker?.nodeId ? formatShortId(selectedWorker.nodeId, 12) : '-'}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            {workerInfoLoading ? (
              <InlineLoadingState label="Loading worker info..." />
            ) : workerInfo?.success && selectedWorker ? (
              <div className="space-y-6">
                {Object.entries(workerInfo.success).map(([nodeId, info]) => (
                  <div key={nodeId} className="space-y-4">
                    <div className="text-xs text-muted-foreground">
                      Node {formatShortId(nodeId, 12)}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <div className="text-sm text-muted-foreground">State</div>
                        <div className="mt-1">{getStateBadge(info.state)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Queue length</div>
                        <div className="font-medium tabular-nums">{info.queueLength ?? '-'}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Errors</div>
                        <div className="font-medium tabular-nums">{info.errors}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Consecutive errors</div>
                        <div className="font-medium tabular-nums">{info.consecutiveErrors}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Persistent errors</div>
                        <div className="font-medium tabular-nums">
                          {info.persistentErrors ?? '-'}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Tranquility</div>
                        <div className="font-medium tabular-nums">
                          {info.tranquility !== undefined && info.tranquility !== null
                            ? `${info.tranquility}ms`
                            : '-'}
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="text-sm text-muted-foreground">Progress</div>
                        <div className="font-medium">{info.progress || '-'}</div>
                      </div>
                    </div>
                    {info.lastError && (
                      <div className="rounded-md border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
                        <div className="font-medium">Last error</div>
                        <div className="mt-1">{info.lastError.message}</div>
                        <div className="text-xs text-violet-700 mt-1">
                          {formatRelativeSeconds(info.lastError.secsAgo)}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-sm text-muted-foreground mb-2">Freeform output</div>
                      <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-relaxed whitespace-pre">
                        {info.freeform && info.freeform.length > 0
                          ? info.freeform.join('\n')
                          : 'No freeform output.'}
                      </pre>
                    </div>
                  </div>
                ))}
                {workerInfo.error && Object.keys(workerInfo.error).length > 0 && (
                  <Alert variant="warning">
                    <AlertTitle>Partial results</AlertTitle>
                    <AlertDescription>
                      {Object.entries(workerInfo.error).map(([nodeId, message]) => (
                        <div key={nodeId} className="text-xs">
                          {formatShortId(nodeId, 8)}: {message}
                        </div>
                      ))}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No detailed information available
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Set Variable Dialog */}
      <Dialog
        open={variableDialogOpen}
        onOpenChange={(open) => {
          setVariableDialogOpen(open);
          if (!open) {
            setEditVariable(null);
            setSetVariableNode(selectedNode);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Worker Variable</DialogTitle>
            <DialogDescription>
              Configure a worker variable. Changes will apply to {targetNodeLabel}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Target node</Label>
              <NodeSelector
                clusterId={clusterId}
                value={setVariableNode}
                onChange={setSetVariableNode}
                includeAll
              />
            </div>
            <div className="space-y-2">
              <Label>Variable Name</Label>
              <Input
                value={editVariable?.name || ''}
                onChange={(e) =>
                  setEditVariable((prev) => ({ name: e.target.value, value: prev?.value || '' }))
                }
                placeholder="e.g., resync-tranquility"
              />
            </div>
            <div className="space-y-2">
              <Label>Value</Label>
              <Input
                value={editVariable?.value || ''}
                onChange={(e) =>
                  setEditVariable((prev) => ({ name: prev?.name || '', value: e.target.value }))
                }
                placeholder="e.g., 2000"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setVariableDialogOpen(false);
                setSetVariableNode(selectedNode);
                setEditVariable(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSetVariable}
              disabled={
                !editVariable?.name || !editVariable?.value || setVariableMutation.isPending
              }
            >
              {setVariableMutation.isPending ? 'Setting...' : 'Set Variable'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
