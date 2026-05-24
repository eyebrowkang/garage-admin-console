/**
 * Connections page — list + add/edit/delete S3 connections.
 *
 * Uses @garage/ui primitives (no port of the prototype's custom card CSS,
 * per the "Functional MVP" scope of this phase).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Server } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@garage/ui';

import { api } from '@/lib/api';
import type { Connection } from '@/lib/types';

interface ConnectionFormData {
  name: string;
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
}

const EMPTY_FORM: ConnectionFormData = {
  name: '',
  endpoint: '',
  region: 'us-east-1',
  forcePathStyle: true,
  accessKeyId: '',
  secretAccessKey: '',
};

export function ConnectionsPage({ onOpenConnection }: { onOpenConnection: (id: string) => void }) {
  const qc = useQueryClient();
  const [editTarget, setEditTarget] = useState<Connection | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null);

  const list = useQuery({
    queryKey: ['connections'],
    queryFn: async () => {
      const res = await api.get<Connection[]>('/connections');
      return res.data;
    },
  });

  const createMut = useMutation({
    mutationFn: async (data: ConnectionFormData) => {
      const res = await api.post<Connection>('/connections', data);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ConnectionFormData> }) => {
      const res = await api.put<Connection>(`/connections/${id}`, data);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/connections/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Connections</h1>
          <p className="text-sm text-muted-foreground">
            S3-compatible endpoints managed by this BFF. Click any connection to browse buckets.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus /> Add connection
        </Button>
      </div>

      {list.isLoading && <p className="text-muted-foreground">Loading…</p>}
      {list.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {(list.error as Error).message}
        </div>
      )}

      {list.data && list.data.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Server className="mx-auto mb-3 text-muted-foreground" size={32} />
          <h3 className="text-base font-medium">No connections yet</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Add an endpoint to start browsing buckets.
          </p>
          <Button onClick={() => setAddOpen(true)}>
            <Plus /> Add connection
          </Button>
        </div>
      )}

      {list.data && list.data.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.map((c) => (
            <div
              key={c.id}
              className="group flex flex-col gap-2 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <button className="text-left" onClick={() => onOpenConnection(c.id)}>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground truncate">{c.endpoint}</div>
                <div className="mt-1 text-xs text-muted-foreground">Region: {c.region}</div>
              </button>
              <div className="mt-auto flex justify-end gap-1 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setEditTarget(c)}>
                  <Pencil /> Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(c)}>
                  <Trash2 /> Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConnectionFormDialog
        title="Add connection"
        open={addOpen}
        initial={EMPTY_FORM}
        showSecret
        busy={createMut.isPending}
        error={createMut.error as Error | null}
        onClose={() => setAddOpen(false)}
        onSubmit={async (data) => {
          await createMut.mutateAsync(data);
          setAddOpen(false);
        }}
      />

      <ConnectionFormDialog
        title="Edit connection"
        open={editTarget !== null}
        initial={
          editTarget
            ? {
                name: editTarget.name,
                endpoint: editTarget.endpoint,
                region: editTarget.region,
                forcePathStyle: editTarget.forcePathStyle,
                accessKeyId: '',
                secretAccessKey: '',
              }
            : EMPTY_FORM
        }
        showSecret={false}
        busy={updateMut.isPending}
        error={updateMut.error as Error | null}
        onClose={() => setEditTarget(null)}
        onSubmit={async (data) => {
          if (!editTarget) return;
          // Only send keys that changed (don't overwrite the encrypted creds
          // with empty strings).
          const patch: Partial<ConnectionFormData> = {
            name: data.name,
            endpoint: data.endpoint,
            region: data.region,
            forcePathStyle: data.forcePathStyle,
          };
          if (data.accessKeyId) patch.accessKeyId = data.accessKeyId;
          if (data.secretAccessKey) patch.secretAccessKey = data.secretAccessKey;
          await updateMut.mutateAsync({ id: editTarget.id, data: patch });
          setEditTarget(null);
        }}
      />

      <Dialog open={deleteTarget !== null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete connection?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.name} will be removed from this BFF. Objects in the underlying S3
              endpoint are untouched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={async () => {
                if (!deleteTarget) return;
                await deleteMut.mutateAsync(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              {deleteMut.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ConnectionFormDialogProps {
  title: string;
  open: boolean;
  initial: ConnectionFormData;
  /** When true, secret fields are required. When false (edit mode), blank = unchanged. */
  showSecret: boolean;
  busy: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (data: ConnectionFormData) => Promise<void>;
}

function ConnectionFormDialog(props: ConnectionFormDialogProps) {
  // Unmount when closed so internal form state resets via remount.
  if (!props.open) return null;
  return <ConnectionFormDialogBody {...props} />;
}

function ConnectionFormDialogBody({
  title,
  open,
  initial,
  showSecret,
  busy,
  error,
  onClose,
  onSubmit,
}: ConnectionFormDialogProps) {
  const [form, setForm] = useState(initial);

  const canSubmit =
    form.name.trim() &&
    form.endpoint.trim() &&
    (showSecret ? form.accessKeyId && form.secretAccessKey : true);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Endpoint</Label>
            <Input
              value={form.endpoint}
              placeholder="https://s3.example.com"
              onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Region</Label>
              <Input
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
              />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <input
                id="forcePathStyle"
                type="checkbox"
                checked={form.forcePathStyle}
                onChange={(e) => setForm({ ...form, forcePathStyle: e.target.checked })}
              />
              <label htmlFor="forcePathStyle" className="text-sm">
                Path-style addressing
              </label>
            </div>
          </div>
          <div className="space-y-1">
            <Label>
              Access Key ID{' '}
              {!showSecret && (
                <span className="text-xs text-muted-foreground">(blank = unchanged)</span>
              )}
            </Label>
            <Input
              value={form.accessKeyId}
              onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>
              Secret Access Key{' '}
              {!showSecret && (
                <span className="text-xs text-muted-foreground">(blank = unchanged)</span>
              )}
            </Label>
            <Input
              type="password"
              value={form.secretAccessKey}
              onChange={(e) => setForm({ ...form, secretAccessKey: e.target.value })}
            />
          </div>
          {error && <div className="text-sm text-destructive">{error.message}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(form)} disabled={!canSubmit || busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
