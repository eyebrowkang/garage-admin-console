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

export function NewFolderDialog() {
  const { dialogs, closeNewFolder, currentPrefix, refresh } = useBrowser();
  if (!dialogs.newFolderOpen) return null;
  return (
    <NewFolderDialogBody
      open={dialogs.newFolderOpen}
      prefix={currentPrefix}
      onClose={closeNewFolder}
      onComplete={() => { closeNewFolder(); refresh(currentPrefix); }}
    />
  );
}

function NewFolderDialogBody({
  open,
  prefix,
  onClose,
  onComplete,
}: {
  open: boolean;
  prefix: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  const { http } = useBrowser();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const hasSlash = trimmed.includes('/');
  const canSubmit = trimmed.length > 0 && !hasSlash;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const newPrefix = `${prefix.replace(/\/$/, '')}${prefix ? '/' : ''}${trimmed}`;
      const form = new FormData();
      form.append('prefix', newPrefix);
      form.append('file', new Blob([], { type: 'application/octet-stream' }), '.keep');
      await http.post('/upload', form);
      onComplete();
    } catch (err) {
      setError((err as Error).message || 'Failed to create folder');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
          <DialogDescription>
            Create a folder inside{' '}
            <code className="text-xs bg-muted rounded px-1">{prefix || '/ (bucket root)'}</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="new-folder-name">Folder name</Label>
            <Input
              id="new-folder-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) submit(); }}
              placeholder="my-folder"
              disabled={busy}
            />
            {hasSlash && <p className="text-xs text-destructive">Name cannot contain a slash.</p>}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || busy}>
            {busy ? 'Creating…' : 'Create folder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
