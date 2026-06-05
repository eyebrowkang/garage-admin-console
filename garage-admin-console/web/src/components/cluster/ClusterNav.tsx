import { NavLink, useLocation } from 'react-router-dom';
import { Activity, ExternalLink, LayoutGrid, Settings, type LucideIcon } from 'lucide-react';
import { cn } from '@garage/ui';
import { BlockIcon, BucketIcon, KeyIcon, NodeIcon, TokenIcon } from '@/lib/entity-icons';

type ClusterNavItem = {
  to: string;
  icon: LucideIcon;
  label: string;
  shortLabel: string;
  exact?: boolean;
  external?: boolean;
};

/** Single source of truth for the cluster nav — desktop sidebar, collapsed
 * popover, and the mobile drawer all render from this list, so they can never
 * drift apart. */
const clusterNavItems: ClusterNavItem[] = [
  { to: '', icon: Activity, label: 'Overview', shortLabel: 'Overview', exact: true },
  { to: 'buckets', icon: BucketIcon, label: 'Buckets', shortLabel: 'Buckets' },
  { to: 'keys', icon: KeyIcon, label: 'Access Keys', shortLabel: 'Keys' },
  { to: 'layout', icon: LayoutGrid, label: 'Layout', shortLabel: 'Layout' },
  { to: 'nodes', icon: NodeIcon, label: 'Nodes', shortLabel: 'Nodes' },
  { to: 'tokens', icon: TokenIcon, label: 'Admin Tokens', shortLabel: 'Tokens' },
  { to: 'workers', icon: Settings, label: 'Workers', shortLabel: 'Workers' },
  { to: 'blocks', icon: BlockIcon, label: 'Blocks', shortLabel: 'Blocks' },
];

function NavItemLink({
  item,
  clusterId,
  badge,
  onNavigate,
}: {
  item: ClusterNavItem;
  clusterId: string;
  badge?: number;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const { to, icon: Icon, label, exact = false, external = false } = item;
  const fullPath = `/clusters/${clusterId}/${to}`;
  const isActive =
    !external &&
    (exact
      ? location.pathname === fullPath || location.pathname === `/clusters/${clusterId}`
      : location.pathname.startsWith(fullPath));

  const baseClass = cn(
    'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all',
    isActive
      ? 'bg-primary/10 text-primary font-medium'
      : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
  );

  const content = (
    <>
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
      {external && (
        <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground/50 group-hover:text-muted-foreground" />
      )}
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </>
  );

  if (external) {
    return (
      <a
        href={fullPath}
        target="_blank"
        rel="noopener noreferrer"
        className={baseClass}
        title={`${label} (opens in new tab)`}
        onClick={onNavigate}
      >
        {content}
      </a>
    );
  }

  return (
    <NavLink to={fullPath} className={baseClass} onClick={onNavigate} end={exact}>
      {content}
    </NavLink>
  );
}

/** The cluster nav links, rendered identically wherever they appear. */
export function ClusterNavList({
  clusterId,
  blockErrorCount = 0,
  onNavigate,
  className,
}: {
  clusterId: string;
  blockErrorCount?: number;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <nav className={cn('space-y-0.5', className)}>
      {clusterNavItems.map((item) => (
        <NavItemLink
          key={item.to}
          item={item}
          clusterId={clusterId}
          badge={item.to === 'blocks' ? blockErrorCount : undefined}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}
