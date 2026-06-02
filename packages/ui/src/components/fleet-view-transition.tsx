import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import type { ViewMode } from '../hooks/use-view-mode';

interface FleetViewTransitionProps {
  /** Current layout; changing it replays the entrance. */
  view: ViewMode;
  children: ReactNode;
  className?: string;
}

/**
 * Fades the newly selected fleet layout (list ↔ card) in instead of hard-cutting
 * between two different-height layouts. Keyed on `view` so React remounts the
 * subtree and the CSS entrance (`.fleet-view-enter`, defined in @garage/ui
 * base.css) replays. Honours prefers-reduced-motion — there the keyframe is
 * disabled, so it degrades to an instant swap.
 */
export function FleetViewTransition({ view, children, className }: FleetViewTransitionProps) {
  return (
    <div key={view} className={cn('fleet-view-enter', className)}>
      {children}
    </div>
  );
}
