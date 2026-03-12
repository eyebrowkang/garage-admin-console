import { Activity, AlertTriangle, CheckCircle2, type LucideIcon, XCircle } from 'lucide-react';

export type ClusterHealthStatus =
  | 'healthy'
  | 'degraded'
  | 'unavailable'
  | 'unreachable'
  | 'unknown';

type ClusterHealthBadgeVariant = 'success' | 'warning' | 'destructive' | 'secondary';

interface ClusterHealthAppearance {
  label: string;
  icon: LucideIcon;
  badge: ClusterHealthBadgeVariant;
  emphasisClass: string;
  softBackgroundClass: string;
  borderClass: string;
  subtleBorderClass: string;
}

const CLUSTER_HEALTH_APPEARANCE: Record<ClusterHealthStatus, ClusterHealthAppearance> = {
  healthy: {
    label: 'Healthy',
    icon: CheckCircle2,
    badge: 'success',
    emphasisClass: 'text-success',
    softBackgroundClass: 'bg-success-soft',
    borderClass: 'border-success-border',
    subtleBorderClass: 'border-success-border/80',
  },
  degraded: {
    label: 'Degraded',
    icon: AlertTriangle,
    badge: 'warning',
    emphasisClass: 'text-warning',
    softBackgroundClass: 'bg-warning-soft',
    borderClass: 'border-warning-border',
    subtleBorderClass: 'border-warning-border/80',
  },
  unavailable: {
    label: 'Unavailable',
    icon: XCircle,
    badge: 'destructive',
    emphasisClass: 'text-destructive',
    softBackgroundClass: 'bg-destructive/10',
    borderClass: 'border-destructive/40',
    subtleBorderClass: 'border-destructive/30',
  },
  unreachable: {
    label: 'Unreachable',
    icon: XCircle,
    badge: 'destructive',
    emphasisClass: 'text-destructive',
    softBackgroundClass: 'bg-destructive/10',
    borderClass: 'border-destructive/40',
    subtleBorderClass: 'border-destructive/30',
  },
  unknown: {
    label: 'Checking',
    icon: Activity,
    badge: 'secondary',
    emphasisClass: 'text-muted-foreground',
    softBackgroundClass: 'bg-muted/60',
    borderClass: 'border-border',
    subtleBorderClass: 'border-border',
  },
};

function isClusterHealthStatus(value: string | undefined): value is ClusterHealthStatus {
  return !!value && value in CLUSTER_HEALTH_APPEARANCE;
}

export function resolveClusterHealthStatus(
  rawStatus: string | undefined,
  hasError: boolean,
  isLoading: boolean,
): ClusterHealthStatus {
  if (isClusterHealthStatus(rawStatus)) return rawStatus;
  if (hasError) return 'unreachable';
  if (isLoading) return 'unknown';
  return 'unknown';
}

export function getClusterHealthAppearance(status: ClusterHealthStatus): ClusterHealthAppearance {
  return CLUSTER_HEALTH_APPEARANCE[status];
}
