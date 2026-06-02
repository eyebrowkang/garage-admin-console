import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import { StatusCard, type StatusAccent } from './status-card';

/**
 * Shared list-view primitives for the fleet dashboards (clusters / connections).
 *
 * The list view is a real table, not a sliced-up card: a column-header strip
 * (`FleetListHeader`) sits above a stack of `FleetListRow`s that share the SAME
 * responsive grid template, so every field lines up in its own column and reads
 * left-to-right instead of stacking. Each app supplies its own `gridClassName`
 * (column widths) plus the per-row identity / metric cells, keeping the two
 * products visually identical without forking the markup.
 *
 * Responsive contract: below `md` the grid collapses to `identity | actions`
 * (metric cells carry `hidden md:block` via the row), and the header hides. The
 * identity cell is expected to surface the endpoint inline on mobile (where the
 * dedicated endpoint column is hidden).
 */

interface FleetListHeaderProps {
  /** Label for the first, identity column — e.g. "Cluster" / "Connection". */
  primaryLabel: string;
  /** Metric column labels, left-to-right, matching each row's `metrics`. */
  metricLabels: string[];
  /** Responsive grid template shared with every row. */
  gridClassName: string;
  className?: string;
}

export function FleetListHeader({
  primaryLabel,
  metricLabels,
  gridClassName,
  className,
}: FleetListHeaderProps) {
  return (
    <div
      className={cn(
        'hidden items-center gap-x-4 px-4 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground md:grid',
        gridClassName,
        className,
      )}
    >
      <span className="truncate">{primaryLabel}</span>
      {metricLabels.map((label) => (
        <span key={label} className="truncate">
          {label}
        </span>
      ))}
      <span aria-hidden className="text-right">
        {/* actions column — intentionally unlabelled */}
      </span>
    </div>
  );
}

interface FleetListRowProps {
  accent: StatusAccent;
  /** Responsive grid template shared with `FleetListHeader`. */
  gridClassName: string;
  /** Identity cell: name + status badge (and the endpoint inline on mobile). */
  identity: ReactNode;
  /** Metric cells, left-to-right; each is hidden below `md` and shown as a column at `md`+. */
  metrics: ReactNode[];
  /** Trailing actions (primary Open + overflow menu). Always visible. */
  actions: ReactNode;
  className?: string;
}

export function FleetListRow({
  accent,
  gridClassName,
  identity,
  metrics,
  actions,
  className,
}: FleetListRowProps) {
  return (
    <StatusCard accent={accent} className={className}>
      <div className={cn('grid items-center gap-x-4 px-3 py-2.5 sm:px-4', gridClassName)}>
        <div className="min-w-0">{identity}</div>
        {metrics.map((cell, index) => (
          <div key={index} className="hidden min-w-0 md:block">
            {cell}
          </div>
        ))}
        <div className="flex shrink-0 items-center justify-end gap-1.5">{actions}</div>
      </div>
    </StatusCard>
  );
}

/**
 * A single value cell for a list row / header column. The column header carries
 * the label, so the cell shows just the value — tabular by default so digits
 * stay aligned across rows and don't jitter on refresh.
 */
export function FleetCell({
  value,
  className,
  mono,
}: {
  value: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div
      className={cn(
        'truncate text-sm font-medium text-foreground',
        mono ? 'font-mono text-xs text-muted-foreground' : 'tabular-nums',
        className,
      )}
    >
      {value}
    </div>
  );
}
