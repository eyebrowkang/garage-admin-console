import type { LucideIcon } from 'lucide-react';
import { TableRow, TableCell } from '@/components/ui/table';

interface TableEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  colSpan: number;
  action?: React.ReactNode;
}

export function TableEmptyState({
  icon: Icon,
  title,
  description,
  colSpan,
  action,
}: TableEmptyStateProps) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-48 text-center">
        <div className="flex flex-col items-center justify-center space-y-3 py-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Icon className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h3 className="font-medium text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">{description}</p>
          </div>
          {action && <div className="pt-2">{action}</div>}
        </div>
      </TableCell>
    </TableRow>
  );
}
