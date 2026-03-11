import { Loader2 } from 'lucide-react';

interface InlineLoadingStateProps {
  label?: string;
}

export function InlineLoadingState({ label = 'Loading...' }: InlineLoadingStateProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}
