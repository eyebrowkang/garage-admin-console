import { RefreshCw, Terminal } from 'lucide-react';

import { cn } from '../lib/cn';
import { CopyButton } from './copy-button';

export interface TerminalOutputProps {
  /** Label shown in the header bar and the loading line, e.g. "garage stats". */
  command: string;
  /** Raw stdout to render. */
  content: string;
  /** When provided, a refresh button appears in the header. */
  onRefresh?: () => void;
  /** Spinner + disabled state for the refresh button. */
  refreshing?: boolean;
  /** Show the loading placeholder instead of the content. */
  loading?: boolean;
  /** Loading placeholder text. */
  loadingLabel?: string;
  /** Text shown when `content` is empty. */
  emptyLabel?: string;
  /** Tailwind max-height for the scroll area. Defaults to `max-h-[420px]`. */
  maxHeightClass?: string;
  className?: string;
}

/**
 * A terminal-styled panel for raw `garage` CLI stdout: a dark card with a header
 * bar (command + copy + optional refresh) and a monospace scroll area with a
 * blinking cursor. One source so every "raw output" surface looks the same; the
 * `overflow-hidden` wrapper + `overflow-auto` body keep long lines contained
 * (e.g. inside a dialog).
 */
export function TerminalOutput({
  command,
  content,
  onRefresh,
  refreshing = false,
  loading = false,
  loadingLabel = 'Fetching output…',
  emptyLabel = 'No output.',
  maxHeightClass = 'max-h-[420px]',
  className,
}: TerminalOutputProps) {
  const hasContent = content.trim().length > 0;
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-foreground/15 bg-foreground shadow-lg',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 font-mono text-xs text-background/60">
          <Terminal className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{command}</span>
        </div>
        <div className="flex items-center gap-1">
          <CopyButton
            value={hasContent ? content : ''}
            label="Output"
            compact
            className="text-background/60 hover:bg-white/10 hover:text-background"
          />
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh output"
              title="Refresh output"
              className="rounded-md p-1.5 text-background/60 transition-colors hover:bg-white/10 hover:text-background disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="px-4 py-4 font-mono text-xs text-background/70">
          <span className="text-primary">$</span> {command}
          <div className="mt-2 text-background/40">{loadingLabel}</div>
        </div>
      ) : (
        <pre
          className={cn(
            'overflow-auto whitespace-pre px-4 py-4 font-mono text-xs leading-relaxed text-background/90 selection:bg-primary/30',
            maxHeightClass,
          )}
        >
          {hasContent ? content : emptyLabel}
          {hasContent && (
            <span className="text-primary motion-safe:animate-pulse" aria-hidden>
              {' ▋'}
            </span>
          )}
        </pre>
      )}
    </div>
  );
}
