import { Skeleton } from '@/components/ui/skeleton';

interface TableLoadingStateProps {
  label?: string;
}

export function TableLoadingState({ label = 'Loading...' }: TableLoadingStateProps) {
  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-[200px]" />
          <Skeleton className="h-4 w-[300px]" />
        </div>
        <Skeleton className="h-9 w-[120px]" />
      </div>
      <div className="rounded-lg border bg-card p-4">
        <div className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
