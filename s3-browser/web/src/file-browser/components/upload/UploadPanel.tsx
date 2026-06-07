/**
 * Non-blocking upload panel — a floating, reopenable surface that tracks the
 * background upload queue (see UploadManager). It renders only when there are
 * tasks, can be minimized to a compact pill, and offers per-file cancel/retry.
 * Because it reads the manager (which lives at the provider level), uploads keep
 * running and stay visible while the user browses or closes the upload dialog.
 *
 * Palette stays within the four allowed colors: orange (in progress), green
 * (done), red (error); queued/canceled use the neutral muted token.
 */
import { useState } from 'react';
import { FileIcon } from '@primer/octicons-react';
import { AlertCircle, Check, ChevronDown, ChevronUp, Loader2, RotateCcw, X } from 'lucide-react';
import { cn } from '@garage/ui';
import { formatBytes } from '@garage/web-shared';
import { useBrowser, useUploadTasks } from '../../context';
import { CorsDiagnostic } from './CorsDiagnostic';
import type { UploadTask } from '@/lib/upload-manager';

const ACTIVE = new Set(['queued', 'uploading']);

export function UploadPanel() {
  const { uploadManager } = useBrowser();
  const tasks = useUploadTasks();
  const [minimized, setMinimized] = useState(false);

  if (tasks.length === 0) return null;

  const active = tasks.filter((t) => ACTIVE.has(t.status));
  const errorCount = tasks.filter((t) => t.status === 'error').length;
  const hasFinished = tasks.some((t) => !ACTIVE.has(t.status));
  const hasError = errorCount > 0;

  // Overall progress excludes cancelled tasks (their bytes aren't going anywhere).
  const tracked = tasks.filter((t) => t.status !== 'canceled');
  const totalSize = tracked.reduce((s, t) => s + t.size, 0);
  const totalLoaded = tracked.reduce((s, t) => s + t.loaded, 0);
  const pct = totalSize > 0 ? Math.round((totalLoaded / totalSize) * 100) : 0;

  const summary = active.length
    ? `Uploading ${active.length} file${active.length !== 1 ? 's' : ''}…`
    : errorCount
      ? `${errorCount} failed`
      : 'Uploads complete';

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))]">
      <div className="overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border/70 bg-card px-3 py-2">
          {active.length ? (
            <Loader2 size={14} className="shrink-0 animate-spin text-primary" />
          ) : errorCount ? (
            <AlertCircle size={14} className="shrink-0 text-destructive" />
          ) : (
            <Check size={14} className="shrink-0 text-success" />
          )}
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
            {summary}
            {active.length > 0 && (
              <span className="ml-1 font-normal text-muted-foreground">{pct}%</span>
            )}
          </span>
          {active.length > 0 && (
            <button
              className="text-[11px] font-medium text-muted-foreground hover:text-destructive"
              onClick={() => uploadManager.cancelAll()}
            >
              Cancel all
            </button>
          )}
          {!active.length && hasFinished && (
            <button
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
              onClick={() => uploadManager.clearFinished()}
            >
              Clear
            </button>
          )}
          <button
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setMinimized((m) => !m)}
            aria-label={minimized ? 'Expand uploads' : 'Minimize uploads'}
          >
            {minimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Task list */}
        {!minimized && (
          <ul className="max-h-72 divide-y divide-border/40 overflow-y-auto">
            {tasks.map((task) => (
              <UploadRow key={task.id} task={task} manager={uploadManager} />
            ))}
          </ul>
        )}

        {/* CORS diagnostic — only when something failed (the usual opaque cause). */}
        {!minimized && hasError && <CorsDiagnostic />}
      </div>
    </div>
  );
}

function UploadRow({
  task,
  manager,
}: {
  task: UploadTask;
  manager: ReturnType<typeof useBrowser>['uploadManager'];
}) {
  const pct =
    task.size > 0 ? Math.round((task.loaded / task.size) * 100) : task.status === 'done' ? 100 : 0;
  const isActive = ACTIVE.has(task.status);

  return (
    <li className="flex items-center gap-2.5 px-3 py-2 text-sm">
      <StatusIcon status={task.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-foreground" title={task.name}>
            {task.name}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {task.status === 'uploading'
              ? `${formatBytes(task.loaded)} / ${formatBytes(task.size)}`
              : formatBytes(task.size)}
          </span>
        </div>
        {task.status === 'uploading' && (
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-150"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        {task.status === 'queued' && (
          <p className="mt-0.5 text-[10px] text-muted-foreground">Queued</p>
        )}
        {task.status === 'error' && (
          <p className="mt-0.5 truncate text-[10px] text-destructive" title={task.error}>
            {task.error || 'Failed'}
          </p>
        )}
        {task.status === 'canceled' && (
          <p className="mt-0.5 text-[10px] text-muted-foreground">Canceled</p>
        )}
      </div>

      {/* Per-file action */}
      {isActive ? (
        <button
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={() => manager.cancel(task.id)}
          aria-label={`Cancel ${task.name}`}
        >
          <X size={13} />
        </button>
      ) : (
        <div className="flex shrink-0 items-center">
          {(task.status === 'error' || task.status === 'canceled') && (
            <button
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary"
              onClick={() => manager.retry(task.id)}
              aria-label={`Retry ${task.name}`}
            >
              <RotateCcw size={13} />
            </button>
          )}
          <button
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => manager.remove(task.id)}
            aria-label={`Remove ${task.name}`}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </li>
  );
}

function StatusIcon({ status }: { status: UploadTask['status'] }) {
  const className = 'shrink-0';
  if (status === 'done') return <Check size={15} className={cn(className, 'text-success')} />;
  if (status === 'error')
    return <AlertCircle size={15} className={cn(className, 'text-destructive')} />;
  if (status === 'uploading')
    return <Loader2 size={15} className={cn(className, 'animate-spin text-primary')} />;
  return <FileIcon size={14} className={cn(className, 'text-muted-foreground')} />;
}
