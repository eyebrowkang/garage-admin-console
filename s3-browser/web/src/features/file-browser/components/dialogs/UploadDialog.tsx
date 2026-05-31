import { useState, useRef, type ChangeEvent } from 'react';
import { UploadIcon, FileIcon, XIcon, ZapIcon } from '@primer/octicons-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@garage/ui';
import { formatBytes } from '@garage/web-shared';
import { useBrowser } from '../../context';
import { LARGE_FILE_THRESHOLD_BYTES, runUploadJob } from '@/lib/multipart-upload';

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
      onComplete={() => {
        closeUpload();
        refresh(currentPrefix);
      }}
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
  const [progress, setProgress] = useState<{ loaded: number; total: number }>({
    loaded: 0,
    total: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const totalBytes = picked.reduce((s, f) => s + f.size, 0);
  const largeCount = picked.filter((f) => f.size >= LARGE_FILE_THRESHOLD_BYTES).length;
  const pct = progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0;

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
    setProgress({ loaded: 0, total: totalBytes });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await runUploadJob({
        http,
        files: picked,
        prefix,
        signal: controller.signal,
        onProgress: setProgress,
      });
      onComplete();
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {
        setError('Upload cancelled');
      } else {
        setError((err as Error).message || 'Upload failed');
      }
    } finally {
      abortRef.current = null;
      setUploading(false);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
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
            onDragOver={(e) => {
              e.preventDefault();
              if (!uploading) setDragOver(true);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setDragOver(false);
            }}
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
            <p className="text-sm font-semibold text-foreground">
              Drop files here or click to browse
            </p>
            <p className="text-xs">
              Files ≥ {formatBytes(LARGE_FILE_THRESHOLD_BYTES)} upload directly to S3 via multipart
            </p>
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
                  <strong className="text-foreground">{picked.length}</strong> file
                  {picked.length !== 1 ? 's' : ''} ·{' '}
                  {formatBytes(picked.reduce((s, f) => s + f.size, 0))}
                </span>
                {!uploading && (
                  <button
                    className="text-primary hover:underline text-xs font-medium"
                    onClick={() => setPicked([])}
                  >
                    Clear all
                  </button>
                )}
              </div>
              <ul className="max-h-48 overflow-y-auto divide-y divide-border/40">
                {picked.map((f, i) => {
                  const isLarge = f.size >= LARGE_FILE_THRESHOLD_BYTES;
                  return (
                    <li
                      key={`${f.name}::${i}`}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm"
                    >
                      <FileIcon size={14} className="text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate text-foreground">{f.name}</span>
                      {isLarge && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-primary shrink-0"
                          title="Uploads directly to S3 in parts"
                        >
                          <ZapIcon size={10} />
                          direct
                        </span>
                      )}
                      <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                        {formatBytes(f.size)}
                      </span>
                      {!uploading && (
                        <button
                          className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setPicked((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <XIcon size={12} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Progress */}
          {uploading && (
            <div className="space-y-1.5">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-100"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-center text-muted-foreground">
                {pct}% · {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
                {largeCount > 0 && (
                  <>
                    {' '}
                    · {largeCount} file{largeCount !== 1 ? 's' : ''} direct-to-S3
                  </>
                )}
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          {uploading ? (
            <Button variant="outline" onClick={handleCancel}>
              Cancel upload
            </Button>
          ) : (
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button onClick={handleUpload} disabled={!picked.length || uploading}>
            {uploading
              ? 'Uploading…'
              : `Upload ${picked.length > 0 ? picked.length + ' file' + (picked.length !== 1 ? 's' : '') : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
