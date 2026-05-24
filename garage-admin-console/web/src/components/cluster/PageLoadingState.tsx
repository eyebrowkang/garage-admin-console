import { Skeleton } from '@/components/ui/skeleton';

interface PageLoadingStateProps {
  label?: string;
}

export function PageLoadingState({ label = 'Loading...' }: PageLoadingStateProps) {
  return (
    <div className="space-y-6 pt-2">
      <div className="space-y-2">
        <Skeleton className="h-5 w-[160px]" />
        <Skeleton className="h-4 w-[260px]" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
