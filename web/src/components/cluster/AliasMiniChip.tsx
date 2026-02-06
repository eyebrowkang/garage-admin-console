import { CopyButton } from '@/components/cluster/CopyButton';
import { cn } from '@/lib/utils';

interface AliasMiniChipProps {
  value: string;
  kind?: 'global' | 'local';
  className?: string;
}

export function AliasMiniChip({ value, kind = 'global', className }: AliasMiniChipProps) {
  const copyLabel = kind === 'global' ? 'Global alias' : 'Local alias';

  return (
    <div
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs',
        kind === 'global' ? 'border-border/70 bg-muted/20' : 'border-border bg-background',
        className,
      )}
    >
      <span className="truncate font-medium">{value}</span>
      <div className="ml-0.5 flex items-center border-l border-border/60 pl-0.5">
        <CopyButton value={value} label={copyLabel} compact className="h-4 w-4 rounded-sm" />
      </div>
    </div>
  );
}
