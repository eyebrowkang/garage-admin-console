import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@garage-admin/ui';

interface DetailPageHeaderProps {
  backTo: string;
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}

export function DetailPageHeader({
  backTo,
  title,
  subtitle,
  badges,
  actions,
}: DetailPageHeaderProps) {
  return (
    <div className="flex flex-col gap-2 sm:gap-3 border-b border-border/70 pb-3 sm:pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
        <Link to={backTo}>
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0 space-y-0.5 sm:space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight">{title}</h1>
            {badges}
          </div>
          {subtitle && (
            <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere] sm:text-sm">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}
