import { useCallback, useEffect, useState } from 'react';

import { toast } from './use-toast';

export interface UseCopyToClipboardOptions {
  /** Milliseconds before `copied` flips back to false. Default 1200. */
  resetMs?: number;
  /** Fire a light success toast after a successful copy. Default false. */
  successToast?: boolean;
}

/**
 * Clipboard-copy state shared by CopyButton, CopyValue, and anything else that
 * needs the "click → copied ✓ → reset" pattern: a `copied` flag that auto-clears
 * after `resetMs`, and a `copy()` that writes to the clipboard and toasts on
 * failure (and, optionally, on success). Keeps the behaviour in one place rather
 * than having each widget re-implement the timer + clipboard + error handling.
 */
export function useCopyToClipboard({
  resetMs = 1200,
  successToast = false,
}: UseCopyToClipboardOptions = {}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), resetMs);
    return () => window.clearTimeout(timer);
  }, [copied, resetMs]);

  const copy = useCallback(
    async (value: string | null | undefined) => {
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        if (successToast) toast({ title: 'Copied', variant: 'success' });
      } catch {
        toast({
          title: 'Copy failed',
          description: 'Clipboard permission was denied.',
          variant: 'destructive',
        });
      }
    },
    [successToast],
  );

  return { copied, copy };
}
