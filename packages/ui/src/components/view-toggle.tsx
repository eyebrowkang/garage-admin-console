import { LayoutGrid, List, type LucideIcon } from 'lucide-react';

import { cn } from '../lib/cn';
import type { ViewMode } from '../hooks/use-view-mode';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
  className?: string;
}

const OPTIONS: { value: ViewMode; label: string; Icon: LucideIcon }[] = [
  { value: 'list', label: 'List view', Icon: List },
  { value: 'card', label: 'Card view', Icon: LayoutGrid },
];

/** Two-segment list/card layout switch. Controlled — pairs with `useViewMode`. */
export function ViewToggle({ value, onChange, className }: ViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="Layout"
      className={cn('inline-flex items-center gap-0.5 rounded-md border bg-card p-0.5', className)}
    >
      {OPTIONS.map(({ value: optionValue, label, Icon }) => {
        const active = value === optionValue;
        return (
          <button
            key={optionValue}
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={() => onChange(optionValue)}
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-[0.3rem] transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
