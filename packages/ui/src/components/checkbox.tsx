import { Check } from 'lucide-react';
import { cn } from '../lib/cn';

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

export function Checkbox({
  checked,
  onCheckedChange,
  disabled = false,
  className,
  id,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: CheckboxProps) {
  return (
    <button
      type="button"
      id={id}
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      disabled={disabled}
      className={cn(
        'inline-flex h-4 w-4 items-center justify-center rounded border border-input bg-background transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked && 'border-primary bg-primary text-primary-foreground',
        className,
      )}
      onClick={() => onCheckedChange(!checked)}
    >
      {checked && <Check className="h-3 w-3" />}
    </button>
  );
}
