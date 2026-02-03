import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Loader2, Plus, Copy, ChevronRight } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { api, proxyPath } from '@/lib/api';
import { formatDateTime, formatShortId } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { ConfirmDialog } from '@/components/cluster/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import type { GetKeyInfoResponse, ListKeysResponseItem } from '@/types/garage';

interface KeyListProps {
  clusterId: string;
}

export function KeyList({ clusterId }: KeyListProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [actionError, setActionError] = useState('');
  const [createdKey, setCreatedKey] = useState<GetKeyInfoResponse | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  const {
    data: keys = [],
    isLoading,
    error,
  } = useQuery<ListKeysResponseItem[]>({
    queryKey: ['keys', clusterId],
    queryFn: async () => {
      const res = await api.get<ListKeysResponseItem[]>(proxyPath(clusterId, '/v2/ListKeys'));
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post<GetKeyInfoResponse>(proxyPath(clusterId, '/v2/CreateKey'), {
        name,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['keys', clusterId] });
      setIsDialogOpen(false);
      setNewKeyName('');
      setActionError('');
      setCreatedKey(data);
    },
    onError: (err) => {
      setActionError(getApiErrorMessage(err, 'Failed to create key.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(proxyPath(clusterId, `/v2/DeleteKey?id=${encodeURIComponent(id)}`), {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['keys', clusterId] });
      setDeleteConfirm(null);
      toast({ title: 'Key deleted' });
    },
    onError: (err) => {
      toast({
        title: 'Failed to delete key',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    },
  });

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      setTimeout(() => setCopiedValue(null), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  if (isLoading)
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="animate-spin" />
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Access Keys</h3>
          <p className="text-sm text-muted-foreground">
            Create and manage API keys for bucket access.
          </p>
        </div>
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) setActionError('');
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> Create Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Access Key</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Key Name</Label>
              <Input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="my-app-key"
              />
            </div>
            {actionError && (
              <Alert variant="destructive">
                <AlertTitle>Key creation failed</AlertTitle>
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button
                onClick={() => createMutation.mutate(newKeyName.trim())}
                disabled={!newKeyName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load keys</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(error, 'Keys could not be loaded.')}
          </AlertDescription>
        </Alert>
      )}
      {actionError && !isDialogOpen && (
        <Alert variant="destructive">
          <AlertTitle>Key action failed</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Access Key ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => (
              <TableRow
                key={k.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/clusters/${clusterId}/keys/${k.id}`)}
              >
                <TableCell className="text-xs">{formatShortId(k.id, 12)}</TableCell>
                <TableCell>{k.name || '-'}</TableCell>
                <TableCell>
                  {k.expired ? (
                    <Badge variant="destructive">Expired</Badge>
                  ) : (
                    <Badge variant="success">Active</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDateTime(k.created)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDateTime(k.expiration)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => setDeleteConfirm({ id: k.id, name: k.name || k.id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {keys.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                  No keys found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={Boolean(createdKey)}
        onOpenChange={(open) => {
          if (!open) setCreatedKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Access Key Created</DialogTitle>
          </DialogHeader>
          {createdKey && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-slate-50/70 p-3">
                <div className="text-xs text-muted-foreground">Access Key ID</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-900 break-all">
                    {createdKey.accessKeyId}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopy(createdKey.accessKeyId)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                {copiedValue === createdKey.accessKeyId && (
                  <div className="text-xs text-emerald-600 mt-1">Copied!</div>
                )}
              </div>
              <div className="rounded-lg border bg-slate-50/70 p-3">
                <div className="text-xs text-muted-foreground">Secret Access Key</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-900 break-all">
                    {createdKey.secretAccessKey || '-'}
                  </span>
                  {createdKey.secretAccessKey && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopy(createdKey.secretAccessKey || '')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {createdKey.secretAccessKey && copiedValue === createdKey.secretAccessKey && (
                  <div className="text-xs text-emerald-600 mt-1">Copied!</div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Secret access keys are only shown once. Store it securely.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreatedKey(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Delete Access Key"
        description={`Are you sure you want to delete the key "${deleteConfirm?.name}"? This will revoke access to all buckets using this key.`}
        tier="danger"
        confirmText="Delete Key"
        onConfirm={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
