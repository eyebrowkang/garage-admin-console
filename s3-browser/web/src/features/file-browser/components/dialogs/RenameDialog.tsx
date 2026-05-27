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
import { useBrowser } from '../../context';
import type { ListItem } from '../../types';

export function RenameDialog() {
  const { dialogs, closeRename } = useBrowser();
  const { renameItem } = dialogs;
  if (!renameItem) return null;
  return (
    <RenameDialogBody
      open={!!renameItem}
      item={renameItem}
      onClose={closeRename}
    />
  );
}

function RenameDialogBody({
  open,
  item,
  onClose,
}: {
  open: boolean;
  item: ListItem;
  onClose: () => void;
}) {
  const { http, currentPrefix, refresh, closeRename, showToast } = useBrowser();
  const [value, setValue] = useState(item.name);
  const [busy, setBusy] = useState(false);

  const isFile = item.type === 'file';
  const trimmed = value.trim();
  const canSubmit = isFile && trimmed.length > 0 && trimmed !== item.name && !trimmed.includes('/');

  const submit = async () => {
    if (!canSubmit || item.type !== 'file') return;
    setBusy(true);
    try {
      const dstKey = `${currentPrefix}${trimmed}`;
      await http.post('/copy', { src: item.key, dst: dstKey });
      await http.delete('/objects', { data: { keys: [item.key] } });
      closeRename();
      refresh(currentPrefix);
    } catch (err) {
      showToast('err', (err as Error).message || 'Rename failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Rename file</DialogTitle>
          <DialogDescription>
            {isFile ? (
              <>Renaming <code className="text-xs bg-muted rounded px-1">{item.name}</code> via copy + delete.</>
            ) : (
              'Folder rename is not supported.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="rename-value">New name</Label>
            <Input
              id="rename-value"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) submit(); }}
              disabled={busy || !isFile}
            />
            {trimmed.includes('/') && (
              <p className="text-xs text-destructive">Name cannot contain a slash.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || busy}>
            {busy ? 'Renaming…' : 'Rename'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
