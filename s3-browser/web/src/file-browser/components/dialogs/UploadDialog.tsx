import { useState, useRef, type ChangeEvent } from 'react';
import { FileIcon } from '@primer/octicons-react';
import { X, Zap } from 'lucide-react';
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
import { UploadActionIcon } from '@/lib/action-icons';
import { useBrowser } from '../../context';
import { LARGE_FILE_THRESHOLD_BYTES } from '@/lib/multipart-upload';

export function UploadDialog() {
  const { dialogs, closeUpload, currentPrefix } = useBrowser();
  const { uploadOpen, uploadFiles } = dialogs;
  if (!uploadOpen) return null;
  return (
    <UploadDialogBody
      open
      initialFiles={uploadFiles}
      prefix={currentPrefix}
      onClose={closeUpload}
    />
  );
}

/**
 * A file PICKER. Selecting "Upload" hands the files to the background upload
 * manager and closes — progress, per-file retry/cancel and partial-failure
 * reporting all happen in the non-blocking UploadPanel, so the dialog never
 * blocks and the upload survives navigating away.
 */
function UploadDialogBody({
  open,
  initialFiles,
  prefix,
  onClose,
}: {
  open: boolean;
  initialFiles: File[];
  prefix: string;
  onClose: () => void;
}) {
  const { uploadManager } = useBrowser();
  const [picked, setPicked] = useState<File[]>(initialFiles);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const totalBytes = picked.reduce((s, f) => s + f.size, 0);
  const largeCount = picked.filter((f) => f.size >= LARGE_FILE_THRESHOLD_BYTES).length;

  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    if (!arr.length) return;
    setPicked((prev) => {
      const sig = (f: File) => `${f.name}::${f.size}::${f.lastModified}`;
      const seen = new Set(prev.map(sig));
      return [...prev, ...arr.filter((f) => !seen.has(sig(f)))];
    });
  };

  const handleUpload = () => {
    if (!picked.length) return;
    uploadManager.enqueue(picked, prefix);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Upload files</DialogTitle>
          <DialogDescription>
            Uploading to{' '}
            <code className="text-xs bg-muted rounded px-1">{prefix || '/ (bucket root)'}</code>
          </DialogDescription>
        </DialogHeader>

        {/* min-w-0: DialogContent is a grid, whose items default to min-width:auto
            and would otherwise refuse to shrink below a long filename's intrinsic
            width — breaking the truncate below and widening the whole dialog. */}
        <div className="min-w-0 space-y-3 py-2">
          {/* Drop zone */}
          <div
            className={`relative flex flex-col items-center justify-center gap-2 p-7 border-[1.5px] border-dashed rounded-xl text-center cursor-pointer transition-colors ${dragOver ? 'border-primary bg-primary/8 text-primary' : 'border-border bg-muted/35 text-muted-foreground hover:border-primary/60 hover:bg-primary/4'}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            <UploadActionIcon size={28} />
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
              className="sr-only"
            />
          </div>

          {/* File list */}
          {picked.length > 0 && (
            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/70 bg-muted/40 text-xs text-muted-foreground">
                <span>
                  <strong className="text-foreground">{picked.length}</strong> file
                  {picked.length !== 1 ? 's' : ''} · {formatBytes(totalBytes)}
                </span>
                <button
                  className="text-primary hover:underline text-xs font-medium"
                  onClick={() => setPicked([])}
                >
                  Clear all
                </button>
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
                      <span className="min-w-0 flex-1 truncate text-foreground">{f.name}</span>
                      {isLarge && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-primary shrink-0"
                          title="Uploads directly to S3 in parts"
                        >
                          <Zap size={10} />
                          direct
                        </span>
                      )}
                      <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                        {formatBytes(f.size)}
                      </span>
                      <button
                        className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setPicked((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <X size={12} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {largeCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {largeCount} file{largeCount !== 1 ? 's' : ''} will upload directly to S3 in parts.
              Progress shows in the panel — you can keep browsing while it runs.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={!picked.length}>
            {picked.length > 0
              ? `Upload ${picked.length} file${picked.length !== 1 ? 's' : ''}`
              : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
