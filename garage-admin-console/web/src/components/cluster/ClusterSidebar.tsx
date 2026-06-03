import { useCallback, useRef, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, type LucideIcon } from 'lucide-react';
import { cn } from '@garage/ui';
import { NodeIcon } from '@/lib/entity-icons';
import { ClusterNavList } from './ClusterNav';

const STORAGE_KEY = 'garage:cluster-sidebar-collapsed';

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

interface SidebarProps {
  clusterId: string;
  clusterName?: string;
  endpoint?: string;
  blockErrorCount: number;
}

/** The cluster identity header + nav, shared by the docked sidebar and the
 * collapsed-state peek popover. `action` (collapse) is only shown when docked —
 * the collapsed popover has no header button: the expand icon you hover is the
 * one you click to re-dock. */
function SidebarPanel({
  clusterId,
  clusterName,
  endpoint,
  blockErrorCount,
  action,
  onNavigate,
  className,
}: SidebarProps & {
  action?: { icon: LucideIcon; label: string; onClick: () => void };
  onNavigate?: () => void;
  className?: string;
}) {
  const ActionIcon = action?.icon;
  return (
    <div className={cn('rounded-xl border bg-card p-2.5 shadow-sm', className)}>
      <div className="mb-3 flex items-center gap-2.5 px-1 py-1.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <NodeIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <h2 className="truncate text-sm font-semibold">{clusterName || 'Loading...'}</h2>
          <p className="truncate text-[11px] text-muted-foreground">{endpoint}</p>
        </div>
        {action && ActionIcon && (
          <button
            type="button"
            onClick={action.onClick}
            aria-label={action.label}
            title={action.label}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          >
            <ActionIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      <ClusterNavList
        clusterId={clusterId}
        blockErrorCount={blockErrorCount}
        onNavigate={onNavigate}
      />
    </div>
  );
}

/** Desktop-only collapsible cluster sidebar. Docked + persistent by default;
 * collapses to a thin rail (no menu items, no icons) whose expand icon reveals a
 * transient nav popover on hover/focus and re-docks the sidebar when clicked. */
export function ClusterSidebar(props: SidebarProps) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [peekOpen, setPeekOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  const persist = useCallback((next: boolean) => {
    setCollapsed(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* ignore quota / privacy-mode failures */
    }
  }, []);

  const openPeek = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    setPeekOpen(true);
  }, []);
  const closePeekSoon = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setPeekOpen(false), 200);
  }, []);

  const dock = useCallback(() => {
    setPeekOpen(false);
    persist(false);
  }, [persist]);

  if (!collapsed) {
    return (
      <aside className="sticky top-20 hidden w-56 shrink-0 self-start lg:block">
        <SidebarPanel
          {...props}
          action={{ icon: PanelLeftClose, label: 'Collapse sidebar', onClick: () => persist(true) }}
        />
      </aside>
    );
  }

  return (
    // z-30 lifts the rail's stacking context above the content cards so the
    // flyout popover is never painted behind them.
    <div className="sticky top-20 z-30 hidden w-10 shrink-0 self-start lg:block">
      <div
        className="relative"
        onMouseEnter={openPeek}
        onMouseLeave={closePeekSoon}
        onFocus={openPeek}
        onBlur={closePeekSoon}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setPeekOpen(false);
        }}
      >
        <button
          type="button"
          onClick={dock}
          aria-label="Expand sidebar"
          aria-expanded={peekOpen}
          title="Expand sidebar"
          className="flex h-10 w-10 items-center justify-center rounded-xl border bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/30 hover:text-primary"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>

        {/* Flyout peek: opens to the RIGHT of the icon so the icon stays visible
            and clickable (clicking it re-docks). Opaque, so content never shows
            through. */}
        <div
          className={cn(
            'absolute left-12 top-0 w-60 origin-top-left transition-all duration-150 ease-out',
            peekOpen
              ? 'pointer-events-auto translate-x-0 scale-100 opacity-100'
              : 'pointer-events-none -translate-x-1 scale-[0.97] opacity-0',
          )}
        >
          <SidebarPanel {...props} className="shadow-xl" onNavigate={() => setPeekOpen(false)} />
        </div>
      </div>
    </div>
  );
}
