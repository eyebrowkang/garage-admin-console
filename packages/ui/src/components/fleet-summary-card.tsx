import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import { Card, CardContent } from './card';

export type SummaryTone = 'success' | 'warning' | 'destructive';

export interface SummaryStat {
  label: string;
  value: ReactNode;
  /** Semantic tone applied to the number + icon when `emphasized` is true. */
  tone?: SummaryTone;
  /** Leading icon — only rendered when the stat is emphasized. */
  icon?: LucideIcon;
  /**
   * When true the stat reads as "active": toned number + icon. When false and a
   * tone is set (a problem metric at zero) the number is muted with no icon, so
   * a clean fleet stays calm and real issues stand out.
   */
  emphasized?: boolean;
  /** Optional sub-line, e.g. "Checking: 2". */
  hint?: string;
}

interface FleetSummaryCardProps {
  title: string;
  description?: string;
  stats: SummaryStat[];
  className?: string;
}

const TONE_TEXT: Record<SummaryTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

/**
 * Neutral fleet overview: a title block plus a calm grid of summary stats. The
 * card itself stays on `bg-card` (no colour wash) so it sits flush with the page
 * and the stat tiles read as a quiet hierarchy beneath it.
 */
export function FleetSummaryCard({ title, description, stats, className }: FleetSummaryCardProps) {
  return (
    <Card className={cn('border bg-card shadow-sm', className)}>
      <CardContent className="grid gap-4 p-3 sm:p-5 md:grid-cols-5">
        <div className="md:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Overview
          </p>
          <h2 className="mt-0.5 text-base font-semibold sm:text-xl">{title}</h2>
          {description && (
            <p className="mt-1 hidden text-sm text-muted-foreground sm:block">{description}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 sm:gap-3 md:col-span-3">
          {stats.map((stat) => (
            <SummaryStatTile key={stat.label} stat={stat} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryStatTile({ stat }: { stat: SummaryStat }) {
  const { label, value, tone, icon: Icon, emphasized, hint } = stat;
  const numberClass = tone
    ? emphasized
      ? TONE_TEXT[tone]
      : 'text-muted-foreground'
    : 'text-foreground';
  const showIcon = Boolean(tone && emphasized && Icon);

  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 px-2 py-1.5 sm:px-3 sm:py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          'flex items-center gap-1.5 text-xl font-semibold tracking-tight sm:text-2xl',
          numberClass,
        )}
      >
        {showIcon && Icon && <Icon className="h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" />}
        <span>{value}</span>
      </div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
