import { useState, useCallback } from 'react';
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
import type { PresignResult } from '@/lib/types';

export function PresignDialog() {
  const { dialogs, closePresign } = useBrowser();
  const { presignItem } = dialogs;
  if (!presignItem) return null;
  return <PresignDialogBody open item={presignItem} onClose={closePresign} />;
}

function PresignDialogBody({
  open,
  item,
  onClose,
}: {
  open: boolean;
  item: NonNullable<ReturnType<typeof useBrowser>['dialogs']['presignItem']>;
  onClose: () => void;
}) {
  const { http } = useBrowser();
  const [expiresIn, setExpiresIn] = useState(900);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await http.post<PresignResult>('/presign', {
        key: item.key,
        operation: 'getObject',
        expiresIn,
      });
      setUrl(res.data.url);
    } catch (err) {
      setError((err as Error).message || 'Failed to generate URL');
    } finally {
      setLoading(false);
    }
  }, [http, item.key, expiresIn]);

  const copy = () => {
    if (!url) return;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share link</DialogTitle>
          <DialogDescription>
            Pre-signed download URL for{' '}
            <code className="text-xs bg-muted rounded px-1">{item.key}</code>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground shrink-0">Expires in (seconds)</Label>
            <Input
              type="number"
              value={expiresIn}
              onChange={(e) => setExpiresIn(parseInt(e.target.value, 10) || 0)}
              className="w-28"
              min={60}
              max={86400}
            />
            <Button variant="outline" onClick={generate} disabled={loading}>
              {loading ? 'Generating…' : url ? 'Regenerate' : 'Generate'}
            </Button>
          </div>
          {url && (
            <div className="flex items-center gap-2">
              <Input value={url} readOnly onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</Button>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
