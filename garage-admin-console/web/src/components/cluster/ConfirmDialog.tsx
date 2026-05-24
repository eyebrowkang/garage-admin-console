import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';

export type ConfirmTier = 'simple' | 'danger' | 'type-to-confirm';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  tier?: ConfirmTier;
  confirmText?: string;
  cancelText?: string;
  typeToConfirmValue?: string;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  tier = 'simple',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  typeToConfirmValue,
  onConfirm,
  isLoading = false,
}: ConfirmDialogProps) {
  const [typedValue, setTypedValue] = useState('');

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setTypedValue('');
    }
    onOpenChange(newOpen);
  };

  const handleConfirm = () => {
    onConfirm();
    setTypedValue('');
  };

  const isTypeToConfirmValid = tier !== 'type-to-confirm' || typedValue === typeToConfirmValue;

  const isDanger = tier === 'danger' || tier === 'type-to-confirm';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-[425px] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 break-words [overflow-wrap:anywhere]">
            {isDanger && <AlertTriangle className="h-5 w-5 text-destructive" />}
            {title}
          </DialogTitle>
          <DialogDescription className="break-words [overflow-wrap:anywhere]">
            {description}
          </DialogDescription>
        </DialogHeader>

        {tier === 'type-to-confirm' && typeToConfirmValue && (
          <div className="space-y-2 py-4">
            <Label>
              Type <span className="font-bold">{typeToConfirmValue}</span> to confirm
            </Label>
            <Input
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              placeholder={typeToConfirmValue}
              autoComplete="off"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button
            variant={isDanger ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={isLoading || !isTypeToConfirmValid}
          >
            {isLoading ? 'Processing...' : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
