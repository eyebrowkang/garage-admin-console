import { Check } from 'lucide-react';
import { Badge } from '@garage-admin/ui';

interface PermissionStatusBadgeProps {
  allowed: boolean;
}

export function PermissionStatusBadge({ allowed }: PermissionStatusBadgeProps) {
  if (!allowed) {
    return <span className="text-xs text-muted-foreground">No</span>;
  }

  return (
    <Badge variant="success" className="gap-1 whitespace-nowrap px-2 py-0.5 text-[10px]">
      <Check className="h-3 w-3" />
      Allowed
    </Badge>
  );
}
