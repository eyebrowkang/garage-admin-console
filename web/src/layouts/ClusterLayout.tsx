import { Outlet, useParams, NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  Database,
  Key,
  Server,
  LayoutGrid,
  Shield,
  Blocks,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useClusters } from '@/hooks/useClusters';
import { useBlockErrors } from '@/hooks/useBlocks';
import { ClusterContext } from '@/contexts/ClusterContext';

const navItems = [
  { to: '', icon: Activity, label: 'Overview', exact: true },
  { to: 'buckets', icon: Database, label: 'Buckets' },
  { to: 'keys', icon: Key, label: 'Access Keys' },
  { to: 'layout', icon: LayoutGrid, label: 'Layout' },
  { to: 'nodes', icon: Server, label: 'Nodes' },
  { to: 'tokens', icon: Shield, label: 'Admin Tokens' },
  { to: 'workers', icon: Settings, label: 'Workers' },
  { to: 'blocks', icon: Blocks, label: 'Blocks' },
];

function ClusterNavItem({
  to,
  icon: Icon,
  label,
  clusterId,
  exact = false,
  badge,
}: {
  to: string;
  icon: typeof Activity;
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
        'relative flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
        isActive
          ? 'border-primary/40 bg-primary/10 text-primary font-medium'
          : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="absolute right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
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
        {/* Cluster Header */}
        <div className="lg:hidden">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Server className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">{cluster?.name || 'Loading...'}</h2>
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                {cluster?.endpoint}
              </p>
            </div>
          </div>
          {/* Horizontal scrollable nav on mobile */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2">
            {navItems.map((item) => (
              <ClusterNavItem
                key={item.to}
                to={item.to}
                icon={item.icon}
                label={item.label}
                clusterId={id}
                exact={item.exact}
                badge={item.to === 'blocks' ? blockErrorCount : undefined}
              />
            ))}
          </div>
        </div>

        {/* Desktop sidebar nav */}
        <aside className="hidden lg:block w-60 flex-shrink-0 self-start">
          <div className="sticky top-20 space-y-2 rounded-xl border bg-card/90 p-3">
            <div className="flex items-center gap-2 mb-2 px-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Server className="h-4 w-4" />
              </div>
              <div className="overflow-hidden">
                <h2 className="font-semibold text-sm truncate">{cluster?.name || 'Loading...'}</h2>
                <p className="text-xs text-muted-foreground truncate">{cluster?.endpoint}</p>
              </div>
            </div>
            <nav className="space-y-1">
              {navItems.map((item) => (
                <ClusterNavItem
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
          <Outlet />
        </div>
      </div>
    </ClusterContext.Provider>
  );
}
