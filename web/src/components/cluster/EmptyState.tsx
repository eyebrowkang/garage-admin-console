import type { ComponentType, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  children?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action, children }: EmptyStateProps) {
  return (
    <Card className="border-dashed border-2 bg-slate-50/50">
      <CardContent className="h-64 flex flex-col items-center justify-center text-center p-8 space-y-4">
        <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center">
          <Icon className="h-8 w-8 text-slate-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <p className="text-muted-foreground">{description}</p>
        </div>
        {action && (
          <Button variant="outline" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
