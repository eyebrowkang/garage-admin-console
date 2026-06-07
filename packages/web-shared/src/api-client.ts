import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

export interface ApiClientOptions {
  /** axios baseURL — usually '/api'. Apps read their own env and pass it in. */
  baseURL: string;
  /** localStorage key under which the access JWT is stored (differs per product). */
  tokenKey: string;
  /**
   * localStorage key for the long-lived refresh token. When set, the client
   * transparently exchanges an expired access token for a fresh one — on a 401,
   * and proactively shortly before the access token's own expiry — instead of
   * bouncing the user to login. Omit to keep the legacy single-token behavior
   * (every 401/403 goes straight to `onUnauthorized`).
   */
  refreshTokenKey?: string;
  /** Refresh endpoint path, relative to baseURL. Default '/auth/refresh'. */
  refreshPath?: string;
  /**
   * Called on a 401/403 the client could not recover from (no refresh token, or
   * the refresh itself failed). The app owns the policy — redirect to a login
   * route, clear the token, flip an auth flag, or ignore (e.g. proxied
   * sub-requests). Receives the axios error so callers can special-case.
   */
  onUnauthorized?: (error: unknown) => void;
}

export interface ApiClient {
  api: AxiosInstance;
  readStoredToken: () => string | null;
  writeStoredToken: (token: string | null) => void;
  /** Read/write the long-lived refresh token. No-ops when no refreshTokenKey is set. */
  readStoredRefreshToken: () => string | null;
  writeStoredRefreshToken: (token: string | null) => void;
  /**
   * Subscribe to access-token changes made through writeStoredToken (login,
   * logout, a refresh, or an onUnauthorized clear); returns an unsubscribe fn.
   * Pair with readStoredToken in a `useSyncExternalStore` hook so a standalone
   * app can reactively flip to its login surface the moment the session dies —
   * and so an embedded surface re-receives a freshly-refreshed token — without a
   * full page reload. Cross-tab `storage` events are intentionally NOT wired in
   * (single-user, single-tab model); only writeStoredToken on this instance
   * notifies.
   */
  subscribe: (listener: () => void) => () => void;
}

/** Seconds before access-token expiry at which the proactive refresh fires. */
const PROACTIVE_REFRESH_SKEW_S = 60;

/** Delay before retrying a refresh that failed transiently (offline / 5xx). */
const REFRESH_RETRY_MS = 30_000;

/**
 * Read a JWT's `exp` (epoch seconds) WITHOUT verifying the signature — used only
 * to schedule a proactive refresh, never for trust. Returns null if unreadable.
 */
function readJwtExp(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

/**
 * Distinguish a transient refresh failure (offline, timeout, 5xx — keep the
 * tokens and retry) from a terminal one (the refresh token was rejected — clear
 * the session). Anything not clearly transient is treated as terminal.
 */
function isTransientRefreshError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === undefined || status >= 500;
}

/** Outcome of a refresh attempt: a new access token, or a classified failure. */
interface RefreshOutcome {
  token: string | null;
  /** When token is null: true = session dead (tokens cleared); false = transient (retry scheduled). */
  terminal: boolean;
}

/**
 * Build the standalone-mode axios instance + JWT helpers shared by both apps.
 * The instance attaches `Authorization: Bearer <token>` from localStorage on
 * every request. When a refresh token is configured it transparently refreshes
 * an expired access token (reactively on a 401, and proactively before expiry)
 * and replays the failed request; otherwise a 401/403 routes to `onUnauthorized`.
 */
export function createApiClient({
  baseURL,
  tokenKey,
  refreshTokenKey,
  refreshPath = '/auth/refresh',
  onUnauthorized,
}: ApiClientOptions): ApiClient {
  const listeners = new Set<() => void>();

  // A single in-flight refresh shared by every request that 401s and by the
  // proactive timer, so a burst of concurrent failures triggers exactly one
  // /refresh round-trip.
  let refreshInFlight: Promise<RefreshOutcome> | null = null;
  let proactiveTimer: ReturnType<typeof setTimeout> | null = null;

  const readStorage = (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const writeStorage = (key: string, value: string | null): void => {
    if (typeof window === 'undefined') return;
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      // ignore quota / sandbox errors
    }
  };

  const readStoredToken = (): string | null => readStorage(tokenKey);

  const readStoredRefreshToken = (): string | null =>
    refreshTokenKey ? readStorage(refreshTokenKey) : null;

  const writeStoredRefreshToken = (token: string | null): void => {
    if (!refreshTokenKey) return;
    writeStorage(refreshTokenKey, token);
  };

  const writeStoredToken = (token: string | null): void => {
    writeStorage(tokenKey, token);
    // Re-arm (or cancel) the proactive refresh for the new token's lifetime.
    scheduleProactiveRefresh(token);
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

  // Drop both tokens and notify subscribers (via writeStoredToken) so reactive
  // route guards flip to login and the embedded surface stops using a dead token.
  function clearTokens(): void {
    writeStoredToken(null); // also cancels the proactive timer + notifies
    writeStoredRefreshToken(null);
  }

  // Re-arm the timer to retry a refresh after a transient failure (offline, a
  // server blip), so an installed PWA recovers on its own once it can reach the
  // BFF again — without logging the user out in the meantime.
  function scheduleRefreshRetry(): void {
    if (typeof window === 'undefined' || !refreshTokenKey) return;
    if (proactiveTimer) clearTimeout(proactiveTimer);
    proactiveTimer = setTimeout(() => {
      void runScheduledRefresh();
    }, REFRESH_RETRY_MS);
  }

  // Exchange the stored refresh token for a fresh pair. The token-clearing /
  // retry side effects live HERE so both callers — the 401 interceptor and the
  // timer — recover consistently; the OUTCOME is returned so each caller can
  // surface a terminal failure with the right error:
  //   { token }                       → success (writeStoredToken reschedules)
  //   { token: null, terminal: true }  → session dead (tokens already cleared)
  //   { token: null, terminal: false } → transient (a retry is scheduled)
  // Declared as a hoisted function so the helpers above and writeStoredToken/
  // scheduleProactiveRefresh can reference it.
  function refreshAccessToken(): Promise<RefreshOutcome> {
    if (refreshInFlight) return refreshInFlight;
    const refreshToken = readStoredRefreshToken();
    if (!refreshToken) return Promise.resolve({ token: null, terminal: true });

    refreshInFlight = (async (): Promise<RefreshOutcome> => {
      try {
        // A bare axios call (not `api`) so it skips the auth interceptors and
        // can't recurse into refresh on its own response.
        const res = await axios.post(`${baseURL}${refreshPath}`, { refreshToken });
        const data = res.data as { token?: string; refreshToken?: string };
        if (!data?.token) {
          clearTokens(); // 2xx but unusable → treat as terminal
          return { token: null, terminal: true };
        }
        if (data.refreshToken) writeStoredRefreshToken(data.refreshToken);
        writeStoredToken(data.token); // reschedules the proactive timer + notifies
        return { token: data.token, terminal: false };
      } catch (err) {
        if (isTransientRefreshError(err)) {
          scheduleRefreshRetry();
          return { token: null, terminal: false };
        }
        clearTokens(); // refresh token rejected → session dead
        return { token: null, terminal: true };
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  }

  // Timer-driven refresh (proactive + retry). A terminal failure here is the one
  // the 401 interceptor can't observe — tokens were already cleared inside
  // refreshAccessToken; also fire onUnauthorized so the Admin host's hard
  // redirect runs (its route guard reads the token non-reactively). There is no
  // request error in this path, so onUnauthorized receives undefined.
  async function runScheduledRefresh(): Promise<void> {
    const outcome = await refreshAccessToken();
    if (outcome.token === null && outcome.terminal) onUnauthorized?.(undefined);
  }

  function scheduleProactiveRefresh(token: string | null): void {
    if (proactiveTimer) {
      clearTimeout(proactiveTimer);
      proactiveTimer = null;
    }
    if (typeof window === 'undefined' || !token || !refreshTokenKey) return;
    const exp = readJwtExp(token);
    if (exp === null) return;
    const delayMs = (exp - PROACTIVE_REFRESH_SKEW_S) * 1000 - Date.now();
    // Never schedule in the past (fire ~immediately) and stay within the 32-bit
    // setTimeout ceiling that some engines clamp/reject.
    const safeDelay = Math.max(0, Math.min(delayMs, 2_147_483_647));
    proactiveTimer = setTimeout(() => {
      void runScheduledRefresh();
    }, safeDelay);
  }

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
    async (error: AxiosError) => {
      const status = error.response?.status;
      const original = error.config as
        | (InternalAxiosRequestConfig & { _retry?: boolean })
        | undefined;

      // On 401, attempt a one-shot refresh + replay before surfacing failure.
      // 403 is an authorization failure (a valid session lacking permission),
      // which refreshing can't fix — route it straight to onUnauthorized.
      if (status === 401 && original && !original._retry && readStoredRefreshToken()) {
        original._retry = true;
        const outcome = await refreshAccessToken();
        if (outcome.token) {
          original.headers = original.headers ?? {};
          (original.headers as Record<string, string>).Authorization = `Bearer ${outcome.token}`;
          return api(original);
        }
        // refreshAccessToken already cleared the session (terminal) or scheduled
        // a retry (transient). On a terminal failure, notify with the ORIGINAL
        // request error so the app's proxy-skip policy still applies; on a
        // transient one, just surface this request's failure (no wrongful logout).
        if (outcome.terminal) onUnauthorized?.(error);
        return Promise.reject(error);
      }

      if (status === 401 || status === 403) {
        onUnauthorized?.(error);
      }
      return Promise.reject(error);
    },
  );

  // Arm a proactive refresh for a token restored from a prior session (e.g. an
  // installed PWA reopened after the access token has already half-expired).
  scheduleProactiveRefresh(readStoredToken());

  return {
    api,
    readStoredToken,
    writeStoredToken,
    readStoredRefreshToken,
    writeStoredRefreshToken,
    subscribe,
  };
}
