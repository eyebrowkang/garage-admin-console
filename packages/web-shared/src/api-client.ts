import axios, { type AxiosInstance } from 'axios';

export interface ApiClientOptions {
  /** axios baseURL — usually '/api'. Apps read their own env and pass it in. */
  baseURL: string;
  /** localStorage key under which the JWT is stored (differs per product). */
  tokenKey: string;
  /**
   * Called on any 401/403 response. The app owns the policy — redirect to a
   * login route, clear the token, flip an auth flag, or ignore (e.g. proxied
   * sub-requests). Receives the axios error so callers can special-case.
   * The factory deliberately does NOT clear the token itself, so each app
   * keeps full control (admin skips clearing on proxied calls).
   */
  onUnauthorized?: (error: unknown) => void;
}

export interface ApiClient {
  api: AxiosInstance;
  readStoredToken: () => string | null;
  writeStoredToken: (token: string | null) => void;
  /**
   * Subscribe to token changes made through writeStoredToken (login, logout, or
   * an onUnauthorized clear); returns an unsubscribe fn. Pair with
   * readStoredToken in a `useSyncExternalStore` hook so a standalone app can
   * reactively flip to its login surface the moment the session dies — without a
   * full page reload. Cross-tab `storage` events are intentionally NOT wired in
   * (single-user, single-tab model); only writeStoredToken on this instance
   * notifies.
   */
  subscribe: (listener: () => void) => () => void;
}

/**
 * Build the standalone-mode axios instance + JWT helpers shared by both apps.
 * The instance attaches `Authorization: Bearer <token>` from localStorage on
 * every request and routes 401/403 responses to `onUnauthorized`.
 */
export function createApiClient({ baseURL, tokenKey, onUnauthorized }: ApiClientOptions): ApiClient {
  const listeners = new Set<() => void>();

  const readStoredToken = (): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(tokenKey);
    } catch {
      return null;
    }
  };

  const writeStoredToken = (token: string | null): void => {
    if (typeof window === 'undefined') return;
    try {
      if (token === null) window.localStorage.removeItem(tokenKey);
      else window.localStorage.setItem(tokenKey, token);
    } catch {
      // ignore quota / sandbox errors
    }
    // Notify after the write so reactive consumers (useSyncExternalStore) see
    // the new value on their next readStoredToken().
    for (const listener of listeners) listener();
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const api = axios.create({ baseURL });

  api.interceptors.request.use((config) => {
    const token = readStoredToken();
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  api.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        onUnauthorized?.(error);
      }
      return Promise.reject(error);
    },
  );

  return { api, readStoredToken, writeStoredToken, subscribe };
}
