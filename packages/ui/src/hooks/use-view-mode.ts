import { useCallback, useState } from 'react';

export type ViewMode = 'list' | 'card';

const DESKTOP_QUERY = '(min-width: 768px)';

function readStored(key: string): ViewMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === 'list' || raw === 'card' ? raw : null;
  } catch {
    return null;
  }
}

function defaultForViewport(): ViewMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'list';
  return window.matchMedia(DESKTOP_QUERY).matches ? 'list' : 'card';
}

/**
 * Remembered list/card preference for a fleet dashboard. The first visit falls
 * back to a viewport default (desktop → list, mobile → card); after that the
 * user's explicit choice is honoured via localStorage. SSR-safe — every storage
 * access is guarded so quota / privacy-mode failures never crash a render.
 */
export function useViewMode(storageKey: string): [ViewMode, (next: ViewMode) => void] {
  const [view, setView] = useState<ViewMode>(() => readStored(storageKey) ?? defaultForViewport());

  const update = useCallback(
    (next: ViewMode) => {
      setView(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        /* ignore quota / privacy-mode failures */
      }
    },
    [storageKey],
  );

  return [view, update];
}
