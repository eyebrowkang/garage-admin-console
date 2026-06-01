import { createApiClient } from '@garage/web-shared';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const client = createApiClient({
  baseURL: API_BASE_URL,
  tokenKey: 'garage-admin.jwt',
  onUnauthorized: (error) => {
    // Proxy sub-requests can 401/403 without the session being dead — leave
    // those to the caller. For everything else, drop the token and bounce to
    // the login screen.
    const url = (error as { config?: { url?: string } })?.config?.url;
    if (typeof url === 'string' && url.includes('/proxy/')) return;
    client.writeStoredToken(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },
});

export const { api, readStoredToken, writeStoredToken } = client;

export function proxyPath(clusterId: string, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `/proxy/${clusterId}${normalized}`;
}
