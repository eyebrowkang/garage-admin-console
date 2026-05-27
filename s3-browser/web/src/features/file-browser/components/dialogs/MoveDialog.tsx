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

export function MoveDialog() {
  const { dialogs, closeMove } = useBrowser();
  const { moveItem } = dialogs;
  if (!moveItem || moveItem.type !== 'file') return null;
  return <MoveDialogBody open item={moveItem} onClose={closeMove} />;
}

function MoveDialogBody({
  open,
  item,
  onClose,
}: {
  open: boolean;
  item: Extract<ReturnType<typeof useBrowser>['dialogs']['moveItem'], { type: 'file' }>;
  onClose: () => void;
}) {
  const { http, currentPrefix, refresh, closeMove, showToast } = useBrowser();
  const [dest, setDest] = useState(currentPrefix + item.name);
  const [busy, setBusy] = useState(false);

  const trimmed = dest.trim();
  const canSubmit = trimmed.length > 0 && trimmed !== item.key;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await http.post('/copy', { src: item.key, dst: trimmed });
      await http.delete('/objects', { data: { keys: [item.key] } });
      closeMove();
      refresh();
    } catch (err) {
      showToast('err', (err as Error).message || 'Move failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Move file</DialogTitle>
          <DialogDescription>
            Moving <code className="text-xs bg-muted rounded px-1">{item.name}</code> — enter the destination key.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="move-dest">Destination key</Label>
            <Input
              id="move-dest"
              autoFocus
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) submit(); }}
              placeholder="folder/new-name.txt"
              disabled={busy}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || busy}>
            {busy ? 'Moving…' : 'Move'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
