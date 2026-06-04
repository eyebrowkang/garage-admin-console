import { useState } from 'react';

import { cn } from '../lib/cn';
import { Input } from './input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

const pad = (n: number) => String(n).padStart(2, '0');

export interface ExpirationPickerProps {
  date: string;
  hour: string;
  minute: string;
  neverExpires: boolean;
  onDateChange: (value: string) => void;
  onHourChange: (value: string) => void;
  onMinuteChange: (value: string) => void;
  onNeverExpiresChange: (value: boolean) => void;
  /** Show a "Default" preset (no expiration override). Use on create, not edit. */
  allowDefault?: boolean;
  /** Quick-pick day offsets for the presets. Defaults to 7 / 30 / 90. */
  presetDays?: number[];
  /** Optional "Current: …" hint rendered under the controls. */
  currentLabel?: string;
  /** Renders the invalid-date message when true. */
  invalid?: boolean;
  className?: string;
}

type Mode = 'default' | 'preset' | 'custom' | 'never';

/**
 * Expiration control: quick presets (Default / N days / Custom / Never) backed
 * by a controlled date + 24h time. Presets compute `now + N days` and write
 * through the same date/hour/minute props; "Custom" reveals the fields; "Never"
 * drives `neverExpires`; "Default" (create only) clears the override. The chip
 * selection is internal UI state; the value of record stays the controlled
 * date/hour/minute/neverExpires props — so the key create dialog and the key /
 * admin-token edit dialogs all share one control and one behavior.
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
  allowDefault = false,
  presetDays = [7, 30, 90],
  currentLabel,
  invalid,
  className,
}: ExpirationPickerProps) {
  const [mode, setMode] = useState<Mode>(() => {
    if (neverExpires) return 'never';
    if (!date) return allowDefault ? 'default' : 'custom';
    return 'custom';
  });
  const [presetDay, setPresetDay] = useState<number>(presetDays[0] ?? 7);

  const selectPreset = (days: number) => {
    const target = new Date(Date.now() + days * 86_400_000);
    onNeverExpiresChange(false);
    onDateChange(`${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`);
    onHourChange(pad(target.getHours()));
    onMinuteChange(pad(target.getMinutes()));
    setPresetDay(days);
    setMode('preset');
  };

  const selectDefault = () => {
    onNeverExpiresChange(false);
    onDateChange('');
    setMode('default');
  };

  const selectCustom = () => {
    onNeverExpiresChange(false);
    setMode('custom');
  };

  const selectNever = () => {
    onNeverExpiresChange(true);
    setMode('never');
  };

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-9 shrink-0 items-center rounded-full border px-3 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {allowDefault && chip(mode === 'default', 'Default', selectDefault)}
        {presetDays.map((days) =>
          chip(mode === 'preset' && presetDay === days, `${days} days`, () => selectPreset(days)),
        )}
        {chip(mode === 'custom', 'Custom', selectCustom)}
        {chip(mode === 'never', 'Never', selectNever)}
      </div>

      {mode === 'custom' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Date</div>
            <Input
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              className="w-full sm:w-[170px]"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Time</div>
            <div className="flex items-center gap-2">
              <Select value={hour} onValueChange={onHourChange}>
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
              <Select value={minute} onValueChange={onMinuteChange}>
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
      )}

      {mode === 'preset' && date && (
        <p className="text-xs text-muted-foreground">
          Expires {date} at {hour}:{minute}
        </p>
      )}
      {mode === 'default' && (
        <p className="text-xs text-muted-foreground">
          Uses the cluster&rsquo;s default expiration policy.
        </p>
      )}
      {currentLabel && <p className="text-xs text-muted-foreground">Current: {currentLabel}</p>}
      {invalid && <p className="text-xs text-destructive">Invalid date and time.</p>}
    </div>
  );
}
