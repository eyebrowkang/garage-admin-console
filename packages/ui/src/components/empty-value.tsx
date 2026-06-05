import { cn } from '../lib/cn';

/** A deliberately low-emphasis placeholder for an empty cell value — reads as
 * "no value here" without the ambiguity of a bare dash. */
export function EmptyValue({ label = 'None', className }: { label?: string; className?: string }) {
  return <span className={cn('text-sm text-muted-foreground/60', className)}>{label}</span>;
}
