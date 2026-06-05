import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button, CopyButton } from '@garage/ui';

interface SecretRevealProps {
  label: string;
  value: string;
  hidden?: boolean;
}

export function SecretReveal({ label, value, hidden = true }: SecretRevealProps) {
  const [isRevealed, setIsRevealed] = useState(!hidden);

  const maskedValue = '•'.repeat(Math.min(32, value.length));

  return (
    <div className="rounded-lg border bg-muted p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-sm text-foreground break-all">
          {isRevealed ? value : maskedValue}
        </span>
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
          <CopyButton value={value} label={label} />
        </div>
      </div>
    </div>
  );
}
