import type { AdminTokenInfo, CreateAdminTokenRequest } from '@/types/garage';

/**
 * Shared state + logic for the admin-token create and edit forms, so the two
 * (one on the list page, one on the detail page) can't drift apart. The UI lives
 * in AdminTokenFormFields.tsx; this module is pure (no JSX) so it can be imported
 * by both without tripping the react-refresh "only export components" rule.
 */
export interface AdminTokenFormState {
  name: string;
  scopeMode: 'full' | 'custom';
  scopeInput: string;
  expirationDate: string;
  expirationHour: string;
  expirationMinute: string;
  neverExpires: boolean;
}

export const EMPTY_TOKEN_FORM: AdminTokenFormState = {
  name: '',
  scopeMode: 'full',
  scopeInput: '',
  expirationDate: '',
  expirationHour: '00',
  expirationMinute: '00',
  neverExpires: true,
};

function toDateParts(value?: string | null) {
  if (!value) return { date: '', hour: '00', minute: '00' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: '', hour: '00', minute: '00' };
  const pad = (num: number) => String(num).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    hour: pad(date.getHours()),
    minute: pad(date.getMinutes()),
  };
}

/** Seed the form from an existing token (edit). */
export function tokenFormFromInfo(token: AdminTokenInfo): AdminTokenFormState {
  const isFull = token.scope.includes('*');
  const parts = toDateParts(token.expiration);
  return {
    name: token.name,
    scopeMode: isFull ? 'full' : 'custom',
    scopeInput: isFull ? '' : token.scope.join('\n'),
    expirationDate: parts.date,
    expirationHour: parts.hour,
    expirationMinute: parts.minute,
    neverExpires: !token.expiration,
  };
}

/** Resolve the scope to the array Garage expects (`['*']` for full access). */
export function parseScope(state: AdminTokenFormState): string[] {
  if (state.scopeMode === 'full') return ['*'];
  return state.scopeInput
    .split(/[,\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** True when the scope grants full access or token-management (privilege escalation). */
export function tokenFormScopeWarning(state: AdminTokenFormState): boolean {
  if (state.scopeMode === 'full') return true;
  return parseScope(state).some(
    (scope) => scope === '*' || scope === 'CreateAdminToken' || scope === 'UpdateAdminToken',
  );
}

function expirationDateValue(state: AdminTokenFormState): Date | null {
  if (!state.expirationDate) return null;
  return new Date(
    `${state.expirationDate}T${state.expirationHour}:${state.expirationMinute}:00`,
  );
}

export function tokenExpirationIso(state: AdminTokenFormState): string | null {
  const value = expirationDateValue(state);
  return value && !Number.isNaN(value.getTime()) ? value.toISOString() : null;
}

export function tokenExpirationInvalid(state: AdminTokenFormState): boolean {
  return Boolean(state.expirationDate) && tokenExpirationIso(state) === null;
}

/** Returns an error message, or null when the form is ready to submit. */
export function validateTokenForm(state: AdminTokenFormState): string | null {
  if (!state.name.trim()) return 'Token name is required.';
  if (state.scopeMode === 'custom' && parseScope(state).length === 0) {
    return 'Provide at least one scope entry or select full access.';
  }
  if (tokenExpirationInvalid(state)) return 'Expiration date/time is invalid.';
  if (!state.neverExpires && !tokenExpirationIso(state)) {
    return 'Set an expiration date/time or enable never expires.';
  }
  return null;
}

export function buildTokenPayload(state: AdminTokenFormState): CreateAdminTokenRequest {
  const iso = tokenExpirationIso(state);
  return {
    name: state.name.trim(),
    scope: parseScope(state),
    ...(state.neverExpires
      ? { neverExpires: true, expiration: null }
      : iso
        ? { expiration: iso }
        : {}),
  };
}
