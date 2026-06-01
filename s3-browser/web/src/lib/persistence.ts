/**
 * Small, SSR-safe localStorage helpers. Every read falls back on a quota /
 * privacy-mode exception, and every write swallows the same so a full or
 * blocked store never crashes a render or an event handler.
 */

export function readPersistedBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writePersistedBool(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function readPersistedString(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writePersistedString(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function readPersistedNumber(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writePersistedNumber(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}
