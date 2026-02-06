import { Loader2 } from 'lucide-react';

interface PageLoadingStateProps {
  label?: string;
}

export function PageLoadingState({ label = 'Loading...' }: PageLoadingStateProps) {
  return (
    <div className="flex min-h-[220px] items-center justify-center">
      <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {label}
      </div>
    </div>
  );
}
