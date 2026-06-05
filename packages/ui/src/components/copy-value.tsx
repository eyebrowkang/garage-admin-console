import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';

import { toast } from '../hooks/use-toast';
import { cn } from '../lib/cn';

interface CopyValueProps {
  /** The text written to the clipboard. */
  value?: string | null;
  /** Context for the aria-label / failure toast, e.g. "Bucket ID". */
  label?: string;
  /** Displayed content; defaults to `value`. */
  children?: ReactNode;
  className?: string;
  /** `text` = inline id-style; `chip` = bordered pill (aliases, tags). */
  variant?: 'text' | 'chip';
}

/**
 * Makes a whole value region click-to-copy, removing the "is this little icon
 * the only thing I can click?" ambiguity. The entire block is the button:
 * desktop hovers highlight it and darken the icon; a click swaps the icon to a
 * check and fires a light "Copied" toast. On touch (no hover) the icon stays
 * visible and the hit target grows to the ~44px minimum.
 */
export function CopyValue({
  value,
  label = 'Value',
  children,
  className,
  variant = 'text',
}: CopyValueProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async (e: MouseEvent) => {
    // Don't let a copy bubble up into row navigation.
    e.stopPropagation();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: 'Copied', variant: 'success' });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Clipboard permission was denied.',
        variant: 'destructive',
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!value}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? 'Copied' : `Copy ${label}`}
      className={cn(
        'group/copy inline-flex max-w-full items-center gap-1.5 rounded-md text-left align-middle transition-colors',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-60 pointer-coarse:min-h-11',
        variant === 'chip'
          ? 'border border-border/70 bg-muted/20 px-2 py-0.5'
          : '-mx-1 px-1 py-0.5',
        className,
      )}
    >
      <span className="truncate">{children ?? value}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-success pointer-coarse:h-4 pointer-coarse:w-4" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover/copy:text-foreground pointer-coarse:h-4 pointer-coarse:w-4 pointer-coarse:text-muted-foreground" />
      )}
    </button>
  );
}
