import { useState } from 'react';
import { Activity, Cog, RefreshCw, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { ModulePageHeader } from '@/components/cluster/ModulePageHeader';
import { formatRelativeSeconds, formatShortId } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import type { WorkerInfo } from '@/types/garage';

export function WorkerManager() {
  const { clusterId } = useClusterContext();

  const [selectedNode, setSelectedNode] = useState<string>('*');
  const [busyOnly, setBusyOnly] = useState(false);
  const [errorOnly, setErrorOnly] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<{
    nodeId: string;
    id: number;
    name: string;
  } | null>(null);
  const [setVariableNode, setSetVariableNode] = useState<string>('*');
  const [variableDialogOpen, setVariableDialogOpen] = useState(false);
  const [editVariable, setEditVariable] = useState<{ name: string; value: string } | null>(null);
  const [variableLookupInput, setVariableLookupInput] = useState('');
  const [variableLookupName, setVariableLookupName] = useState<string | undefined>(undefined);

  const {
    data: workersData,
    isLoading,
    error,
    refetch,
  } = useWorkers(clusterId, selectedNode, {
    busyOnly,
    errorOnly,
  });
  const { data: workerInfo, isLoading: workerInfoLoading } = useWorkerInfo(
    clusterId,
    selectedWorker?.nodeId || '*',
    selectedWorker?.id ?? -1,
  );
  const {
    data: variableLookupData,
    isLoading: variableLookupLoading,
    error: variableLookupError,
  } = useWorkerVariable(clusterId, selectedNode, variableLookupName);
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

  const handleVariableLookup = () => {
    const trimmed = variableLookupInput.trim();
    setVariableLookupName(trimmed ? trimmed : undefined);
  };

  const handleClearVariableLookup = () => {
    setVariableLookupInput('');
    setVariableLookupName(undefined);
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
  const variableLookupErrors =
    variableLookupName && variableLookupData?.error ? Object.entries(variableLookupData.error) : [];
  const variableLookupRows =
    variableLookupName && variableLookupData?.success
      ? Object.entries(variableLookupData.success).map(([nodeId, variables]) => ({
          nodeId,
          value: variables?.[variableLookupName],
        }))
      : [];
  const allVariablesErrors = allVariablesData?.error ? Object.entries(allVariablesData.error) : [];
  const targetNodeLabel =
    setVariableNode === '*'
      ? 'all nodes'
      : setVariableNode === 'self'
        ? 'the current node'
        : 'the selected node';

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
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => openSetVariableDialog()}>
              <Settings className="h-4 w-4 mr-2" />
              Set Variable
            </Button>
          </>
        }
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filters</CardTitle>
          <CardDescription>Limit results by node and worker state.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-2">
              <Label>Node</Label>
              <NodeSelector
                clusterId={clusterId}
                value={selectedNode}
                onChange={setSelectedNode}
                includeAll
              />
            </div>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <label className="flex items-center gap-2 text-foreground">
                <Checkbox checked={busyOnly} onCheckedChange={setBusyOnly} />
                Busy only
              </label>
              <label className="flex items-center gap-2 text-foreground">
                <Checkbox checked={errorOnly} onCheckedChange={setErrorOnly} />
                Error only
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Variables */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cog className="h-5 w-5" />
            Key Variables
          </CardTitle>
          <CardDescription>Worker configuration variables for the selected node(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {allVariablesLoading ? (
            <div className="text-sm text-muted-foreground">Loading variables...</div>
          ) : allVariablesError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load variables</AlertTitle>
              <AlertDescription>{getApiErrorMessage(allVariablesError)}</AlertDescription>
            </Alert>
          ) : allVariablesData?.success ? (
            <div className="space-y-6">
              {Object.entries(allVariablesData.success).map(([nodeId, variables]) => {
                const entries = Object.entries(variables ?? {}).sort(([a], [b]) =>
                  a.localeCompare(b),
                );
                return (
                  <div key={nodeId} className="space-y-3">
                    <div className="text-xs text-muted-foreground">
                      Node {formatShortId(nodeId, 12)}
                    </div>
                    {entries.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Variable</TableHead>
                            <TableHead>Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entries.map(([name, value]) => (
                            <TableRow key={`${nodeId}-${name}`}>
                              <TableCell className="font-medium">{name}</TableCell>
                              <TableCell className="font-mono text-xs">{value}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-sm text-muted-foreground">No variables returned.</div>
                    )}
                  </div>
                );
              })}
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
            <div className="text-sm text-muted-foreground">No variables returned.</div>
          )}
        </CardContent>
      </Card>

      {/* Variable Lookup */}
      <Card>
        <CardHeader>
          <CardTitle>Variable Lookup</CardTitle>
          <CardDescription>Fetch the current value of any worker variable.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
            <div className="space-y-2">
              <Label>Variable name</Label>
              <Input
                value={variableLookupInput}
                onChange={(e) => setVariableLookupInput(e.target.value)}
                placeholder="e.g., resync-tranquility"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleVariableLookup();
                  }
                }}
              />
            </div>
            <Button onClick={handleVariableLookup} disabled={!variableLookupInput.trim()}>
              Fetch
            </Button>
            <Button variant="outline" onClick={handleClearVariableLookup}>
              Clear
            </Button>
          </div>

          {variableLookupName ? (
            variableLookupLoading ? (
              <div className="text-sm text-muted-foreground">Loading variable...</div>
            ) : variableLookupError ? (
              <Alert variant="destructive">
                <AlertTitle>Failed to fetch variable</AlertTitle>
                <AlertDescription>{getApiErrorMessage(variableLookupError)}</AlertDescription>
              </Alert>
            ) : variableLookupRows.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Node</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variableLookupRows.map((row) => (
                    <TableRow key={row.nodeId}>
                      <TableCell className="text-xs">{formatShortId(row.nodeId, 12)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.value !== undefined ? row.value : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-sm text-muted-foreground">No values returned.</div>
            )
          ) : (
            <div className="text-sm text-muted-foreground">
              Enter a variable name to fetch values for the selected node(s).
            </div>
          )}

          {variableLookupErrors.length > 0 && (
            <Alert variant="warning">
              <AlertTitle>Partial results</AlertTitle>
              <AlertDescription>
                {variableLookupErrors.map(([nodeId, message]) => (
                  <div key={nodeId} className="text-xs">
                    {formatShortId(nodeId, 8)}: {message}
                  </div>
                ))}
              </AlertDescription>
            </Alert>
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
            <div className="text-center py-8 text-muted-foreground">Loading workers...</div>
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
                      <TableHead className="text-right">Actions</TableHead>
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
                        <TableCell className="text-right">
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
              <div className="text-center py-8 text-muted-foreground">Loading worker info...</div>
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
                includeSelf
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
