import { useState } from 'react';
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
import { basename } from '@/lib/format';
import { useBrowser } from '../../context';
import type { AxiosInstance } from 'axios';
import type { ListResult } from '@/lib/types';

export function DeleteDialog() {
  const { dialogs, closeDelete, refresh, clearSelection } = useBrowser();
  const { deleteItems } = dialogs;
  if (!deleteItems.length) return null;
  return (
    <DeleteDialogBody
      open={!!deleteItems.length}
      items={deleteItems}
      onClose={() => closeDelete()}
      onComplete={() => {
        closeDelete();
        clearSelection();
        refresh();
      }}
    />
  );
}

async function listKeysUnderPrefix(http: AxiosInstance, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const res = await http.get<ListResult>('/list', {
      params: {
        prefix,
        delimiter: '',
        maxKeys: 1000,
        ...(continuationToken ? { continuationToken } : {}),
      },
    });
    keys.push(...res.data.objects.map((object) => object.key).filter(Boolean));
    continuationToken = res.data.nextContinuationToken;
  } while (continuationToken);
  return keys;
}

async function collectDeleteKeys(
  http: AxiosInstance,
  items: ReturnType<typeof useBrowser>['dialogs']['deleteItems'],
) {
  const keys = new Set<string>();
  for (const item of items) {
    if (item.type === 'file') {
      keys.add(item.key);
    } else {
      for (const key of await listKeysUnderPrefix(http, item.prefix)) keys.add(key);
    }
  }
  return Array.from(keys);
}

function DeleteDialogBody({
  open,
  items,
  onClose,
  onComplete,
}: {
  open: boolean;
  items: ReturnType<typeof useBrowser>['dialogs']['deleteItems'];
  onClose: () => void;
  onComplete: () => void;
}) {
  const { http } = useBrowser();
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'collecting' | 'deleting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const folderCount = items.filter((item) => item.type === 'folder').length;
  const directFileCount = items.filter((item) => item.type === 'file').length;
  const canConfirm = confirmText === 'DELETE';

  const confirm = async () => {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      setPhase('collecting');
      const keys = await collectDeleteKeys(http, items);
      if (!keys.length) {
        onComplete();
        return;
      }
      setPhase('deleting');
      for (let i = 0; i < keys.length; i += 1000) {
        await http.delete('/objects', { data: { keys: keys.slice(i, i + 1000) } });
      }
      onComplete();
    } catch (err) {
      setError((err as Error).message || 'Delete failed');
    } finally {
      setBusy(false);
      setPhase('idle');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Delete {items.length} item{items.length !== 1 ? 's' : ''}?
          </DialogTitle>
          <DialogDescription>
            This cannot be undone. Folder deletion recursively deletes every object under that
            prefix and may affect many objects.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-52 overflow-y-auto text-sm text-muted-foreground space-y-1 py-2">
          {items.slice(0, 20).map((item) => (
            <li
              key={item.type === 'folder' ? item.prefix : item.key}
              className="font-mono text-xs truncate"
            >
              {item.type === 'folder' ? `${basename(item.prefix)}/` : basename(item.key)}
            </li>
          ))}
          {items.length > 20 && <li className="text-xs">… and {items.length - 20} more</li>}
        </ul>
        <p className="text-xs text-muted-foreground">
          {directFileCount} direct file{directFileCount === 1 ? '' : 's'}
          {folderCount > 0 && ` · ${folderCount} recursive folder${folderCount === 1 ? '' : 's'}`}
        </p>
        <div className="space-y-2">
          <Label htmlFor="delete-confirm" className="text-xs text-muted-foreground">
            Type <span className="font-semibold text-foreground">DELETE</span> to confirm.
          </Label>
          <Input
            id="delete-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canConfirm && !busy) void confirm();
            }}
            placeholder="DELETE"
            disabled={busy}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={confirm}
            disabled={busy || !items.length || !canConfirm}
          >
            {phase === 'collecting' ? 'Collecting…' : phase === 'deleting' ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
