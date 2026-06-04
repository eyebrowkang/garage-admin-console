import { ChevronLeft, PanelLeftOpen } from 'lucide-react';
import { cn } from '@garage/ui';
import { CopyActionIcon, RefreshActionIcon } from '@/lib/action-icons';
import { useBrowser } from '../../context';

export function Breadcrumb() {
  const {
    bucket,
    path,
    onPathChange,
    refresh,
    currentPrefix,
    activeFile,
    setActiveFile,
    showToast,
    treeCollapsed,
    setTreeCollapsed,
    isNarrow,
    treeDrawerOpen,
    setTreeDrawerOpen,
  } = useBrowser();

  const openTree = () => {
    setTreeDrawerOpen(true);
    setTreeCollapsed(false);
  };

  // Mobile: a OneDrive-style header — back (up a level / out of a file) + the
  // current location as the title, with tree + refresh affordances trailing.
  if (isNarrow) {
    const inSub = path.length > 0 || !!activeFile;
    const title = activeFile ? activeFile.name : path.length ? path[path.length - 1] : bucket;
    const goUp = () => {
      if (activeFile) setActiveFile(null);
      else onPathChange(path.slice(0, -1));
    };
    const iconBtn =
      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors active:bg-muted';
    return (
      <div className="flex h-12 shrink-0 items-center gap-0.5 border-b border-border bg-card/40 px-1.5">
        {inSub ? (
          <button onClick={goUp} className={cn(iconBtn, 'text-foreground')} aria-label="Back">
            <ChevronLeft size={24} />
          </button>
        ) : (
          <button
            onClick={openTree}
            className={cn(iconBtn, 'text-muted-foreground')}
            aria-label="Open file tree"
          >
            <PanelLeftOpen size={18} />
          </button>
        )}
        <span
          className="min-w-0 flex-1 truncate px-1 text-[17px] font-semibold text-foreground"
          title={title}
        >
          {title}
        </span>
        {inSub && (
          <button
            onClick={openTree}
            className={cn(iconBtn, 'text-muted-foreground')}
            aria-label="Open file tree"
          >
            <PanelLeftOpen size={17} />
          </button>
        )}
        <button
          onClick={() => refresh(currentPrefix)}
          className={cn(iconBtn, 'text-muted-foreground')}
          aria-label="Refresh"
        >
          <RefreshActionIcon size={16} />
        </button>
      </div>
    );
  }

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
          <PanelLeftOpen size={15} />
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
          <CopyActionIcon size={14} />
        </button>
      )}

      <div className="flex-1" />

      <button
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
        onClick={() => refresh(currentPrefix)}
        title="Refresh"
        aria-label="Refresh current folder"
      >
        <RefreshActionIcon size={14} />
      </button>
    </div>
  );
}
