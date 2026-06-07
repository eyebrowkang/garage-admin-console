import { describe, expect, it } from 'vitest';

import { CONTROL_PLANE_TIMEOUT_MS, createBackendHttp } from '../lib/backend-http';

describe('createBackendHttp', () => {
  it('applies a positive control-plane timeout while leaving body limits unbounded', () => {
    const http = createBackendHttp({
      baseUrl: 'https://bff.example/api/connections/c1/buckets/b',
      authToken: 't',
    });

    // The whole point of item A: control-plane calls now have a default deadline
    // so a half-open connection can't hang a request forever.
    expect(CONTROL_PLANE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(http.defaults.timeout).toBe(CONTROL_PLANE_TIMEOUT_MS);
    expect(http.defaults.baseURL).toBe('https://bff.example/api/connections/c1/buckets/b');
    // Uploads/downloads stream through this same client — bodies stay uncapped.
    expect(http.defaults.maxBodyLength).toBe(Infinity);
    expect(http.defaults.maxContentLength).toBe(Infinity);
  });

  it('attaches the bearer token and merges caller headers on outgoing requests', async () => {
    const http = createBackendHttp({
      baseUrl: 'https://bff.example',
      authToken: 'tok-123',
      headers: { 'X-Tenant': 'acme' },
    });

    let authorization: string | undefined;
    let tenant: string | undefined;
    http.defaults.adapter = async (config) => {
      authorization = config.headers.get('Authorization') as string | undefined;
      tenant = config.headers.get('X-Tenant') as string | undefined;
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };

    await http.get('/ping');
    expect(authorization).toBe('Bearer tok-123');
    expect(tenant).toBe('acme');
  });
});
