/**
 * Dev-only axios adapter that serves the Bucket Backend API from in-memory
 * fixtures (see ./mockData). Installed by the FileBrowser playground so the
 * component can be exercised — including mobile layouts — with no BFF, no
 * Garage cluster, and no credentials. Never imported by the production app.
 */
import axios, { type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { mockCopy, mockDelete, mockGetObject, mockList, mockUpload } from './mockData';

const LATENCY_MS = 140;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function reply(config: InternalAxiosRequestConfig, data: unknown, status = 200): AxiosResponse {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {},
    config,
  } as AxiosResponse;
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
  const path = (config.url ?? '').replace(/^\//, '').split('?')[0];
  const params = (config.params ?? {}) as Record<string, string>;
  await delay(LATENCY_MS);

  switch (`${(config.method ?? 'get').toUpperCase()} ${path}`) {
    case 'GET list':
      return reply(config, mockList(params.prefix ?? '', params.continuationToken));
    case 'GET object':
      return reply(config, mockGetObject(params.key ?? ''));
    case 'GET download': {
      const text =
        `# ${params.key}\n\n` +
        `This is mock fixture content served by the FileBrowser dev playground.\n` +
        `No BFF, Garage cluster, or credentials are involved.\n\n` +
        `- key: ${params.key}\n- generated for: mobile UX iteration\n`;
      // TextPreview asks for an ArrayBuffer; useDownload asks for a Blob.
      return reply(
        config,
        config.responseType === 'arraybuffer'
          ? new TextEncoder().encode(text).buffer
          : new Blob([text], { type: 'text/plain' }),
      );
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
