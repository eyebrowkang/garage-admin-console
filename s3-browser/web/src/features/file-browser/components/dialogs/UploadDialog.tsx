import { useState, useRef, type ChangeEvent } from 'react';
import { UploadIcon, FileIcon, XIcon } from '@primer/octicons-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@garage/ui';
import { formatBytes } from '@/lib/format';
import { useBrowser } from '../../context';
import type { UploadResult } from '@/lib/types';

export function UploadDialog() {
  const { dialogs, closeUpload, currentPrefix, refresh } = useBrowser();
  const { uploadOpen, uploadFiles } = dialogs;
  if (!uploadOpen) return null;
  return (
    <UploadDialogBody
      open={uploadOpen}
      initialFiles={uploadFiles}
      prefix={currentPrefix}
      onClose={closeUpload}
      onComplete={() => { closeUpload(); refresh(currentPrefix); }}
    />
  );
}

function UploadDialogBody({
  open,
  initialFiles,
  prefix,
  onClose,
  onComplete,
}: {
  open: boolean;
  initialFiles: File[];
  prefix: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  const { http } = useBrowser();
  const [picked, setPicked] = useState<File[]>(initialFiles);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    if (!arr.length) return;
    setPicked((prev) => {
      const sig = (f: File) => `${f.name}::${f.size}::${f.lastModified}`;
      const seen = new Set(prev.map(sig));
      return [...prev, ...arr.filter((f) => !seen.has(sig(f)))];
    });
  };

  const handleUpload = async () => {
    if (!picked.length) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      if (prefix) form.append('prefix', prefix.replace(/\/$/, ''));
      for (const f of picked) form.append('file', f, f.name);
      await http.post<UploadResult>('/upload', form, {
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      onComplete();
    } catch (err) {
      setError((err as Error).message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !uploading && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Upload files</DialogTitle>
          <DialogDescription>
            Uploading to{' '}
            <code className="text-xs bg-muted rounded px-1">{prefix || '/ (bucket root)'}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Drop zone */}
          <div
            className={`relative flex flex-col items-center justify-center gap-2 p-7 border-[1.5px] border-dashed rounded-xl text-center cursor-pointer transition-colors ${dragOver ? 'border-primary bg-primary/8 text-primary' : 'border-border bg-muted/35 text-muted-foreground hover:border-primary/60 hover:bg-primary/4'}`}
            onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragOver(true); }}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!uploading && e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
            }}
            onClick={() => !uploading && inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !uploading) {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            <UploadIcon size={28} />
            <p className="text-sm font-semibold text-foreground">Drop files here or click to browse</p>
            <p className="text-xs">Multiple files supported · any size</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                if (e.target.files) addFiles(e.target.files);
                if (inputRef.current) inputRef.current.value = '';
              }}
              disabled={uploading}
              className="sr-only"
            />
          </div>

          {/* File list */}
          {picked.length > 0 && (
            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/70 bg-muted/40 text-xs text-muted-foreground">
                <span>
                  <strong className="text-foreground">{picked.length}</strong> file{picked.length !== 1 ? 's' : ''}{' '}
                  · {formatBytes(picked.reduce((s, f) => s + f.size, 0))}
                </span>
                {!uploading && (
                  <button className="text-primary hover:underline text-xs font-medium" onClick={() => setPicked([])}>
                    Clear all
                  </button>
                )}
              </div>
              <ul className="max-h-48 overflow-y-auto divide-y divide-border/40">
                {picked.map((f, i) => (
                  <li key={`${f.name}::${i}`} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                    <FileIcon size={14} className="text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate text-foreground">{f.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground shrink-0">{formatBytes(f.size)}</span>
                    {!uploading && (
                      <button
                        className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setPicked((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <XIcon size={12} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Progress */}
          {uploading && (
            <div className="space-y-1.5">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-center text-muted-foreground">{progress}%</p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button onClick={handleUpload} disabled={!picked.length || uploading}>
            {uploading ? 'Uploading…' : `Upload ${picked.length > 0 ? picked.length + ' file' + (picked.length !== 1 ? 's' : '') : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
