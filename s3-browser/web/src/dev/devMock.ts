/**
 * Dev-only full-app API mock toggle. With `?mock=1` (persisted to localStorage)
 * the whole standalone app — auth, connections, buckets, and the FileBrowser —
 * runs against in-memory fixtures, no BFF / Garage / credentials required.
 * `?mock=0` turns it back off. Never reaches production (DEV-gated at the call
 * site in main.tsx, so the dynamic import is dead-code-eliminated).
 */
const FLAG = 's3b.mockApi';

export async function maybeInstallMockApi(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mock') === '1') localStorage.setItem(FLAG, '1');
  if (params.get('mock') === '0') localStorage.removeItem(FLAG);
  if (localStorage.getItem(FLAG) !== '1') return;

  const { installMockAdapter } = await import('./mockAdapter');
  installMockAdapter();
}
