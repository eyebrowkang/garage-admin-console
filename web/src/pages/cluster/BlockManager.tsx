import { useState } from 'react';
import { AlertTriangle, Database, RefreshCw, Trash2, Info, Search } from 'lucide-react';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useClusterContext } from '@/contexts/ClusterContext';
import {
  useBlockErrors,
  useBlockInfo,
  useRetryBlockResync,
  usePurgeBlocks,
} from '@/hooks/useBlocks';
import { NodeSelector } from '@/components/cluster/NodeSelector';
import { ConfirmDialog } from '@/components/cluster/ConfirmDialog';
import { JsonViewer } from '@/components/cluster/JsonViewer';
import { formatDateTime, formatShortId } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import type { BlockError } from '@/types/garage';

export function BlockManager() {
  const { clusterId } = useClusterContext();

  const [selectedNode, setSelectedNode] = useState<string>('*');
  const [selectedBlockHash, setSelectedBlockHash] = useState<string | null>(null);
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purgeHashes, setPurgeHashes] = useState('');

  const { data: errorData, isLoading, error, refetch } = useBlockErrors(clusterId, selectedNode);
  const { data: blockInfo, isLoading: blockInfoLoading } = useBlockInfo(
    clusterId,
    selectedBlockHash || '',
  );
  const retryMutation = useRetryBlockResync(clusterId);
  const purgeMutation = usePurgeBlocks(clusterId);

  const handleRetryResync = async (blockHash: string) => {
    try {
      await retryMutation.mutateAsync({ blockHash });
      toast({
        title: 'Resync scheduled',
        description: `Block ${formatShortId(blockHash)} queued for resync`,
      });
      refetch();
    } catch (err) {
      toast({
        title: 'Retry failed',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  const handlePurge = async () => {
    const hashes = purgeHashes
      .split('\n')
      .map((h) => h.trim())
      .filter((h) => h.length > 0);

    if (hashes.length === 0) {
      toast({ title: 'No block hashes provided', variant: 'destructive' });
      return;
    }

    try {
      await purgeMutation.mutateAsync({ blocks: hashes });
      toast({
        title: 'Blocks purged',
        description: `${hashes.length} block(s) have been purged`,
      });
      setPurgeDialogOpen(false);
      setPurgeHashes('');
      refetch();
    } catch (err) {
      toast({
        title: 'Purge failed',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  // Collect all errors from the multi-node response
  const allErrors: Array<BlockError & { nodeId: string }> = [];
  if (errorData?.success) {
    for (const [nodeId, nodeData] of Object.entries(errorData.success)) {
      if (nodeData.blockErrors) {
        for (const blockError of nodeData.blockErrors) {
          allErrors.push({ ...blockError, nodeId });
        }
      }
    }
  }

  const hasErrors = allErrors.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Block Management</h1>
          <p className="text-sm text-muted-foreground">
            Monitor and resolve block synchronization errors
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="destructive" onClick={() => setPurgeDialogOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Purge Blocks
          </Button>
        </div>
      </div>

      {/* Warning Banner */}
      {hasErrors && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Block Errors Detected</AlertTitle>
          <AlertDescription>
            {allErrors.length} block error(s) found. These may indicate data corruption or
            synchronization issues. Review and retry resync or purge as needed.
          </AlertDescription>
        </Alert>
      )}

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

      {/* Error List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Block Errors
          </CardTitle>
          <CardDescription>Blocks with synchronization or integrity errors</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading block errors...</div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
            </Alert>
          ) : allErrors.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Block Hash</TableHead>
                  <TableHead>Node</TableHead>
                  <TableHead>Ref Count</TableHead>
                  <TableHead>Error Count</TableHead>
                  <TableHead>Last Try</TableHead>
                  <TableHead>Next Retry</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allErrors.map((blockError) => (
                  <TableRow key={`${blockError.nodeId}-${blockError.blockHash}`}>
                    <TableCell>
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={() => setSelectedBlockHash(blockError.blockHash)}
                      >
                        {formatShortId(blockError.blockHash, 16)}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatShortId(blockError.nodeId, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{blockError.refcount}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={blockError.errorCount > 3 ? 'destructive' : 'warning'}>
                        {blockError.errorCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {blockError.lastTry ? formatDateTime(blockError.lastTry) : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {blockError.nextTry ? formatDateTime(blockError.nextTry) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedBlockHash(blockError.blockHash)}
                          title="View block info"
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRetryResync(blockError.blockHash)}
                          disabled={retryMutation.isPending}
                          title="Retry resync"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <Database className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No block errors found</p>
              <p className="text-sm text-muted-foreground mt-1">
                All blocks are synchronized correctly
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Block Lookup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Block Lookup
          </CardTitle>
          <CardDescription>Look up detailed information about a specific block</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Enter block hash..."
              className=""
              value={selectedBlockHash || ''}
              onChange={(e) => setSelectedBlockHash(e.target.value || null)}
            />
            <Button
              variant="outline"
              disabled={!selectedBlockHash}
              onClick={() => selectedBlockHash && setSelectedBlockHash(selectedBlockHash)}
            >
              <Search className="h-4 w-4 mr-2" />
              Lookup
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Block Info Dialog */}
      <Dialog
        open={!!selectedBlockHash}
        onOpenChange={(open) => !open && setSelectedBlockHash(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Block Information</DialogTitle>
            <DialogDescription className="text-xs">{selectedBlockHash}</DialogDescription>
          </DialogHeader>
          {blockInfoLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading block info...</div>
          ) : blockInfo ? (
            <div className="space-y-4">
              {/* Multi-node response */}
              {blockInfo.success &&
                Object.entries(blockInfo.success).map(([nodeId, info]) => (
                  <Card key={nodeId}>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">
                        {formatShortId(nodeId, 12)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {info.refcount !== undefined && (
                        <div>
                          <div className="text-sm text-muted-foreground">Reference Count</div>
                          <div className="font-medium">{info.refcount}</div>
                        </div>
                      )}
                      {info.versions && info.versions.length > 0 && (
                        <div>
                          <div className="text-sm text-muted-foreground mb-2">Versions</div>
                          <div className="space-y-2">
                            {info.versions.map((version, idx: number) => (
                              <div key={idx} className="border rounded p-2 text-xs">
                                <div className="flex justify-between">
                                  <span>
                                    {formatShortId(version.versionId, 16)}
                                  </span>
                                  <Badge variant={version.deleted ? 'destructive' : 'secondary'}>
                                    {version.deleted ? 'Deleted' : 'Active'}
                                  </Badge>
                                </div>
                                {version.backlinks && version.backlinks.length > 0 && (
                                  <div className="mt-1 text-muted-foreground">
                                    {version.backlinks.map((bl, i: number) => (
                                      <div key={i}>
                                        {bl.type}: {bl.id}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {info.freeform && (
                        <div>
                          <div className="text-sm text-muted-foreground mb-2">Raw Data</div>
                          <JsonViewer data={info.freeform} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              {blockInfo.error && Object.keys(blockInfo.error).length > 0 && (
                <Alert variant="destructive">
                  <AlertTitle>Errors from some nodes</AlertTitle>
                  <AlertDescription>
                    <JsonViewer data={blockInfo.error} />
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              No block information available
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Purge Blocks Dialog */}
      <Dialog open={purgeDialogOpen} onOpenChange={setPurgeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Purge Blocks
            </DialogTitle>
            <DialogDescription>
              Permanently delete blocks from the cluster. This will delete all objects that
              reference these blocks and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Danger Zone</AlertTitle>
              <AlertDescription>
                Purging blocks will permanently delete all objects that use them. Only use this for
                blocks with unrecoverable errors after exhausting other options.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label>Block Hashes (one per line)</Label>
              <textarea
                className="w-full min-h-[150px] p-3 border rounded-md text-xs resize-y"
                placeholder="Enter block hashes to purge, one per line..."
                value={purgeHashes}
                onChange={(e) => setPurgeHashes(e.target.value)}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Purge Confirmation */}
      <ConfirmDialog
        open={purgeDialogOpen && purgeHashes.trim().length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setPurgeDialogOpen(false);
            setPurgeHashes('');
          }
        }}
        title="Confirm Block Purge"
        description={`You are about to permanently delete ${purgeHashes.split('\n').filter((h) => h.trim()).length} block(s). This action cannot be undone and will delete all objects referencing these blocks.`}
        tier="type-to-confirm"
        typeToConfirmValue="PURGE"
        confirmText="Purge Blocks"
        onConfirm={handlePurge}
        isLoading={purgeMutation.isPending}
      />
    </div>
  );
}
