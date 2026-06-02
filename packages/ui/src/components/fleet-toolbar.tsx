import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import { ViewToggle } from './view-toggle';
import type { ViewMode } from '../hooks/use-view-mode';

interface FleetToolbarProps {
  /** Entity label, e.g. "Clusters" / "Connections". */
  label: string;
  count: number;
  view: ViewMode;
  onViewChange: (next: ViewMode) => void;
  /** Optional extra controls rendered left of the view toggle. */
  children?: ReactNode;
  className?: string;
}

/**
 * The row under the fleet overview: a quiet total count on the left, the
 * list/card toggle on the right.
 */
export function FleetToolbar({
  label,
  count,
  view,
  onViewChange,
  children,
  className,
}: FleetToolbarProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span> · {count}
      </p>
      <div className="flex items-center gap-2">
        {children}
        <ViewToggle value={view} onChange={onViewChange} />
      </div>
    </div>
  );
}
