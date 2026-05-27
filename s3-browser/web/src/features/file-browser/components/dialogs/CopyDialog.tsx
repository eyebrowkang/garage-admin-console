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

export function CopyDialog() {
  const { dialogs, closeCopy } = useBrowser();
  const { copyItem } = dialogs;
  if (!copyItem || copyItem.type !== 'file') return null;
  return <CopyDialogBody open item={copyItem} onClose={closeCopy} />;
}

function CopyDialogBody({
  open,
  item,
  onClose,
}: {
  open: boolean;
  item: Extract<ReturnType<typeof useBrowser>['dialogs']['copyItem'], { type: 'file' }>;
  onClose: () => void;
}) {
  const { http, currentPrefix, refresh, closeCopy, showToast } = useBrowser();
  const [dest, setDest] = useState(currentPrefix + item.name);
  const [busy, setBusy] = useState(false);

  const trimmed = dest.trim();
  const canSubmit = trimmed.length > 0 && trimmed !== item.key;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await http.post('/copy', { src: item.key, dst: trimmed });
      closeCopy();
      refresh(currentPrefix);
      showToast('ok', 'File copied');
    } catch (err) {
      showToast('err', (err as Error).message || 'Copy failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Copy file</DialogTitle>
          <DialogDescription>
            Copying <code className="text-xs bg-muted rounded px-1">{item.name}</code> — enter the destination key.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="copy-dest">Destination key</Label>
            <Input
              id="copy-dest"
              autoFocus
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) submit(); }}
              placeholder="folder/copy-of-file.txt"
              disabled={busy}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || busy}>
            {busy ? 'Copying…' : 'Copy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
