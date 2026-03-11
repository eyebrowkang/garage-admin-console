import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, FolderPlus } from 'lucide-react';
import type { AxiosInstance } from 'axios';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface EmbedCreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  api: AxiosInstance;
  connectionId: string;
  bucket: string;
  prefix: string;
  onCreated: () => void;
}

export function EmbedCreateFolderDialog({
  open,
  onOpenChange,
  api,
  connectionId,
  bucket,
  prefix,
  onCreated,
}: EmbedCreateFolderDialogProps) {
  const { toast } = useToast();
  const [folderName, setFolderName] = useState('');

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const folderPrefix = prefix + name;
      await api.post(`/s3/${connectionId}/objects/folder`, { bucket, prefix: folderPrefix });
    },
    onSuccess: () => {
      onCreated();
      setFolderName('');
      onOpenChange(false);
      toast({ title: 'Folder created' });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Failed to create folder';
      toast({ variant: 'destructive', title: 'Failed to create folder', description: message });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = folderName.trim();
    if (trimmed) createMutation.mutate(trimmed);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setFolderName('');
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Folder</DialogTitle>
          <DialogDescription>
            Create a new folder in <span className="font-mono text-xs">{prefix || '/'}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="embed-folder-name">Folder Name</Label>
            <Input
              id="embed-folder-name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="my-folder"
              className="h-10"
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!folderName.trim() || createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FolderPlus className="mr-2 h-4 w-4" />
                  Create
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
