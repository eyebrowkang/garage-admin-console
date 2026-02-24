import { Suspense } from 'react';
import { Outlet, useParams, NavLink, useLocation, Link } from 'react-router-dom';
import { Activity, LayoutGrid, Settings, ChevronLeft, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useClusters } from '@/hooks/useClusters';
import { useBlockErrors } from '@/hooks/useBlocks';
import { ClusterContext } from '@/contexts/ClusterContext';
import { PageLoadingState } from '@/components/cluster/PageLoadingState';
import { BlockIcon, BucketIcon, KeyIcon, NodeIcon, TokenIcon } from '@/lib/entity-icons';

const navItems = [
  { to: '', icon: Activity, label: 'Overview', shortLabel: 'Overview', exact: true },
  { to: 'buckets', icon: BucketIcon, label: 'Buckets', shortLabel: 'Buckets' },
  { to: 'keys', icon: KeyIcon, label: 'Access Keys', shortLabel: 'Keys' },
  { to: 'layout', icon: LayoutGrid, label: 'Layout', shortLabel: 'Layout' },
  { to: 'nodes', icon: NodeIcon, label: 'Nodes', shortLabel: 'Nodes' },
  { to: 'tokens', icon: TokenIcon, label: 'Admin Tokens', shortLabel: 'Tokens' },
  { to: 'workers', icon: Settings, label: 'Workers', shortLabel: 'Workers' },
  { to: 'blocks', icon: BlockIcon, label: 'Blocks', shortLabel: 'Blocks' },
];

function MobileNavItem({
  to,
  icon: Icon,
  label,
  clusterId,
  exact = false,
  badge,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  clusterId: string;
  exact?: boolean;
  badge?: number;
}) {
  const location = useLocation();
  const fullPath = `/clusters/${clusterId}/${to}`;
  const isActive = exact
    ? location.pathname === fullPath || location.pathname === `/clusters/${clusterId}`
    : location.pathname.startsWith(fullPath);

  return (
    <NavLink
      to={fullPath}
      className={cn(
        'relative flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
        isActive
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground active:scale-95',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-destructive-foreground">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
}

function DesktopNavItem({
  to,
  icon: Icon,
  label,
  clusterId,
  exact = false,
  badge,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  clusterId: string;
  exact?: boolean;
  badge?: number;
}) {
  const location = useLocation();
  const fullPath = `/clusters/${clusterId}/${to}`;
  const isActive = exact
    ? location.pathname === fullPath || location.pathname === `/clusters/${clusterId}`
    : location.pathname.startsWith(fullPath);

  return (
    <NavLink
      to={fullPath}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all',
        isActive
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
      )}
      <Icon
        className={cn(
          'h-4 w-4 transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-foreground',
        )}
      />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
}

export function ClusterLayout() {
  const { id } = useParams<{ id: string }>();
  const { data: clusters } = useClusters();
  const { data: blockErrorsData } = useBlockErrors(id || '');

  if (!id) {
    return <div className="p-4">Invalid cluster ID</div>;
  }

  const cluster = clusters?.find((c) => c.id === id);

  // Count total block errors across all nodes
  const blockErrorCount = blockErrorsData
    ? Object.values(blockErrorsData.success).reduce(
        (sum, data) => sum + (data.blockErrors?.length || 0),
        0,
      )
    : 0;

  return (
    <ClusterContext.Provider value={{ clusterId: id, cluster }}>
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Mobile: cluster header + sticky horizontal nav */}
        <div className="lg:hidden">
          <div className="flex items-center gap-3 mb-3">
            <Link
              to="/"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:text-foreground active:scale-95"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <h2 className="font-semibold text-base truncate">
                {cluster?.name || 'Loading...'}
              </h2>
              <p className="text-xs text-muted-foreground truncate">{cluster?.endpoint}</p>
            </div>
          </div>
          {/* Sticky pill nav */}
          <div className="sticky top-14 z-30 -mx-4 px-4 pb-3 pt-1 bg-gradient-to-b from-background via-background to-transparent">
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none scroll-fade py-1 px-1">
              {navItems.map((item) => (
                <MobileNavItem
                  key={item.to}
                  to={item.to}
                  icon={item.icon}
                  label={item.shortLabel}
                  clusterId={id}
                  exact={item.exact}
                  badge={item.to === 'blocks' ? blockErrorCount : undefined}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Desktop sidebar nav */}
        <aside className="hidden lg:block w-56 flex-shrink-0 self-start">
          <div className="sticky top-20 rounded-xl border bg-card/90 p-2.5">
            <div className="flex items-center gap-2.5 mb-3 px-2 py-1.5">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <NodeIcon className="h-4 w-4" />
              </div>
              <div className="overflow-hidden">
                <h2 className="font-semibold text-sm truncate">
                  {cluster?.name || 'Loading...'}
                </h2>
                <p className="text-[11px] text-muted-foreground truncate">{cluster?.endpoint}</p>
              </div>
            </div>
            <nav className="space-y-0.5">
              {navItems.map((item) => (
                <DesktopNavItem
                  key={item.to}
                  to={item.to}
                  icon={item.icon}
                  label={item.label}
                  clusterId={id}
                  exact={item.exact}
                  badge={item.to === 'blocks' ? blockErrorCount : undefined}
                />
              ))}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <Suspense fallback={<PageLoadingState label="Loading..." />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </ClusterContext.Provider>
  );
}
