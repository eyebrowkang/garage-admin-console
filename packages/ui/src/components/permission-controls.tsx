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
