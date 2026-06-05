import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

export interface FloatingActionBarProps {
  /**
   * Whether the bar is shown. The bar stays mounted either way so it can slide
   * in/out; when false it translates off-screen and becomes non-interactive.
   */
  visible: boolean;
  /** Bar contents — a count label plus action buttons. */
  children: ReactNode;
  /** Accessible region label. Defaults to "Selection actions". */
  label?: string;
}

/**
 * A pill-shaped action bar that floats over the lower portion of the viewport
 * (not glued to the bottom edge) instead of sitting in-flow above content — so
 * showing or hiding it never shifts the surrounding layout. Shared by the admin
 * `ResourceList` and the S3 Browser multi-select bar so both behave identically.
 */
export function FloatingActionBar({
  visible,
  children,
  label = 'Selection actions',
}: FloatingActionBarProps) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[10vh] z-40 flex justify-center px-4 sm:bottom-[15vh]"
      aria-hidden={!visible}
    >
      <div
        role="region"
        aria-label={label}
        className={cn(
          'pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-primary/30 bg-card px-2.5 py-2 shadow-lg transition-all duration-200 ease-out motion-reduce:transition-none',
          visible
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-[calc(100%+1.5rem)] opacity-0',
        )}
      >
        {children}
      </div>
    </div>
  );
}
