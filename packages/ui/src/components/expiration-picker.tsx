import { cn } from '../lib/cn';
import { Input } from './input';
import { Checkbox } from './checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export interface ExpirationPickerProps {
  date: string;
  hour: string;
  minute: string;
  neverExpires: boolean;
  onDateChange: (value: string) => void;
  onHourChange: (value: string) => void;
  onMinuteChange: (value: string) => void;
  onNeverExpiresChange: (value: boolean) => void;
  /** Optional "Current: …" hint rendered under the controls. */
  currentLabel?: string;
  /** Renders the invalid-date message when true. */
  invalid?: boolean;
  className?: string;
}

/**
 * A date + 24h time (HH:MM) + "never expires" control, single-sourced so the
 * key and admin-token edit dialogs share one layout and one mobile behavior
 * (date full-width then HH:MM, stacking above sm). The consumer owns the
 * "clear fields when never-expires" decision via `onNeverExpiresChange`.
 */
export function ExpirationPicker({
  date,
  hour,
  minute,
  neverExpires,
  onDateChange,
  onHourChange,
  onMinuteChange,
  onNeverExpiresChange,
  currentLabel,
  invalid,
  className,
}: ExpirationPickerProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Date</div>
          <Input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            disabled={neverExpires}
            className="w-full sm:w-[170px]"
          />
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Time</div>
          <div className="flex items-center gap-2">
            <Select value={hour} onValueChange={onHourChange} disabled={neverExpires}>
              <SelectTrigger className="w-[84px]">
                <SelectValue placeholder="HH" />
              </SelectTrigger>
              <SelectContent>
                {HOUR_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">:</span>
            <Select value={minute} onValueChange={onMinuteChange} disabled={neverExpires}>
              <SelectTrigger className="w-[84px]">
                <SelectValue placeholder="MM" />
              </SelectTrigger>
              <SelectContent>
                {MINUTE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      {currentLabel && <p className="text-xs text-muted-foreground">Current: {currentLabel}</p>}
      {invalid && <p className="text-xs text-destructive">Invalid date and time.</p>}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={neverExpires} onCheckedChange={onNeverExpiresChange} />
        Never expires
      </label>
    </div>
  );
}
