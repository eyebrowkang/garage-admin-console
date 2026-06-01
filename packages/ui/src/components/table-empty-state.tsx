import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { TableCell, TableRow } from './table';

interface TableEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  colSpan: number;
  action?: ReactNode;
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
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
          </div>
          {action && <div className="pt-2">{action}</div>}
        </div>
      </TableCell>
    </TableRow>
  );
}
