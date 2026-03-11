import { useState, useRef, useCallback } from 'react';
import { Upload, X, File, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface EmbedUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiBase: string;
  token?: string;
  connectionId: string;
  bucket: string;
  prefix: string;
  onUploadComplete: () => void;
}

interface FileUploadState {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function uploadFile(
  apiBase: string,
  token: string | undefined,
  connectionId: string,
  bucket: string,
  key: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiBase}/s3/${connectionId}/objects/upload`);

    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          reject(new Error(body.error || `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    const formData = new FormData();
    formData.append('bucket', bucket);
    formData.append('key', key);
    formData.append('file', file);
    xhr.send(formData);
  });
}

export function EmbedUploadDialog({
  open,
  onOpenChange,
  apiBase,
  token,
  connectionId,
  bucket,
  prefix,
  onUploadComplete,
}: EmbedUploadDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileUploadState[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    setFiles((prev) => [
      ...prev,
      ...fileArray.map((f) => ({ file: f, status: 'pending' as const, progress: 0 })),
    ]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const uploadAll = useCallback(async () => {
    setIsUploading(true);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      if (item.status === 'done') continue;

      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: 'uploading', progress: 0 } : f)),
      );

      try {
        await uploadFile(
          apiBase,
          token,
          connectionId,
          bucket,
          prefix + item.file.name,
          item.file,
          (progress) => {
            setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, progress } : f)));
          },
        );

        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: 'done', progress: 100 } : f)),
        );
        successCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: 'error', error: message } : f)),
        );
        errorCount++;
      }
    }

    setIsUploading(false);

    if (successCount > 0) {
      onUploadComplete();
      toast({
        title: 'Upload complete',
        description: `${successCount} file${successCount > 1 ? 's' : ''} uploaded${errorCount > 0 ? `, ${errorCount} failed` : ''}.`,
      });
    }

    if (errorCount === 0) {
      setTimeout(() => {
        setFiles([]);
        onOpenChange(false);
      }, 500);
    }
  }, [files, apiBase, token, bucket, prefix, connectionId, toast, onOpenChange, onUploadComplete]);

  const handleClose = (nextOpen: boolean) => {
    if (!isUploading) {
      setFiles([]);
      onOpenChange(nextOpen);
    }
  };

  const pendingCount = files.filter((f) => f.status === 'pending' || f.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Files</DialogTitle>
          <DialogDescription>
            Upload files to <span className="font-mono text-xs">{prefix || '/'}</span> in{' '}
            <span className="font-medium">{bucket}</span>
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            'flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50',
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drop files here or <span className="font-medium text-primary">browse</span>
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              addFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />

        {files.length > 0 && (
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {files.map((item, i) => (
              <div key={`${item.file.name}-${i}`} className="space-y-1 px-2 py-1.5">
                <div className="flex items-center gap-2 text-sm">
                  {item.status === 'uploading' ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  ) : item.status === 'done' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                  ) : item.status === 'error' ? (
                    <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                  ) : (
                    <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {item.status === 'uploading'
                      ? `${item.progress}%`
                      : formatBytes(item.file.size)}
                  </span>
                  {(item.status === 'pending' || item.status === 'error') && !isUploading && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => removeFile(i)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {item.status === 'uploading' && (
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isUploading}>
            Cancel
          </Button>
          <Button onClick={uploadAll} disabled={pendingCount === 0 || isUploading}>
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload {pendingCount > 0 ? `(${pendingCount})` : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
