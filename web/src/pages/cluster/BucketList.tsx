import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, proxyPath } from '@/lib/api';
import { formatDateTime24h, formatShortId } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { ConfirmDialog } from '@/components/cluster/ConfirmDialog';
import { AliasMiniChip } from '@/components/cluster/AliasMiniChip';
import { CopyButton } from '@/components/cluster/CopyButton';
import { InlineLoadingState } from '@/components/cluster/InlineLoadingState';
import { ModulePageHeader } from '@/components/cluster/ModulePageHeader';
import { PageLoadingState } from '@/components/cluster/PageLoadingState';
import { AddActionIcon, DeleteActionIcon } from '@/lib/action-icons';
import { toast } from '@/hooks/use-toast';
import { useKeys } from '@/hooks/useKeys';
import type { CreateBucketRequest, ListBucketsResponseItem } from '@/types/garage';

interface BucketListProps {
  clusterId: string;
}

export function BucketList({ clusterId }: BucketListProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'id' | 'globalAliases' | 'created'>('globalAliases');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [aliasType, setAliasType] = useState<'none' | 'global' | 'local' | 'both'>('global');
  const [globalAlias, setGlobalAlias] = useState('');
  const [localAlias, setLocalAlias] = useState('');
  const [localAccessKeyId, setLocalAccessKeyId] = useState('');
  const [actionError, setActionError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const keysQuery = useKeys(clusterId);
  const keys = keysQuery.data ?? [];

  const {
    data: buckets = [],
    isLoading,
    error,
  } = useQuery<ListBucketsResponseItem[]>({
    queryKey: ['buckets', clusterId],
    queryFn: async () => {
      const res = await api.get<ListBucketsResponseItem[]>(proxyPath(clusterId, '/v2/ListBuckets'));
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: CreateBucketRequest) => {
      await api.post(proxyPath(clusterId, '/v2/CreateBucket'), payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buckets', clusterId] });
      setIsDialogOpen(false);
      setGlobalAlias('');
      setLocalAlias('');
      setLocalAccessKeyId('');
      setActionError('');
    },
    onError: (err) => {
      setActionError(getApiErrorMessage(err, 'Failed to create bucket.'));
    },
  });

  const needsGlobal = aliasType === 'global' || aliasType === 'both';
  const needsLocal = aliasType === 'local' || aliasType === 'both';
  const selectedLocalAccessKeyId =
    localAccessKeyId && keys.some((key) => key.id === localAccessKeyId)
      ? localAccessKeyId
      : keys[0]?.id || '';
  const hasLocalKey = Boolean(selectedLocalAccessKeyId);
  const canCreate =
    !createMutation.isPending &&
    (!needsGlobal || Boolean(globalAlias.trim())) &&
    (!needsLocal || (Boolean(localAlias.trim()) && hasLocalKey));

  const handleCreate = () => {
    const payload: CreateBucketRequest = {};
    if (needsGlobal) {
      payload.globalAlias = globalAlias.trim();
    }
    if (needsLocal) {
      payload.localAlias = {
        accessKeyId: selectedLocalAccessKeyId,
        alias: localAlias.trim(),
      };
    }
    createMutation.mutate(payload);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(proxyPath(clusterId, `/v2/DeleteBucket?id=${encodeURIComponent(id)}`), {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buckets', clusterId] });
      setDeleteConfirm(null);
      toast({ title: 'Bucket deleted' });
    },
    onError: (err) => {
      toast({
        title: 'Failed to delete bucket',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    },
  });

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortIcon = (field: typeof sortField) => {
    if (sortField !== field)
      return <ArrowUpDown className="ml-1 inline h-3 w-3 text-muted-foreground/50" />;
    return sortDirection === 'asc' ? (
      <ArrowUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3" />
    );
  };

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let result = buckets;
    if (q) {
      result = result.filter(
        (b) =>
          b.id.toLowerCase().includes(q) ||
          b.globalAliases.some((a) => a.toLowerCase().includes(q)) ||
          b.localAliases.some((a) => a.alias.toLowerCase().includes(q)),
      );
    }
    return [...result].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'id':
          return dir * a.id.localeCompare(b.id);
        case 'globalAliases': {
          const aName = a.globalAliases[0] || '';
          const bName = b.globalAliases[0] || '';
          return dir * aName.localeCompare(bName);
        }
        case 'created':
          return dir * ((a.created || '').localeCompare(b.created || ''));
        default:
          return 0;
      }
    });
  }, [buckets, searchQuery, sortField, sortDirection]);

  if (isLoading) return <PageLoadingState label="Loading buckets..." />;

  return (
    <div className="space-y-6">
      <ModulePageHeader
        title="Buckets"
        description="List-level management for bucket aliases and lifecycle."
        actions={
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (open) {
                setAliasType('global');
                setGlobalAlias('');
                setLocalAlias('');
                setLocalAccessKeyId('');
              } else {
                setActionError('');
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <AddActionIcon className="mr-2 h-4 w-4" /> Create Bucket
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Bucket</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Alias Type</Label>
                  <Select
                    value={aliasType}
                    onValueChange={(value) =>
                      setAliasType(value as 'none' | 'global' | 'local' | 'both')
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select alias type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Global alias</SelectItem>
                      <SelectItem value="local">Local alias</SelectItem>
                      <SelectItem value="both">Global + Local</SelectItem>
                      <SelectItem value="none">No alias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {needsGlobal && (
                  <div className="space-y-2">
                    <Label>Global Alias</Label>
                    <Input
                      value={globalAlias}
                      onChange={(e) => setGlobalAlias(e.target.value)}
                      placeholder="my-bucket"
                    />
                  </div>
                )}

                {needsLocal && (
                  <>
                    <div className="space-y-2">
                      <Label>Local Alias</Label>
                      <Input
                        value={localAlias}
                        onChange={(e) => setLocalAlias(e.target.value)}
                        placeholder="my-bucket"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Access Key</Label>
                      {keysQuery.isLoading ? (
                        <InlineLoadingState label="Loading access keys..." />
                      ) : keysQuery.error ? (
                        <div className="text-sm text-destructive">
                          {getApiErrorMessage(keysQuery.error, 'Failed to load access keys.')}
                        </div>
                      ) : keys.length > 0 ? (
                        <Select
                          value={selectedLocalAccessKeyId}
                          onValueChange={setLocalAccessKeyId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select access key" />
                          </SelectTrigger>
                          <SelectContent>
                            {keys.map((key) => (
                              <SelectItem key={key.id} value={key.id}>
                                {key.name || formatShortId(key.id, 12)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          No access keys available for local alias creation.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              {actionError && (
                <Alert variant="destructive">
                  <AlertTitle>Bucket creation failed</AlertTitle>
                  <AlertDescription>{actionError}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button onClick={handleCreate} disabled={!canCreate}>
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Unable to load buckets</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(error, 'Buckets could not be loaded.')}
          </AlertDescription>
        </Alert>
      )}
      {actionError && !isDialogOpen && (
        <Alert variant="destructive">
          <AlertTitle>Bucket action failed</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by ID or alias..."
          className="pl-9"
        />
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort('id')}
              >
                Bucket ID
                {sortIcon('id')}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort('globalAliases')}
              >
                Global Aliases
                {sortIcon('globalAliases')}
              </TableHead>
              <TableHead>Local Aliases</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort('created')}
              >
                Created
                {sortIcon('created')}
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSorted.map((bucket) => (
              <TableRow
                key={bucket.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/clusters/${clusterId}/buckets/${bucket.id}`)}
              >
                <TableCell className="text-xs">
                  <div className="inline-flex items-center gap-1">
                    <span>{formatShortId(bucket.id, 10)}</span>
                    <CopyButton value={bucket.id} label="Bucket ID" compact />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {bucket.globalAliases.length > 0 ? (
                      bucket.globalAliases.map((alias) => (
                        <AliasMiniChip key={alias} value={alias} kind="global" />
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {bucket.localAliases.length > 0 ? (
                      bucket.localAliases.map((alias) => (
                        <AliasMiniChip
                          key={`${alias.accessKeyId}-${alias.alias}`}
                          value={alias.alias}
                          kind="local"
                        />
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDateTime24h(bucket.created)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() =>
                        setDeleteConfirm({
                          id: bucket.id,
                          name: bucket.globalAliases[0] || bucket.id,
                        })
                      }
                    >
                      <DeleteActionIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredAndSorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                  {searchQuery ? 'No buckets match your search' : 'No buckets found'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Delete Bucket"
        description={`Are you sure you want to delete the bucket "${deleteConfirm?.name}"? The bucket must be empty before it can be deleted.`}
        tier="danger"
        confirmText="Delete Bucket"
        onConfirm={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
