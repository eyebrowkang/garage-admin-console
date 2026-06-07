import { useSyncExternalStore } from 'react';
import { createApiClient } from '@garage/web-shared';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const client = createApiClient({
  baseURL: API_BASE_URL,
  tokenKey: 'garage-admin.jwt',
  refreshTokenKey: 'garage-admin.refresh',
  onUnauthorized: (error) => {
    // Proxy sub-requests can 401/403 without the session being dead — leave
    // those to the caller. For everything else (reached only after an
    // automatic token refresh has already failed), drop both tokens and bounce
    // to the login screen.
    const url = (error as { config?: { url?: string } })?.config?.url;
    if (typeof url === 'string' && url.includes('/proxy/')) return;
    client.writeStoredToken(null);
    client.writeStoredRefreshToken(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },
});

export const {
  api,
  readStoredToken,
  writeStoredToken,
  readStoredRefreshToken,
  writeStoredRefreshToken,
  subscribe,
} = client;

/**
 * Reactive view of the stored access JWT. Re-renders the caller whenever the
 * token changes — login, sign-out, a 401 clearing it, or a background refresh
 * rotating it — so the embedded FileBrowser re-receives the freshest token
 * (its axios is keyed on backend.authToken) without a reload.
 */
export function useAuthToken(): string | null {
  return useSyncExternalStore(subscribe, readStoredToken, () => null);
}

export function proxyPath(clusterId: string, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `/proxy/${clusterId}${normalized}`;
}
