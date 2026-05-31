import { CopyIcon, SyncIcon, SidebarCollapseIcon } from '@primer/octicons-react';
import { cn } from '@garage/ui';
import { useBrowser } from '../../context';

export function Breadcrumb() {
  const {
    bucket,
    path,
    onPathChange,
    refresh,
    currentPrefix,
    activeFile,
    showToast,
    treeCollapsed,
    setTreeCollapsed,
    isNarrow,
    treeDrawerOpen,
    setTreeDrawerOpen,
  } = useBrowser();

  const copyCurrentKey = async () => {
    const key = activeFile?.key ?? currentPrefix;
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      showToast('ok', 'Key copied');
    } catch {
      showToast('err', 'Clipboard unavailable');
    }
  };

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card/30 px-3 sm:px-5 min-w-0">
      {(treeCollapsed || (isNarrow && !treeDrawerOpen)) && (
        <button
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          onClick={() => {
            setTreeDrawerOpen(true);
            setTreeCollapsed(false);
          }}
          title="Open file tree"
          aria-label="Open file tree"
        >
          <SidebarCollapseIcon size={15} />
        </button>
      )}

      <button
        className={cn(
          'inline-flex min-w-0 items-center gap-1.5 rounded px-1 py-1 text-sm transition-colors',
          path.length === 0 && !activeFile
            ? 'text-foreground cursor-default'
            : 'text-muted-foreground hover:text-foreground',
        )}
        onClick={() => onPathChange([])}
        aria-label={`${bucket} root`}
      >
        <span className="truncate font-medium">{bucket}</span>
      </button>

      {path.map((seg, i) => {
        const isCurrent = i === path.length - 1 && !activeFile;
        return (
          <span key={`${i}:${seg}`} className="inline-flex min-w-0 items-center gap-2">
            <span className="text-muted-foreground/50">/</span>
            <button
              className={cn(
                'max-w-52 truncate rounded px-1 py-1 text-sm transition-colors',
                isCurrent
                  ? 'text-foreground font-semibold cursor-default'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => {
                if (!isCurrent) onPathChange(path.slice(0, i + 1));
              }}
              title={seg}
            >
              {seg}
            </button>
          </span>
        );
      })}

      {activeFile && (
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground/50">/</span>
          <span
            className="max-w-64 truncate text-sm font-semibold text-foreground"
            title={activeFile.key}
          >
            {activeFile.name}
          </span>
        </span>
      )}

      {(activeFile || currentPrefix) && (
        <button
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          onClick={copyCurrentKey}
          title="Copy current key"
          aria-label="Copy current key"
        >
          <CopyIcon size={14} />
        </button>
      )}

      <div className="flex-1" />

      <button
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
        onClick={() => refresh(currentPrefix)}
        title="Refresh"
        aria-label="Refresh current folder"
      >
        <SyncIcon size={14} />
      </button>
    </div>
  );
}
