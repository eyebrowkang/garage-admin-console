/**
 * Standalone-mode axios instance.
 *
 * Used ONLY by the standalone composition (Login, Connections, BucketList,
 * the modals when invoked from the standalone UI). The embedded
 * <FileBrowser/> builds its OWN axios from props.backend — it never
 * imports this module so it stays self-contained when federated.
 */
import axios, { type AxiosInstance } from 'axios';

const TOKEN_STORAGE_KEY = 's3-browser.jwt';

export function readStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token === null) window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    else window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // ignore quota / sandbox errors
  }
}

const BASE_URL = '/api';

export const api: AxiosInstance = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((cfg) => {
  const token = readStoredToken();
  if (token) {
    cfg.headers = cfg.headers ?? {};
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    if (status === 401 || status === 403) {
      writeStoredToken(null);
      // Caller decides what to do; we don't redirect here because the
      // standalone composition controls its own auth surface.
    }
    return Promise.reject(err);
  },
);

/**
 * Build the per-bucket backend the embedded FileBrowser expects.
 *
 * In standalone mode the FileBrowser receives this object; in embedded
 * mode the Admin Console host constructs its own pointing at the Admin
 * BFF's bucket scope. The FileBrowser stays agnostic either way.
 */
export function buildBucketBackend(connectionId: string, bucket: string) {
  return {
    baseUrl: `${BASE_URL}/connections/${connectionId}/buckets/${bucket}`,
    authToken: readStoredToken() ?? '',
  };
}
