import { Check, Copy } from 'lucide-react';

import { useCopyToClipboard } from '../hooks/use-copy-to-clipboard';
import { cn } from '../lib/cn';
import { Button } from './button';

interface CopyButtonProps {
  value?: string | null;
  label?: string;
  className?: string;
  compact?: boolean;
}

export function CopyButton({
  value,
  label = 'Value',
  className,
  compact = false,
}: CopyButtonProps) {
  const { copied, copy } = useCopyToClipboard();
  const buttonLabel = copied ? `${label} copied` : `Copy ${label}`;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        compact
          ? 'h-6 w-6 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground'
          : 'h-8 w-8 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground',
        className,
      )}
      onClick={(e) => {
        e.stopPropagation();
        void copy(value);
      }}
      disabled={!value}
      aria-label={buttonLabel}
      title={buttonLabel}
    >
      {copied ? (
        <Check className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      ) : (
        <Copy className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      )}
    </Button>
  );
}
