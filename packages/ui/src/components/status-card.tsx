import * as React from 'react';

import { cn } from '../lib/cn';

export type StatusAccent = 'neutral' | 'success' | 'warning' | 'destructive' | 'primary';

// Attention states get a full, subtle coloured border; healthy / neutral stay
// on the plain hairline so a calm fleet reads calm. No single-edge stripe: the
// status is carried by this full border plus the row's text+icon badge, never a
// slab of colour or a left accent bar.
const ACCENT_BORDER: Record<StatusAccent, string> = {
  neutral: '',
  success: '',
  warning: 'border-warning/40',
  destructive: 'border-destructive/50',
  primary: 'border-primary/40',
};

interface StatusCardProps extends React.HTMLAttributes<HTMLDivElement> {
  accent?: StatusAccent;
}

/**
 * A neutral white card whose status, when it has one, is carried by a full
 * subtle border in the status colour plus a small text badge — never by a thick
 * single-edge accent bar or a flooded surface.
 */
export const StatusCard = React.forwardRef<HTMLDivElement, StatusCardProps>(
  ({ accent = 'neutral', className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md',
        ACCENT_BORDER[accent],
        className,
      )}
      {...props}
    />
  ),
);
StatusCard.displayName = 'StatusCard';
