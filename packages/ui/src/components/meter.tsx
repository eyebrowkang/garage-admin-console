import { cn } from '../lib/cn';

export type MeterTone = 'success' | 'warning' | 'destructive' | 'neutral';

// Literal fill classes so @garage/ui's Tailwind compiler emits each tone.
const FILL: Record<MeterTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  neutral: 'bg-muted-foreground/40',
};

interface MeterProps {
  /** 0–100; clamped. */
  value: number;
  tone?: MeterTone;
  ariaLabel?: string;
  className?: string;
}

/**
 * A thin progress bar for quick cross-row comparison of a 0–100 ratio (e.g.
 * storage pressure). The fill width is inline-styled so no dynamic Tailwind
 * class is needed.
 */
export function Meter({ value, tone = 'neutral', ariaLabel, className }: MeterProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn('h-full rounded-full transition-all', FILL[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
