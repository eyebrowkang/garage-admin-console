import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

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
        'flex flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-start md:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
        {meta && <div className="pt-1">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
    </div>
  );
}
