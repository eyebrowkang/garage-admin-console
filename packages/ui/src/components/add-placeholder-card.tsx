import { Plus, type LucideIcon } from 'lucide-react';

import { cn } from '../lib/cn';

interface AddPlaceholderCardProps {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  className?: string;
}

/**
 * A dashed, low-emphasis "+ add another" cell that fills an otherwise empty grid
 * slot and gently nudges the user to scale out. Intended for card-view grids
 * only — it should not appear in list layouts.
 */
export function AddPlaceholderCard({
  label,
  onClick,
  icon: Icon = Plus,
  className,
}: AddPlaceholderCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex min-h-[7rem] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-transparent p-6 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary',
        className,
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 transition-colors group-hover:bg-primary/10">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
