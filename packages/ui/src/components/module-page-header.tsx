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
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h1>
        <p className="text-xs text-muted-foreground sm:text-sm">{description}</p>
        {meta && <div className="pt-1">{meta}</div>}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      )}
    </div>
  );
}
