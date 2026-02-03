import { useState } from 'react';
import { Cog, RefreshCw, Settings, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useClusterContext } from '@/contexts/ClusterContext';
import {
  useWorkers,
  useWorkerInfo,
  useWorkerVariable,
  useSetWorkerVariable,
} from '@/hooks/useWorkers';
import { NodeSelector } from '@/components/cluster/NodeSelector';
import { JsonViewer } from '@/components/cluster/JsonViewer';
import { formatShortId } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import type { WorkerListItem } from '@/types/garage';

// Key variables that are commonly adjusted
const KEY_VARIABLES = [
  { name: 'resync-tranquility', description: 'Delay between resync operations (ms)' },
  { name: 'scrub-tranquility', description: 'Delay between scrub operations (ms)' },
  { name: 'block-manager-background-tranquility', description: 'Background task delay (ms)' },
];

export function WorkerManager() {
  const { clusterId } = useClusterContext();

  const [selectedNode, setSelectedNode] = useState<string>('*');
  const [selectedWorker, setSelectedWorker] = useState<{
    nodeId: string;
    id: number;
    name: string;
  } | null>(null);
  const [variableDialogOpen, setVariableDialogOpen] = useState(false);
  const [editVariable, setEditVariable] = useState<{ name: string; value: string } | null>(null);

  const { data: workersData, isLoading, error, refetch } = useWorkers(clusterId, selectedNode);
  const { data: workerInfo, isLoading: workerInfoLoading } = useWorkerInfo(
    clusterId,
    selectedWorker?.nodeId || '*',
    selectedWorker?.id ?? -1,
  );
  const setVariableMutation = useSetWorkerVariable(clusterId);

  // Collect all workers from the multi-node response
  const allWorkers: Array<WorkerListItem & { nodeId: string }> = [];
  if (workersData?.success) {
    for (const [nodeId, nodeData] of Object.entries(workersData.success)) {
      if (nodeData.workers) {
        for (const worker of nodeData.workers) {
          allWorkers.push({ ...worker, nodeId });
        }
      }
    }
  }

  const handleSetVariable = async () => {
    if (!editVariable) return;

    try {
      await setVariableMutation.mutateAsync({
        nodeId: selectedNode === '*' ? undefined : selectedNode,
        variable: editVariable.name,
        value: editVariable.value,
      });
      toast({
        title: 'Variable updated',
        description: `${editVariable.name} has been set to ${editVariable.value}`,
      });
      setEditVariable(null);
      setVariableDialogOpen(false);
    } catch (err) {
      toast({
        title: 'Failed to set variable',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const getStateBadge = (state: string) => {
    switch (state.toLowerCase()) {
      case 'busy':
        return <Badge variant="default">Busy</Badge>;
      case 'idle':
        return <Badge variant="secondary">Idle</Badge>;
      case 'throttled':
        return <Badge variant="warning">Throttled</Badge>;
      case 'done':
        return <Badge variant="success">Done</Badge>;
      default:
        return <Badge variant="outline">{state}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Worker Management</h1>
          <p className="text-sm text-muted-foreground">
            Monitor and configure background workers across cluster nodes
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => setVariableDialogOpen(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Set Variable
          </Button>
        </div>
      </div>

      {/* Node Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filter by Node</CardTitle>
        </CardHeader>
        <CardContent>
          <NodeSelector
            clusterId={clusterId}
            value={selectedNode}
            onChange={setSelectedNode}
            includeAll
          />
        </CardContent>
      </Card>

      {/* Key Variables */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cog className="h-5 w-5" />
            Key Variables
          </CardTitle>
          <CardDescription>Commonly adjusted worker configuration variables</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {KEY_VARIABLES.map((variable) => (
              <VariableCard
                key={variable.name}
                clusterId={clusterId}
                nodeId={selectedNode}
                variable={variable}
                onEdit={(name, value) => {
                  setEditVariable({ name, value });
                  setVariableDialogOpen(true);
                }}
              />
            ))}
          </div>
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
              <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
            </Alert>
          ) : allWorkers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Worker</TableHead>
                  <TableHead>Node</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Tranquility</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allWorkers.map((worker) => (
                  <TableRow key={`${worker.nodeId}-${worker.name}`}>
                    <TableCell className="font-medium">{worker.name}</TableCell>
                    <TableCell className="text-xs">
                      {formatShortId(worker.nodeId, 8)}
                    </TableCell>
                    <TableCell>{getStateBadge(worker.state)}</TableCell>
                    <TableCell>
                      {worker.tranquility !== undefined && worker.tranquility !== null
                        ? `${worker.tranquility}ms`
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {worker.progress !== undefined && worker.progress !== null ? (
                        <span className="text-xs">{worker.progress}</span>
                      ) : (
                        '-'
                      )}
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
              Object.entries(workerInfo.success).map(([nodeId, info]) => (
                <div key={nodeId} className="space-y-4">
                  {info.state && (
                    <div>
                      <div className="text-sm text-muted-foreground">State</div>
                      <div className="mt-1">{getStateBadge(info.state)}</div>
                    </div>
                  )}
                  {info.errors !== undefined && (
                    <div>
                      <div className="text-sm text-muted-foreground">Errors</div>
                      <div className="font-medium">{info.errors}</div>
                    </div>
                  )}
                  {info.tranquility !== undefined && info.tranquility !== null && (
                    <div>
                      <div className="text-sm text-muted-foreground">Tranquility</div>
                      <div className="font-medium">{info.tranquility}ms</div>
                    </div>
                  )}
                  {info.progress !== undefined && info.progress !== null && (
                    <div>
                      <div className="text-sm text-muted-foreground">Progress</div>
                      <div className="font-medium">{info.progress}</div>
                    </div>
                  )}
                  {info.freeform && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-2">Full Info</div>
                      <JsonViewer data={info.freeform} />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No detailed information available
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Set Variable Dialog */}
      <Dialog open={variableDialogOpen} onOpenChange={setVariableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Worker Variable</DialogTitle>
            <DialogDescription>
              Configure a worker variable. Changes will apply to{' '}
              {selectedNode === '*' ? 'all nodes' : 'the selected node'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
            <Button variant="outline" onClick={() => setVariableDialogOpen(false)}>
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

// Helper component for variable cards
function VariableCard({
  clusterId,
  nodeId,
  variable,
  onEdit,
}: {
  clusterId: string;
  nodeId: string;
  variable: { name: string; description: string };
  onEdit: (name: string, value: string) => void;
}) {
  const { data, isLoading } = useWorkerVariable(clusterId, nodeId, variable.name);

  // Get value from first successful node response
  let currentValue = '-';
  if (data?.success) {
    const firstNode = Object.values(data.success)[0];
    if (firstNode?.value !== undefined) {
      currentValue = String(firstNode.value);
    }
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-medium text-sm">{variable.name}</div>
            <div className="text-xs text-muted-foreground mt-1">{variable.description}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(variable.name, currentValue !== '-' ? currentValue : '')}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-3 text-lg tabular-nums">{isLoading ? '...' : currentValue}</div>
      </CardContent>
    </Card>
  );
}
