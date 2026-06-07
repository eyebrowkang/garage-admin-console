/**
 * Axios instance for the embedded <FileBrowser/> — talks to the Bucket Backend
 * API scope handed in via props.backend. Kept here (not in lib/api.ts) so the
 * federated FileBrowser stays self-contained: it never imports the standalone
 * auth client.
 */
import axios, { type AxiosInstance } from 'axios';

/**
 * Default per-request deadline for control-plane calls (list / object / presign /
 * delete / copy / cors-status / multipart create|sign|parts|abort). Without it a
 * half-open connection leaves the request — and any progress UI waiting on it —
 * hung forever. Long-running data/finalize ops opt OUT with `timeout: 0`:
 * GET /download (streamed), POST /upload (proxy body), POST /multipart/complete
 * (server-side stitch, can take minutes).
 */
export const CONTROL_PLANE_TIMEOUT_MS = 30_000;

export interface BackendDescriptor {
  baseUrl: string;
  authToken: string;
  headers?: Record<string, string> | undefined;
}

export function createBackendHttp(backend: BackendDescriptor): AxiosInstance {
  return axios.create({
    baseURL: backend.baseUrl,
    headers: {
      Authorization: `Bearer ${backend.authToken}`,
      ...(backend.headers ?? {}),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: CONTROL_PLANE_TIMEOUT_MS,
  });
}
