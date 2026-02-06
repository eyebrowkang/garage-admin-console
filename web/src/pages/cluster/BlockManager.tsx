import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { InlineLoadingState } from '@/components/cluster/InlineLoadingState';
import { JsonViewer } from '@/components/cluster/JsonViewer';
import { ModulePageHeader } from '@/components/cluster/ModulePageHeader';
import {
  DeleteActionIcon,
  InfoActionIcon,
  RefreshActionIcon,
  SearchActionIcon,
} from '@/lib/action-icons';
import { formatDateTime24h, formatShortId } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { BlockIcon } from '@/lib/entity-icons';
import { toast } from '@/hooks/use-toast';
import type { BlockError } from '@/types/garage';

export function BlockManager() {
  const { clusterId } = useClusterContext();

  const [selectedNode, setSelectedNode] = useState<string>('*');
  const [lookupHash, setLookupHash] = useState('');
  const [blockInfoOpen, setBlockInfoOpen] = useState(false);
  const [blockInfoHash, setBlockInfoHash] = useState<string | null>(null);
  const [blockInfoNode, setBlockInfoNode] = useState<string>('*');
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purgeHashes, setPurgeHashes] = useState('');
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);
  const [purgeNode, setPurgeNode] = useState<string>('*');
  const [retryAllDialogOpen, setRetryAllDialogOpen] = useState(false);
  const [retryAllNode, setRetryAllNode] = useState<string>('*');

  const { data: errorData, isLoading, error, refetch } = useBlockErrors(clusterId, selectedNode);
  const {
    data: blockInfo,
    isLoading: blockInfoLoading,
    error: blockInfoError,
  } = useBlockInfo(clusterId, blockInfoHash || '', blockInfoNode);
  const retryMutation = useRetryBlockResync(clusterId);
  const purgeMutation = usePurgeBlocks(clusterId);

  const openBlockInfo = (hash: string, nodeId?: string) => {
    setBlockInfoHash(hash);
    setBlockInfoNode(nodeId || '*');
    setBlockInfoOpen(true);
  };

  const handleLookup = () => {
    const trimmed = lookupHash.trim();
    if (!trimmed) return;
    openBlockInfo(trimmed, selectedNode || '*');
  };

  const handleRetryResync = async (blockHash: string, nodeId: string) => {
    try {
      await retryMutation.mutateAsync({ blockHash, nodeId });
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

  const handleRetryAll = async () => {
    try {
      await retryMutation.mutateAsync({ nodeId: retryAllNode || '*', all: true });
      toast({
        title: 'Resync requested',
        description: `Retrying resync for all missing blocks on ${
          retryAllNode === '*'
            ? 'all nodes'
            : retryAllNode === 'self'
              ? 'self'
              : formatShortId(retryAllNode, 10)
        }`,
      });
      setRetryAllDialogOpen(false);
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
      await purgeMutation.mutateAsync({ blocks: hashes, nodeId: purgeNode || '*' });
      toast({
        title: 'Blocks purged',
        description: `${hashes.length} block(s) have been purged`,
      });
      setPurgeDialogOpen(false);
      setPurgeConfirmOpen(false);
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
  const lookupTargetLabel =
    selectedNode === '*'
      ? 'all nodes'
      : selectedNode === 'self'
        ? 'self'
        : formatShortId(selectedNode, 10);

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="Block Management"
        description="Review synchronization failures and run recovery operations on affected blocks."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshActionIcon className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setRetryAllDialogOpen(true)}>
              <RefreshActionIcon className="h-4 w-4 mr-2" />
              Retry Resync
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setPurgeDialogOpen(true)}>
              <DeleteActionIcon className="h-4 w-4 mr-2" />
              Purge Blocks
            </Button>
          </>
        }
      />

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
          <CardTitle>Target Node</CardTitle>
          <CardDescription>
            Used for filtering and for actions that support targeting a node.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NodeSelector
            clusterId={clusterId}
            value={selectedNode}
            onChange={setSelectedNode}
            includeAll
            includeSelf
          />
        </CardContent>
      </Card>

      {/* Error List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BlockIcon className="h-5 w-5" />
            Block Errors
          </CardTitle>
          <CardDescription>Blocks with synchronization or integrity errors</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <InlineLoadingState label="Loading block errors..." />
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>{getApiErrorMessage(error)}</AlertDescription>
            </Alert>
          ) : allErrors.length > 0 ? (
            <div className="overflow-hidden rounded-lg border bg-card">
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
                          onClick={() => {
                            openBlockInfo(blockError.blockHash, blockError.nodeId);
                          }}
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
                        {blockError.lastTry ? formatDateTime24h(blockError.lastTry) : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {blockError.nextTry ? formatDateTime24h(blockError.nextTry) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              openBlockInfo(blockError.blockHash, blockError.nodeId);
                            }}
                            title="View block info"
                          >
                            <InfoActionIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              handleRetryResync(blockError.blockHash, blockError.nodeId)
                            }
                            disabled={retryMutation.isPending}
                            title="Retry resync"
                          >
                            <RefreshActionIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center">
              <BlockIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
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
            <SearchActionIcon className="h-5 w-5" />
            Block Lookup
          </CardTitle>
          <CardDescription>Look up detailed information about a specific block</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-3">
            <Input
              placeholder="Enter block hash..."
              value={lookupHash}
              onChange={(e) => {
                setLookupHash(e.target.value);
              }}
            />
            <Button variant="outline" disabled={!lookupHash.trim()} onClick={handleLookup}>
              <SearchActionIcon className="h-4 w-4 mr-2" />
              Lookup
            </Button>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Lookup targets: {lookupTargetLabel}
          </div>
        </CardContent>
      </Card>

      {/* Block Info Dialog */}
      <Dialog
        open={blockInfoOpen}
        onOpenChange={(open) => {
          setBlockInfoOpen(open);
          if (!open) {
            setBlockInfoHash(null);
            setBlockInfoNode('*');
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Block Information</DialogTitle>
            <DialogDescription className="text-xs">{blockInfoHash}</DialogDescription>
          </DialogHeader>
          {blockInfoLoading ? (
            <InlineLoadingState label="Loading block info..." />
          ) : blockInfoError ? (
            <Alert variant="destructive">
              <AlertTitle>Failed to load block info</AlertTitle>
              <AlertDescription>{getApiErrorMessage(blockInfoError)}</AlertDescription>
            </Alert>
          ) : blockInfo ? (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">Showing raw block info response.</div>
              <JsonViewer data={blockInfo} />
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              No block information available
            </div>
          )}
          <div className="flex justify-end gap-2">
            {blockInfoHash && (
              <Button
                variant="outline"
                onClick={() => handleRetryResync(blockInfoHash, blockInfoNode)}
                disabled={retryMutation.isPending}
              >
                <RefreshActionIcon className="h-4 w-4 mr-2" />
                Retry Resync
              </Button>
            )}
            <Button variant="outline" onClick={() => setBlockInfoOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Purge Blocks Dialog */}
      <Dialog
        open={purgeDialogOpen}
        onOpenChange={(open) => {
          setPurgeDialogOpen(open);
          if (open) {
            setPurgeNode(selectedNode || '*');
          } else {
            setPurgeHashes('');
            setPurgeConfirmOpen(false);
          }
        }}
      >
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
              <Textarea
                className="min-h-[150px] resize-y text-xs"
                placeholder="Enter block hashes to purge, one per line..."
                value={purgeHashes}
                onChange={(e) => setPurgeHashes(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Target Node</Label>
              <NodeSelector
                clusterId={clusterId}
                value={purgeNode}
                onChange={setPurgeNode}
                includeAll
                includeSelf
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPurgeDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => setPurgeConfirmOpen(true)}
              disabled={purgeHashes.trim().length === 0}
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Purge Confirmation */}
      <ConfirmDialog
        open={purgeConfirmOpen}
        onOpenChange={setPurgeConfirmOpen}
        title="Confirm Block Purge"
        description={`You are about to permanently delete ${
          purgeHashes.split('\n').filter((h) => h.trim()).length
        } block(s) on ${
          purgeNode === '*'
            ? 'all nodes'
            : purgeNode === 'self'
              ? 'self'
              : formatShortId(purgeNode, 10)
        }. This action cannot be undone and will delete all objects referencing these blocks.`}
        tier="type-to-confirm"
        typeToConfirmValue="PURGE"
        confirmText="Purge Blocks"
        onConfirm={handlePurge}
        isLoading={purgeMutation.isPending}
      />

      <Dialog
        open={retryAllDialogOpen}
        onOpenChange={(open) => {
          setRetryAllDialogOpen(open);
          if (open) setRetryAllNode(selectedNode || '*');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retry Block Resync</DialogTitle>
            <DialogDescription>
              Instruct Garage node(s) to retry resynchronization of missing blocks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Target Node</Label>
            <NodeSelector
              clusterId={clusterId}
              value={retryAllNode}
              onChange={setRetryAllNode}
              includeAll
              includeSelf
            />
            <p className="text-xs text-muted-foreground">
              This operation targets all missing blocks on the selected node(s).
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRetryAllDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRetryAll} disabled={retryMutation.isPending}>
              {retryMutation.isPending ? 'Submitting...' : 'Retry Resync'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
