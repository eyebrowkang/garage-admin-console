import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DeleteObjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading: boolean;
  objectKey: string;
  isFolder: boolean;
}

export function DeleteObjectDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
  objectKey,
  isFolder,
}: DeleteObjectDialogProps) {
  const displayName = objectKey.split('/').filter(Boolean).pop() || objectKey;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {isFolder ? 'Folder' : 'Object'}</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{' '}
            <strong className="font-mono text-xs">{displayName}</strong>?
            {isFolder
              ? ' This only deletes the folder marker. Objects inside the folder will not be affected.'
              : ' This action cannot be undone.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
