/**
 * Dev-only axios adapter that serves the Bucket Backend API from in-memory
 * fixtures (see ./mockData). Installed by the FileBrowser playground so the
 * component can be exercised — including mobile layouts — with no BFF, no
 * Garage cluster, and no credentials. Never imported by the production app.
 */
import axios, {
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import {
  mockBuckets,
  mockConnections,
  mockCopy,
  mockDelete,
  mockGetObject,
  mockList,
  mockUpload,
} from './mockData';

const LATENCY_MS = 140;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STATUS_TEXT: Record<number, string> = { 200: 'OK', 206: 'Partial Content' };

function reply(
  config: InternalAxiosRequestConfig,
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): AxiosResponse {
  return {
    data,
    status,
    statusText: STATUS_TEXT[status] ?? 'Error',
    headers,
    config,
  } as AxiosResponse;
}

/** Read a request header case-insensitively from an axios config. */
function header(config: InternalAxiosRequestConfig, name: string): string | undefined {
  const h = config.headers as { get?: (n: string) => unknown; [k: string]: unknown } | undefined;
  if (!h) return undefined;
  const raw = typeof h.get === 'function' ? h.get(name) : (h[name] ?? h[name.toLowerCase()]);
  return typeof raw === 'string' ? raw : undefined;
}

/** Body is JSON-stringified by axios's transformRequest before the adapter runs. */
function jsonBody(config: InternalAxiosRequestConfig): Record<string, unknown> {
  if (typeof config.data === 'string') {
    try {
      return JSON.parse(config.data) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (config.data as Record<string, unknown>) ?? {};
}

/** Pull `prefix` + uploaded file names out of an upload FormData → full keys. */
function uploadKeys(config: InternalAxiosRequestConfig): string[] {
  const form = config.data;
  if (!(form instanceof FormData)) return [];
  let prefix = '';
  const names: string[] = [];
  for (const [field, value] of form.entries()) {
    if (field === 'prefix' && typeof value === 'string') prefix = value;
    else if (value instanceof File) names.push(value.name);
  }
  const base = prefix ? `${prefix.replace(/\/$/, '')}/` : '';
  return names.map((n) => `${base}${n}`);
}

const mockAdapter: AxiosAdapter = async (config) => {
  const path = (config.url ?? '').replace(/^\//, '').split('?')[0] ?? '';
  const params = (config.params ?? {}) as Record<string, string>;
  const method = (config.method ?? 'get').toUpperCase();
  await delay(LATENCY_MS);

  // Standalone app shell (full-app mock mode). Parameterized paths need pattern
  // matches, so handle them before the FileBrowser exact-match switch. The
  // FileBrowser's own requests are baseURL-relative ('list', 'object', …), so
  // they never collide with these 'connections/…' paths.
  if (method === 'POST' && path === 'auth/login') {
    return reply(config, { token: 'mock-jwt-token', refreshToken: 'mock-refresh-token' });
  }
  if (method === 'POST' && path === 'auth/refresh') {
    return reply(config, { token: 'mock-jwt-token', refreshToken: 'mock-refresh-token' });
  }
  if (method === 'GET' && path === 'connections') {
    return reply(config, mockConnections());
  }
  if (method === 'POST' && path === 'connections') {
    const now = new Date().toISOString();
    return reply(config, { ...jsonBody(config), id: 'conn-new', createdAt: now, updatedAt: now });
  }
  const connBuckets = /^connections\/([^/]+)\/buckets$/.exec(path);
  if (method === 'GET' && connBuckets) {
    return reply(config, { buckets: mockBuckets(connBuckets[1] ?? '') });
  }
  const connOne = /^connections\/([^/]+)$/.exec(path);
  if (method === 'PUT' && connOne) {
    return reply(config, { ...jsonBody(config), id: connOne[1] ?? '' });
  }
  if (method === 'DELETE' && connOne) {
    return reply(config, {});
  }

  switch (`${method} ${path}`) {
    case 'GET list':
      return reply(config, mockList(params.prefix ?? '', params.continuationToken));
    case 'GET object':
      return reply(config, mockGetObject(params.key ?? ''));
    case 'GET download': {
      const key = params.key ?? '';
      const text =
        `# ${key}\n\n` +
        `This is mock fixture content served by the FileBrowser dev playground.\n` +
        `No BFF, Garage cluster, or credentials are involved.\n\n` +
        `- key: ${key}\n- generated for: mobile UX iteration\n`;
      // TextPreview asks for an ArrayBuffer; useDownload asks for a Blob.
      const body =
        config.responseType === 'arraybuffer'
          ? new TextEncoder().encode(text).buffer
          : new Blob([text], { type: 'text/plain' });
      // Mimic a real backend: when a Range is requested, answer 206 and report
      // the object's *true* size in Content-Range so the text preview can tell
      // whether content was actually truncated (vs. a small file that fit).
      if (header(config, 'Range')) {
        const total =
          mockGetObject(key).size || (body instanceof ArrayBuffer ? body.byteLength : 0);
        return reply(config, body, 206, {
          'content-range': `bytes 0-${Math.max(0, total - 1)}/${total}`,
        });
      }
      return reply(config, body);
    }
    case 'POST presign': {
      const key = (jsonBody(config).key as string) ?? params.key ?? '';
      return reply(config, {
        url: `https://demo.example.com/${encodeURIComponent(key)}?X-Amz-Signature=mock`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });
    }
    case 'POST copy': {
      const { src, dst } = jsonBody(config) as { src?: string; dst?: string };
      if (src && dst) mockCopy(src, dst);
      return reply(config, { copied: dst });
    }
    case 'DELETE objects': {
      const keys = (jsonBody(config).keys as string[]) ?? [];
      return reply(config, mockDelete(keys));
    }
    case 'POST upload': {
      const keys = uploadKeys(config);
      mockUpload(keys);
      return reply(config, { uploaded: keys.map((key) => ({ key, etag: '"mock"', size: 0 })) });
    }
    default:
      return reply(config, {}, 200);
  }
};

let installed = false;

/** Route every axios request through the mock. Idempotent. */
export function installMockAdapter(): void {
  if (installed) return;
  installed = true;
  axios.defaults.adapter = mockAdapter;
}
