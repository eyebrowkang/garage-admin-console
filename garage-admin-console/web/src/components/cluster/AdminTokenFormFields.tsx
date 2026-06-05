import type { Dispatch, SetStateAction } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  ExpirationPicker,
  Input,
  Label,
  Textarea,
  cn,
} from '@garage/ui';
import {
  parseScope,
  tokenExpirationInvalid,
  tokenFormScopeWarning,
  type AdminTokenFormState,
} from './admin-token-form';

/** Binary Full / Custom chooser — a segmented control reads clearer than a
 *  2-item dropdown (matches the key dialog's permission segmented). */
function ScopeModeSegmented({
  value,
  onChange,
}: {
  value: 'full' | 'custom';
  onChange: (value: 'full' | 'custom') => void;
}) {
  const seg = (option: 'full' | 'custom', label: string) => (
    <button
      type="button"
      onClick={() => onChange(option)}
      aria-pressed={value === option}
      className={cn(
        'min-h-9 flex-1 rounded-md border px-3 text-sm font-medium transition-colors',
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
    <div className="flex gap-2" role="group" aria-label="Token scope">
      {seg('full', 'Full access')}
      {seg('custom', 'Custom')}
    </div>
  );
}

/** The create + edit admin-token form body (controlled). The parent owns the
 *  dialog shell, submit button, and mutation; this renders the fields only. */
export function AdminTokenFormFields({
  value,
  onChange,
}: {
  value: AdminTokenFormState;
  onChange: Dispatch<SetStateAction<AdminTokenFormState>>;
}) {
  // Functional update: the ExpirationPicker fires several field changes in one
  // click (a preset/Custom seeds neverExpires + date + hour + minute). Spreading
  // a stale `value` on each call would let every update but the last get clobbered
  // — update from `prev` so they all land.
  const set = (patch: Partial<AdminTokenFormState>) => onChange((prev) => ({ ...prev, ...patch }));
  const scopeCount = parseScope(value).length;
  const warning = tokenFormScopeWarning(value);
  const expirationInvalid = tokenExpirationInvalid(value) && !value.neverExpires;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="token-name">Token name</Label>
        <Input
          id="token-name"
          autoFocus
          value={value.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="my-admin-token"
        />
      </div>

      <div className="space-y-2">
        <Label>Scope</Label>
        <ScopeModeSegmented value={value.scopeMode} onChange={(scopeMode) => set({ scopeMode })} />
        <p className="text-xs text-muted-foreground">
          {value.scopeMode === 'full'
            ? 'Can call every admin endpoint (*).'
            : 'Limit the token to specific admin API endpoints.'}
        </p>
      </div>

      {value.scopeMode === 'custom' && (
        <div className="space-y-2">
          <Label htmlFor="token-scope">Allowed endpoints</Label>
          <Textarea
            id="token-scope"
            className="min-h-[120px] resize-y font-mono text-xs"
            placeholder={'GetClusterStatus\nListBuckets\nGetBucketInfo'}
            value={value.scopeInput}
            onChange={(e) => set({ scopeInput: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            One endpoint per line (or comma-separated).
            {scopeCount > 0 && (
              <>
                {' · '}
                <span className="text-foreground">
                  {scopeCount} endpoint{scopeCount === 1 ? '' : 's'}
                </span>
              </>
            )}
          </p>
        </div>
      )}

      {warning && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>High-privilege scope</AlertTitle>
          <AlertDescription>
            Full access, or <code>CreateAdminToken</code>/<code>UpdateAdminToken</code>, lets the
            holder escalate privileges. Make sure that&rsquo;s intended.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label>Expiration</Label>
        <ExpirationPicker
          date={value.expirationDate}
          hour={value.expirationHour}
          minute={value.expirationMinute}
          neverExpires={value.neverExpires}
          onDateChange={(expirationDate) => set({ expirationDate })}
          onHourChange={(expirationHour) => set({ expirationHour })}
          onMinuteChange={(expirationMinute) => set({ expirationMinute })}
          onNeverExpiresChange={(neverExpires) => set({ neverExpires })}
          invalid={expirationInvalid}
        />
      </div>
    </div>
  );
}
