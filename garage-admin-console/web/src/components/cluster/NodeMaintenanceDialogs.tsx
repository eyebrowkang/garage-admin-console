import { useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Alert,
  AlertDescription,
  AlertTitle,
  toast,
} from '@garage/ui';
import { formatShortId, getApiErrorMessage } from '@garage/web-shared';
import { NodeSelector } from '@/components/cluster/NodeSelector';
import {
  useConnectNodes,
  useCreateMetadataSnapshot,
  useLaunchRepairOperation,
  useNodes,
} from '@/hooks/useNodes';
import type { NodeResp, RepairType, ScrubCommand } from '@/types/garage';

/**
 * Shared Snapshot / Repair / Connect dialogs for cluster nodes — used by both
 * the Nodes list (cluster-wide, with a Target selector) and the Node detail page
 * (pinned to one node), so the two never drift. `'*'` targets every node.
 */

const REPAIR_OPERATIONS = [
  { value: 'tables', label: 'Tables', description: 'Verify and repair all metadata tables' },
  { value: 'blocks', label: 'Blocks', description: 'Verify block integrity and rebalance' },
  { value: 'versions', label: 'Versions', description: 'Verify object versions consistency' },
  {
    value: 'multipartUploads',
    label: 'Multipart Uploads',
    description: 'Repair multipart upload metadata',
  },
  { value: 'blockRefs', label: 'Block Refs', description: 'Verify block reference counts' },
  { value: 'blockRc', label: 'Block RC', description: 'Recalculate block reference counts' },
  { value: 'rebalance', label: 'Rebalance', description: 'Rebalance data across nodes' },
  { value: 'aliases', label: 'Aliases', description: 'Rebuild bucket alias metadata' },
  {
    value: 'clearResyncQueue',
    label: 'Clear Resync Queue',
    description: 'Clear pending resync tasks',
  },
  { value: 'scrub', label: 'Scrub', description: 'Full data scrub and verification' },
] as const;

const SCRUB_COMMANDS = [
  { value: 'start', label: 'Start' },
  { value: 'pause', label: 'Pause' },
  { value: 'resume', label: 'Resume' },
  { value: 'cancel', label: 'Cancel' },
] as const;

type RepairOperationValue = (typeof REPAIR_OPERATIONS)[number]['value'];

/** Operations whose run can drive sustained disk/CPU load — surfaced as a warning. */
const RESOURCE_INTENSIVE = new Set<RepairOperationValue>(['scrub', 'rebalance', 'blocks']);

interface NodeOpDialogProps {
  clusterId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** List page: render a Target selector (All Nodes + each node). */
  allowScopeSelection?: boolean;
  /** Detail page / row preset: the node this op targets (`undefined` ⇒ all). */
  nodeId?: string;
  /** Hostname for messaging when pinned to a single node. */
  nodeLabel?: string;
}

/** Human label for the resolved target, used in copy + toasts. */
function scopeLabel(target: string, nodes: NodeResp[] | undefined, fixedLabel?: string): string {
  if (target === '*') return 'all nodes';
  const node = nodes?.find((n) => n.id === target);
  return node?.hostname || fixedLabel || formatShortId(target, 12);
}

/** Either a Target node picker (list page) or a read-only pinned target (detail). */
function ScopeField({
  allowScopeSelection,
  clusterId,
  target,
  onChange,
  fixedLabel,
}: {
  allowScopeSelection?: boolean;
  clusterId: string;
  target: string;
  onChange: (value: string) => void;
  fixedLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Target</Label>
      {allowScopeSelection ? (
        <>
          <NodeSelector clusterId={clusterId} value={target} onChange={onChange} includeAll />
          <p className="text-xs text-muted-foreground">Apply to all nodes, or pick a single node.</p>
        </>
      ) : (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">
          {fixedLabel || 'This node'}
        </div>
      )}
    </div>
  );
}

export function SnapshotDialog({
  clusterId,
  open,
  onOpenChange,
  allowScopeSelection,
  nodeId,
  nodeLabel,
}: NodeOpDialogProps) {
  const snapshotMutation = useCreateMetadataSnapshot(clusterId);
  const { data: status } = useNodes(clusterId);
  const [target, setTarget] = useState<string>(nodeId ?? '*');

  // Re-seed the target each time the dialog opens (React's "adjust state on a
  // prop change during render" pattern — runs once per open transition).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setTarget(nodeId ?? '*');
  }

  const label = scopeLabel(target, status?.nodes, nodeLabel);

  const handleConfirm = async () => {
    try {
      await snapshotMutation.mutateAsync(target);
      toast({
        title: 'Snapshot created',
        description: `Metadata snapshot requested for ${label}.`,
        variant: 'success',
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Snapshot failed',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Metadata Snapshot</DialogTitle>
          <DialogDescription>
            Take a point-in-time copy of the metadata database for {label}. This is a
            non-destructive, read-only operation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <ScopeField
            allowScopeSelection={allowScopeSelection}
            clusterId={clusterId}
            target={target}
            onChange={setTarget}
            fixedLabel={nodeLabel}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={snapshotMutation.isPending}>
            {snapshotMutation.isPending ? 'Creating...' : 'Create Snapshot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RepairDialog({
  clusterId,
  open,
  onOpenChange,
  allowScopeSelection,
  nodeId,
  nodeLabel,
}: NodeOpDialogProps) {
  const repairMutation = useLaunchRepairOperation(clusterId);
  const { data: status } = useNodes(clusterId);
  const [target, setTarget] = useState<string>(nodeId ?? '*');
  const [op, setOp] = useState<RepairOperationValue>('tables');
  const [scrub, setScrub] = useState<ScrubCommand>('start');

  // Re-seed the form each time the dialog opens (see SnapshotDialog).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTarget(nodeId ?? '*');
      setOp('tables');
      setScrub('start');
    }
  }

  const label = scopeLabel(target, status?.nodes, nodeLabel);
  const opMeta = REPAIR_OPERATIONS.find((o) => o.value === op);
  const heavy = RESOURCE_INTENSIVE.has(op);
  const warning = [
    heavy && `${opMeta?.label} is resource-intensive (sustained disk & CPU).`,
    target === '*' && 'This launches on every node at once.',
  ]
    .filter(Boolean)
    .join(' ');

  const handleConfirm = async () => {
    try {
      const repairType: RepairType = op === 'scrub' ? { scrub } : op;
      const suffix = op === 'scrub' ? ` (${scrub})` : '';
      await repairMutation.mutateAsync({ repairType, nodeId: target });
      toast({
        title: 'Repair operation started',
        description: `${opMeta?.label ?? op}${suffix} launched for ${label}.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'Repair failed', description: getApiErrorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Launch Repair Operation</DialogTitle>
          <DialogDescription>Verify and repair cluster data for {label}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <ScopeField
            allowScopeSelection={allowScopeSelection}
            clusterId={clusterId}
            target={target}
            onChange={setTarget}
            fixedLabel={nodeLabel}
          />
          <div className="space-y-2">
            <Label>Repair type</Label>
            <Select value={op} onValueChange={(value) => setOp(value as RepairOperationValue)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPAIR_OPERATIONS.map((operation) => (
                  <SelectItem key={operation.value} value={operation.value}>
                    {operation.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{opMeta?.description}</p>
          </div>
          {op === 'scrub' && (
            <div className="space-y-2">
              <Label>Scrub command</Label>
              <Select value={scrub} onValueChange={(value) => setScrub(value as ScrubCommand)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCRUB_COMMANDS.map((command) => (
                    <SelectItem key={command.value} value={command.value}>
                      {command.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {warning && (
            <Alert variant="warning">
              <AlertTitle>Heads up</AlertTitle>
              <AlertDescription>{warning} Expect elevated load while it runs.</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={repairMutation.isPending}>
            {repairMutation.isPending ? 'Starting...' : 'Launch Repair'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConnectNodesDialog({
  clusterId,
  open,
  onOpenChange,
}: {
  clusterId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const connectMutation = useConnectNodes(clusterId);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  // Reset the textarea each time the dialog opens (see SnapshotDialog).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setInput('');
      setError('');
    }
  }

  // Parse one `node_id@address` per line; trim, drop blanks, and de-duplicate.
  const entries = useMemo(
    () => Array.from(new Set(input.split(/\n+/).map((v) => v.trim()).filter(Boolean))),
    [input],
  );
  const invalid = useMemo(() => entries.filter((v) => !/^[^@,\s]+@[^@,\s]+$/.test(v)), [entries]);
  const validCount = entries.length - invalid.length;

  const handleConnect = async () => {
    if (entries.length === 0) {
      setError('Enter at least one node in the form node_id@address.');
      return;
    }
    if (invalid.length > 0) {
      setError(`Invalid entries: ${invalid.join(', ')}`);
      return;
    }
    setError('');
    try {
      await connectMutation.mutateAsync(entries);
      toast({
        title: 'Connect request sent',
        description: `Requested ${entries.length} node${entries.length === 1 ? '' : 's'}.`,
        variant: 'success',
      });
      onOpenChange(false);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to connect nodes.'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Cluster Nodes</DialogTitle>
          <DialogDescription>
            Tell this Garage node to dial other nodes at {'<node_id>@<net_address>'}. Node IDs are
            generated automatically when a node starts.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="connect-nodes">Nodes</Label>
          <Textarea
            id="connect-nodes"
            className="min-h-[140px] font-mono"
            placeholder={`node_id@address\nnode_id@address`}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError('');
            }}
          />
          <p className="text-xs text-muted-foreground">
            One node per line.
            {entries.length > 0 && (
              <>
                {' · '}
                <span className="text-foreground">{validCount} valid</span>
                {invalid.length > 0 && (
                  <span className="text-destructive"> · {invalid.length} invalid</span>
                )}
              </>
            )}
          </p>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Connect failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConnect}
            disabled={connectMutation.isPending || entries.length === 0 || invalid.length > 0}
          >
            {connectMutation.isPending ? 'Connecting...' : 'Connect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
