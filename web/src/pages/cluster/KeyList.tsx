import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, Loader2, Plus, Copy } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { api, proxyPath } from '@/lib/api';
import { formatDateTime24h, formatShortId } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { ConfirmDialog } from '@/components/cluster/ConfirmDialog';
import { ModulePageHeader } from '@/components/cluster/ModulePageHeader';
import { toast } from '@/hooks/use-toast';
import { useImportKey } from '@/hooks/useKeys';
import type { CreateKeyRequest, GetKeyInfoResponse, ListKeysResponseItem } from '@/types/garage';

interface KeyListProps {
  clusterId: string;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function KeyList({ clusterId }: KeyListProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createExpirationDate, setCreateExpirationDate] = useState('');
  const [createExpirationHour, setCreateExpirationHour] = useState('00');
  const [createExpirationMinute, setCreateExpirationMinute] = useState('00');
  const [createNeverExpires, setCreateNeverExpires] = useState(false);
  const [createBucketPermission, setCreateBucketPermission] = useState<
    'default' | 'allow' | 'deny'
  >('default');
  const [importAccessKeyId, setImportAccessKeyId] = useState('');
  const [importSecretAccessKey, setImportSecretAccessKey] = useState('');
  const [importKeyName, setImportKeyName] = useState('');
  const [importError, setImportError] = useState('');
  const [actionError, setActionError] = useState('');
  const [createdKey, setCreatedKey] = useState<GetKeyInfoResponse | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  const resetCreateForm = () => {
    setNewKeyName('');
    setCreateExpirationDate('');
    setCreateExpirationHour('00');
    setCreateExpirationMinute('00');
    setCreateNeverExpires(false);
    setCreateBucketPermission('default');
    setActionError('');
  };

  const resetImportForm = () => {
    setImportAccessKeyId('');
    setImportSecretAccessKey('');
    setImportKeyName('');
    setImportError('');
  };

  const expirationDate = createExpirationDate
    ? new Date(`${createExpirationDate}T${createExpirationHour}:${createExpirationMinute}:00`)
    : null;
  const expirationIso =
    expirationDate && !Number.isNaN(expirationDate.getTime()) ? expirationDate.toISOString() : null;
  const expirationInvalid = Boolean(createExpirationDate) && !expirationIso;

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
    mutationFn: async (payload: CreateKeyRequest) => {
      const res = await api.post<GetKeyInfoResponse>(
        proxyPath(clusterId, '/v2/CreateKey'),
        payload,
      );
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['keys', clusterId] });
      setIsDialogOpen(false);
      resetCreateForm();
      setCreatedKey(data);
    },
    onError: (err) => {
      setActionError(getApiErrorMessage(err, 'Failed to create key.'));
    },
  });

  const importKeyMutation = useImportKey(clusterId);

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

  const handleCreate = () => {
    if (expirationInvalid) return;
    const payload: CreateKeyRequest = {};
    const trimmedName = newKeyName.trim();
    if (trimmedName) payload.name = trimmedName;
    if (createNeverExpires) {
      payload.neverExpires = true;
    } else if (expirationIso) {
      payload.expiration = expirationIso;
    }
    if (createBucketPermission === 'allow') {
      payload.allow = { createBucket: true };
    } else if (createBucketPermission === 'deny') {
      payload.deny = { createBucket: true };
    }
    setActionError('');
    createMutation.mutate(payload);
  };

  const handleImport = async () => {
    if (!importAccessKeyId.trim() || !importSecretAccessKey.trim()) return;
    setImportError('');
    try {
      await importKeyMutation.mutateAsync({
        accessKeyId: importAccessKeyId.trim(),
        secretAccessKey: importSecretAccessKey.trim(),
        name: importKeyName.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['keys', clusterId] });
      setIsImportDialogOpen(false);
      resetImportForm();
      toast({ title: 'Key imported' });
    } catch (err) {
      setImportError(getApiErrorMessage(err, 'Failed to import key.'));
    }
  };

  if (isLoading)
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="animate-spin" />
      </div>
    );

  return (
    <div className="space-y-5">
      <ModulePageHeader
        title="Access Keys"
        description="Top-level key inventory. Open a key for granular permission controls."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Dialog
              open={isImportDialogOpen}
              onOpenChange={(open) => {
                setIsImportDialogOpen(open);
                if (!open) resetImportForm();
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  Import Key
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import Access Key</DialogTitle>
                </DialogHeader>
                <Alert variant="warning">
                  <AlertTitle>Migration only</AlertTitle>
                  <AlertDescription>
                    Imports an existing API key. This feature must only be used for migrations and
                    backup restore. Do not use it to generate custom key identifiers or you will
                    break your Garage cluster.
                  </AlertDescription>
                </Alert>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Access Key ID</Label>
                    <Input
                      value={importAccessKeyId}
                      onChange={(e) => setImportAccessKeyId(e.target.value)}
                      placeholder="AKIA..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Secret Access Key</Label>
                    <Input
                      type="password"
                      value={importSecretAccessKey}
                      onChange={(e) => setImportSecretAccessKey(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Key Name (optional)</Label>
                    <Input
                      value={importKeyName}
                      onChange={(e) => setImportKeyName(e.target.value)}
                      placeholder="migrated-key"
                    />
                  </div>
                </div>
                {importError && (
                  <Alert variant="destructive">
                    <AlertTitle>Import failed</AlertTitle>
                    <AlertDescription>{importError}</AlertDescription>
                  </Alert>
                )}
                <DialogFooter>
                  <Button
                    onClick={handleImport}
                    disabled={
                      importKeyMutation.isPending ||
                      !importAccessKeyId.trim() ||
                      !importSecretAccessKey.trim()
                    }
                  >
                    {importKeyMutation.isPending ? 'Importing...' : 'Import'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) resetCreateForm();
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
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Key Name</Label>
                    <Input
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="my-app-key"
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Expiration (24h)</Label>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Date</div>
                          <Input
                            type="date"
                            value={createExpirationDate}
                            onChange={(e) => setCreateExpirationDate(e.target.value)}
                            disabled={createNeverExpires}
                            className="min-w-[170px]"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Time</div>
                          <div className="flex items-center gap-2">
                            <Select
                              value={createExpirationHour}
                              onValueChange={setCreateExpirationHour}
                              disabled={createNeverExpires}
                            >
                              <SelectTrigger className="w-[84px]">
                                <SelectValue placeholder="HH" />
                              </SelectTrigger>
                              <SelectContent>
                                {HOUR_OPTIONS.map((hour) => (
                                  <SelectItem key={hour} value={hour}>
                                    {hour}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <span className="text-sm text-muted-foreground">:</span>
                            <Select
                              value={createExpirationMinute}
                              onValueChange={setCreateExpirationMinute}
                              disabled={createNeverExpires}
                            >
                              <SelectTrigger className="w-[84px]">
                                <SelectValue placeholder="MM" />
                              </SelectTrigger>
                              <SelectContent>
                                {MINUTE_OPTIONS.map((minute) => (
                                  <SelectItem key={minute} value={minute}>
                                    {minute}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Leave empty to use the default expiration policy.
                      </p>
                      {expirationInvalid && (
                        <p className="text-xs text-destructive">Invalid date and time.</p>
                      )}
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={createNeverExpires}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setCreateNeverExpires(checked);
                          if (checked) {
                            setCreateExpirationDate('');
                            setCreateExpirationHour('00');
                            setCreateExpirationMinute('00');
                          }
                        }}
                        className="h-4 w-4 cursor-pointer"
                      />
                      Never expires
                    </label>
                  </div>
                  <div className="space-y-2">
                    <Label>Bucket Creation Permission</Label>
                    <Select
                      value={createBucketPermission}
                      onValueChange={(value) =>
                        setCreateBucketPermission(value as 'default' | 'allow' | 'deny')
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default (no override)</SelectItem>
                        <SelectItem value="allow">Allow create bucket</SelectItem>
                        <SelectItem value="deny">Deny create bucket</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Controls whether the key can create buckets.
                    </p>
                  </div>
                </div>
                {actionError && (
                  <Alert variant="destructive">
                    <AlertTitle>Key creation failed</AlertTitle>
                    <AlertDescription>{actionError}</AlertDescription>
                  </Alert>
                )}
                <DialogFooter>
                  <Button
                    onClick={handleCreate}
                    disabled={expirationInvalid || createMutation.isPending}
                  >
                    {createMutation.isPending ? 'Creating...' : 'Create'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

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

      <div className="overflow-hidden rounded-lg border bg-card">
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
                  {formatDateTime24h(k.created)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDateTime24h(k.expiration)}
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
              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">Access Key ID</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-foreground break-all">
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
                  <div className="text-xs text-green-600 mt-1">Copied!</div>
                )}
              </div>
              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">Secret Access Key</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-foreground break-all">
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
                  <div className="text-xs text-green-600 mt-1">Copied!</div>
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
