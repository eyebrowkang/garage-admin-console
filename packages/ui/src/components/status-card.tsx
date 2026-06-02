import * as React from 'react';

import { cn } from '../lib/cn';

export type StatusAccent = 'neutral' | 'success' | 'warning' | 'destructive' | 'primary';

// Literal class strings so @garage/ui's Tailwind compiler emits each variant.
// Healthy / neutral bars stay low-saturation; only real anomalies use a strong
// colour, keeping the card body neutral and the page calm.
const ACCENT_BAR: Record<StatusAccent, string> = {
  neutral: 'border-l-border',
  success: 'border-l-success/60',
  warning: 'border-l-warning',
  destructive: 'border-l-destructive',
  primary: 'border-l-primary',
};

interface StatusCardProps extends React.HTMLAttributes<HTMLDivElement> {
  accent?: StatusAccent;
}

/**
 * A neutral white card whose status is carried only by a left accent bar (and,
 * by convention, a small badge in the header) — never by flooding the whole
 * surface with colour.
 */
export const StatusCard = React.forwardRef<HTMLDivElement, StatusCardProps>(
  ({ accent = 'neutral', className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-l-4 bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md',
        ACCENT_BAR[accent],
        className,
      )}
      {...props}
    />
  ),
);
StatusCard.displayName = 'StatusCard';
