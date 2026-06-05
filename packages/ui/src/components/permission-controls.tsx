import { cn } from '../lib/cn';
import { Badge } from './badge';
import { Checkbox } from './checkbox';

export interface PermissionFlags {
  read: boolean;
  write: boolean;
  owner: boolean;
}

const PERMISSION_ROWS: Array<[keyof PermissionFlags, string]> = [
  ['read', 'Read'],
  ['write', 'Write'],
  ['owner', 'Owner'],
];

/**
 * The read / write / owner checkbox trio shared by the bucket-key and
 * key-bucket permission dialogs. One source so the two never drift.
 */
export function PermissionCheckboxes({
  value,
  onChange,
  className,
}: {
  value: PermissionFlags;
  onChange: (next: PermissionFlags) => void;
  className?: string;
}) {
  return (
    <div className={cn('space-y-4', className)}>
      {PERMISSION_ROWS.map(([key, label]) => (
        <label key={key} className="flex items-center gap-3">
          <Checkbox
            checked={value[key]}
            onCheckedChange={(checked) => onChange({ ...value, [key]: !!checked })}
          />
          <span className="text-sm font-medium">{label}</span>
        </label>
      ))}
    </div>
  );
}

/** Binary Allow / Deny chooser — a segmented control reads clearer than a 2-item
 *  dropdown for a yes/no permission. Shared by the key create + edit dialogs. */
export function PermissionSegmented({
  value,
  onChange,
  ariaLabel = 'Permission',
}: {
  value: 'allow' | 'deny';
  onChange: (value: 'allow' | 'deny') => void;
  ariaLabel?: string;
}) {
  const seg = (option: 'allow' | 'deny', label: string) => (
    <button
      type="button"
      onClick={() => onChange(option)}
      aria-pressed={value === option}
      className={cn(
        'min-h-9 pointer-coarse:min-h-11 flex-1 rounded-md border px-3 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        value === option
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-2" role="group" aria-label={ariaLabel}>
      {seg('allow', 'Allow')}
      {seg('deny', 'Deny')}
    </div>
  );
}

/** A single permission flag as a compact pill: solid green when granted, a faint
 *  dashed outline when not — so "has it" vs "doesn't" reads at a glance. */
export function PermissionPill({ label, granted }: { label: string; granted: boolean }) {
  return granted ? (
    <Badge variant="success" className="px-2 py-0.5 text-[10px]">
      {label}
    </Badge>
  ) : (
    <span className="rounded border border-dashed px-2 py-0.5 text-[10px] text-muted-foreground/70">
      {label}
    </span>
  );
}
