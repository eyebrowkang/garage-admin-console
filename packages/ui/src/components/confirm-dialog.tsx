import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Input } from './input';
import { Label } from './label';

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

  const isTypeToConfirmValid =
    tier !== 'type-to-confirm' || typedValue.trim() === typeToConfirmValue;
  const isDanger = tier === 'danger' || tier === 'type-to-confirm';

  const submitIfValid = () => {
    if (!isLoading && isTypeToConfirmValid) handleConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-hidden sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2 break-words [overflow-wrap:anywhere]">
            {isDanger && <AlertTriangle className="h-5 w-5 text-destructive" />}
            {title}
          </DialogTitle>
          <DialogDescription className="break-words [overflow-wrap:anywhere]">
            {description}
          </DialogDescription>
        </DialogHeader>

        {tier === 'type-to-confirm' && typeToConfirmValue && (
          <div className="space-y-2 py-4">
            <Label htmlFor="confirm-phrase">
              Type{' '}
              <code className="select-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-foreground">
                {typeToConfirmValue}
              </code>{' '}
              to confirm
            </Label>
            <Input
              id="confirm-phrase"
              autoFocus
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitIfValid();
                }
              }}
              placeholder={typeToConfirmValue}
              autoComplete="off"
              aria-invalid={typedValue.length > 0 && !isTypeToConfirmValid}
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
