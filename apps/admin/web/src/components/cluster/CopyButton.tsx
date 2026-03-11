import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CopyActionIcon } from '@/lib/action-icons';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Clipboard permission was denied.',
        variant: 'destructive',
      });
    }
  };

  const buttonLabel = copied ? `${label} copied` : `Copy ${label}`;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        compact
          ? 'h-6 w-6 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted'
          : 'h-8 w-8 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted',
        className,
      )}
      onClick={(e) => {
        e.stopPropagation();
        void handleCopy();
      }}
      disabled={!value}
      aria-label={buttonLabel}
      title={buttonLabel}
    >
      {copied ? (
        <Check className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      ) : (
        <CopyActionIcon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      )}
    </Button>
  );
}
