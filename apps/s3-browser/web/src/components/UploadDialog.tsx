import { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, X, File, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/errors';
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

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId: string;
  bucket: string;
  prefix: string;
}

interface FileUploadState {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function UploadDialog({
  open,
  onOpenChange,
  connectionId,
  bucket,
  prefix,
}: UploadDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileUploadState[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    setFiles((prev) => [
      ...prev,
      ...fileArray.map((f) => ({ file: f, status: 'pending' as const })),
    ]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const uploadAll = useCallback(async () => {
    setIsUploading(true);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      if (item.status === 'done') continue;

      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: 'uploading' } : f)),
      );

      try {
        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('bucket', bucket);
        formData.append('key', prefix + item.file.name);

        await api.post(`/s3/${connectionId}/objects/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: 'done' } : f)),
        );
        successCount++;
      } catch (err) {
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: 'error', error: getApiErrorMessage(err) } : f,
          ),
        );
        errorCount++;
      }
    }

    setIsUploading(false);

    if (successCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['objects', connectionId, bucket, prefix] });
      toast({
        title: 'Upload complete',
        description: `${successCount} file${successCount > 1 ? 's' : ''} uploaded${errorCount > 0 ? `, ${errorCount} failed` : ''}.`,
      });
    }

    if (errorCount === 0) {
      // All succeeded, close dialog after brief delay
      setTimeout(() => {
        setFiles([]);
        onOpenChange(false);
      }, 500);
    }
  }, [files, bucket, prefix, connectionId, queryClient, toast, onOpenChange]);

  const handleClose = (open: boolean) => {
    if (!isUploading) {
      setFiles([]);
      onOpenChange(open);
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

        {/* Drop zone */}
        <div
          className={cn(
            'flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50',
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drop files here or <span className="font-medium text-primary">browse</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Max 500 MB per file</p>
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

        {/* File list */}
        {files.length > 0 && (
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {files.map((item, i) => (
              <div
                key={`${item.file.name}-${i}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
              >
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
                  {formatBytes(item.file.size)}
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
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            onClick={uploadAll}
            disabled={pendingCount === 0 || isUploading}
          >
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
