/**
 * Standalone-mode axios instance.
 *
 * Used ONLY by the standalone composition (Login, Connections, BucketList,
 * the modals when invoked from the standalone UI). The embedded
 * <FileBrowser/> builds its OWN axios from props.backend — it never
 * imports this module so it stays self-contained when federated.
 */
import { useSyncExternalStore } from 'react';
import { createApiClient } from '@garage/web-shared';

export const API_BASE_URL = import.meta.env.PUBLIC_API_BASE_URL || '/api';

const {
  api,
  readStoredToken,
  writeStoredToken,
  readStoredRefreshToken,
  writeStoredRefreshToken,
  subscribe,
} = createApiClient({
  baseURL: API_BASE_URL,
  tokenKey: 's3-browser.jwt',
  refreshTokenKey: 's3-browser.refresh',
  // The standalone composition controls its own auth surface reactively (a
  // render flag, not a hard redirect): clearing the token here notifies
  // subscribers, so the ProtectedShell guard re-renders and routes to /login.
  // Reached only after an automatic token refresh has already failed.
  onUnauthorized: () => {
    writeStoredToken(null);
    writeStoredRefreshToken(null);
  },
});

export { api, readStoredToken, writeStoredToken, readStoredRefreshToken, writeStoredRefreshToken };

/**
 * Reactive view of the stored JWT for the standalone composition. Re-renders the
 * caller whenever the token changes (login, sign-out, a 401 clearing it, or a
 * background refresh rotating it), so the route guard can flip to the login
 * surface — and the embedded FileBrowser re-receives the freshest token —
 * without a full page reload.
 */
export function useAuthToken(): string | null {
  return useSyncExternalStore(subscribe, readStoredToken, () => null);
}

/**
 * Build the per-bucket backend the embedded FileBrowser expects.
 *
 * The access token is passed in (sourced reactively via useAuthToken at the
 * call site) rather than read here, so a background refresh that rotates the
 * token re-renders the host and hands the FileBrowser a current token. In
 * standalone mode the FileBrowser receives this object; in embedded mode the
 * Admin Console host constructs its own pointing at the Admin BFF's bucket
 * scope. The FileBrowser stays agnostic either way.
 */
export function buildBucketBackend(connectionId: string, bucket: string, authToken: string) {
  return {
    baseUrl: `${API_BASE_URL}/connections/${connectionId}/buckets/${bucket}`,
    authToken,
  };
}
