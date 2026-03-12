import { useEffect, useState } from 'react';
import { Copy, Eye, EyeOff } from 'lucide-react';
import { Button, InlineStatus } from '@garage-admin/ui';

interface SecretRevealProps {
  label: string;
  value: string;
  hidden?: boolean;
}

export function SecretReveal({ label, value, hidden = true }: SecretRevealProps) {
  const [isRevealed, setIsRevealed] = useState(!hidden);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard API not available
    }
  };

  const maskedValue = '•'.repeat(Math.min(32, value.length));

  return (
    <div className="rounded-lg border bg-slate-50/70 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-sm text-slate-900 break-all">{isRevealed ? value : maskedValue}</span>
        <div className="flex items-center gap-1">
          {hidden && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsRevealed(!isRevealed)}
              title={isRevealed ? 'Hide' : 'Reveal'}
            >
              {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={handleCopy} title="Copy">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {copied && (
        <InlineStatus tone="success" className="mt-1">
          Copied!
        </InlineStatus>
      )}
    </div>
  );
}
