import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

interface ModulePageHeaderProps {
  title: string;
  description: string;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function ModulePageHeader({
  title,
  description,
  meta,
  actions,
  className,
}: ModulePageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 border-b border-border/70 pb-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:pb-4',
        className,
      )}
    >
      <div className="min-w-0 space-y-0.5 sm:space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
        {meta && <div className="pt-1">{meta}</div>}
      </div>
      {actions && (
        // Mobile: full-width stacked CTAs (big tap targets, consistent alignment).
        // sm+: the inline, right-aligned action row.
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:shrink-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}
