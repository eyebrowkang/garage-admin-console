import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

import { cn } from '../lib/cn';
import { Button } from './button';

export interface DetailPageHeaderProps {
  /**
   * Breadcrumb wayfinding rendered above the title. When provided it owns
   * "where am I / go up", so the standalone back button is suppressed. Pass a
   * `<Breadcrumb>` tree (router-aware consumers slot their own links via
   * `BreadcrumbLink asChild`).
   */
  breadcrumb?: ReactNode;
  /**
   * When provided (and no `breadcrumb` is set), renders a styled back button
   * that calls this on click.
   */
  onBack?: () => void;
  backLabel?: string;
  /** The page title (h1). Optional — omit it when the breadcrumb + content
   *  already carry the identity, to render just the breadcrumb + actions. */
  title?: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}

/**
 * Detail-level page header: optional breadcrumb, optional back button, title +
 * badges, subtitle and a trailing actions cluster. Router-agnostic — consumers
 * wire navigation via `onBack`/`breadcrumb` so this stays usable in the
 * router-free federated surfaces too.
 */
export function DetailPageHeader({
  breadcrumb,
  onBack,
  backLabel = 'Back',
  title,
  subtitle,
  badges,
  actions,
}: DetailPageHeaderProps) {
  // A breadcrumb supersedes the lone back button (clickable ancestors already
  // carry "go up"); without one, the back button keeps the prior behaviour.
  const showBack = !!onBack && !breadcrumb;
  // The identity cluster (back · title · badges · subtitle). When a page omits
  // all of it, the row collapses to just the actions (right-aligned).
  const hasIdentity = showBack || title != null || badges != null || subtitle != null;
  return (
    <div className="space-y-2 border-b border-border/70 pb-3 sm:space-y-3 sm:pb-4">
      {breadcrumb}
      {(hasIdentity || actions) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          {hasIdentity && (
            <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
              {showBack && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={onBack}
                  aria-label={backLabel}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <div className="min-w-0 space-y-0.5 sm:space-y-1">
                {(title != null || badges != null) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {title != null && (
                      <h1 className="text-lg sm:text-xl font-semibold tracking-tight">{title}</h1>
                    )}
                    {badges}
                  </div>
                )}
                {subtitle && (
                  <p className="break-all text-xs sm:text-sm text-muted-foreground">{subtitle}</p>
                )}
              </div>
            </div>
          )}
          {actions && (
            <div
              className={cn(
                'flex flex-wrap items-center gap-2 sm:justify-end sm:pl-0',
                !hasIdentity && 'sm:ml-auto',
                showBack && 'pl-10',
              )}
            >
              {actions}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
