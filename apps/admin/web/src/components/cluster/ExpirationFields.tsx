import { Input, Label } from '@garage-admin/ui';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

interface ExpirationFieldsProps {
  label?: string;
  dateValue: string;
  hourValue: string;
  minuteValue: string;
  neverExpires: boolean;
  onDateChange: (value: string) => void;
  onHourChange: (value: string) => void;
  onMinuteChange: (value: string) => void;
  onNeverExpiresChange: (value: boolean) => void;
  currentValue?: string;
  invalidMessage?: string;
  invalid?: boolean;
}

export function ExpirationFields({
  label = 'Expiration',
  dateValue,
  hourValue,
  minuteValue,
  neverExpires,
  onDateChange,
  onHourChange,
  onMinuteChange,
  onNeverExpiresChange,
  currentValue,
  invalidMessage = 'Expiration date/time is invalid.',
  invalid = false,
}: ExpirationFieldsProps) {
  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,96px)_minmax(0,96px)] sm:items-end">
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground">Date</div>
          <Input
            type="date"
            value={dateValue}
            onChange={(event) => onDateChange(event.target.value)}
            disabled={neverExpires}
          />
        </div>
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground">Hour</div>
          <Select value={hourValue} onValueChange={onHourChange} disabled={neverExpires}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="HH" />
            </SelectTrigger>
            <SelectContent>
              {HOUR_OPTIONS.map((hour) => (
                <SelectItem key={hour} value={hour}>
                  {hour}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground">Minute</div>
          <Select value={minuteValue} onValueChange={onMinuteChange} disabled={neverExpires}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="MM" />
            </SelectTrigger>
            <SelectContent>
              {MINUTE_OPTIONS.map((minute) => (
                <SelectItem key={minute} value={minute}>
                  {minute}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Current: {currentValue || 'Never'}</span>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <Checkbox checked={neverExpires} onCheckedChange={onNeverExpiresChange} />
        Never expires
      </label>
      {invalid && !neverExpires && <div className="text-xs text-destructive">{invalidMessage}</div>}
    </div>
  );
}
