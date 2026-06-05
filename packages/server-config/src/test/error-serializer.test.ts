import { describe, expect, it } from 'vitest';

import { safeErrorSerializer } from '../index.js';

function makeAxiosError(overrides: Record<string, unknown> = {}): Error {
  const err = new Error('connect ECONNABORTED');
  return Object.assign(err, {
    name: 'AxiosError',
    code: 'ECONNABORTED',
    config: {
      url: '/v2/GetClusterStatus',
      method: 'get',
      baseURL: 'http://garage:3903',
      timeout: 30000,
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer super-secret-admin-token',
        'Accept-Encoding': 'gzip',
      },
      data: { password: 'should-not-appear' },
    },
    response: {
      status: 500,
      statusText: 'Internal Server Error',
      config: {
        headers: { Authorization: 'Bearer super-secret-admin-token' },
      },
      data: {
        error: 'something broke',
        secretAccessKey: 'GKsecret1234567890',
        secretAccessKeyDuplicate: 'GKsecret1234567890',
      },
    },
    ...overrides,
  });
}

describe('safeErrorSerializer', () => {
  it('preserves message, type, stack, and code', () => {
    const err = new Error('boom');
    Object.assign(err, { code: 'ERR_TEST' });
    const serialized = safeErrorSerializer(err);

    expect(serialized.message).toBe('boom');
    expect(serialized.type).toBe('Error');
    expect(serialized.stack).toContain('boom');
    expect(serialized.code).toBe('ERR_TEST');
  });

  it('redacts Authorization header in config.headers', () => {
    const serialized = safeErrorSerializer(makeAxiosError());
    const config = serialized.config as Record<string, unknown>;
    const headers = config.headers as Record<string, unknown>;

    expect(headers.Authorization).toBe('[REDACTED]');
    expect(headers.Accept).toBe('application/json');
    expect(headers['Accept-Encoding']).toBe('gzip');
  });

  it('redacts secretAccessKey in response.data', () => {
    const serialized = safeErrorSerializer(makeAxiosError());
    const response = serialized.response as Record<string, unknown>;
    const data = response.data as Record<string, unknown>;

    expect(data.secretAccessKey).toBe('[REDACTED]');
    expect(data.secretAccessKeyDuplicate).toBe('[REDACTED]');
    expect(data.error).toBe('something broke');
  });

  it('redacts Authorization inside nested response.config.headers', () => {
    const serialized = safeErrorSerializer(makeAxiosError());
    const response = serialized.response as Record<string, unknown>;
    const nestedConfig = response.config as Record<string, unknown>;
    const nestedHeaders = nestedConfig.headers as Record<string, unknown>;

    expect(nestedHeaders.Authorization).toBe('[REDACTED]');
  });

  it('redacts password fields', () => {
    const err = new Error('auth failed');
    Object.assign(err, { password: 'hunter2' });
    const serialized = safeErrorSerializer(err);

    expect(serialized.password).toBe('[REDACTED]');
  });

  it('redacts adminToken and metricToken fields', () => {
    const err = new Error('cluster error');
    Object.assign(err, { adminToken: 'enc:abc', metricToken: 'enc:def' });
    const serialized = safeErrorSerializer(err);

    expect(serialized.adminToken).toBe('[REDACTED]');
    expect(serialized.metricToken).toBe('[REDACTED]');
  });

  it('redacts cookie and set-cookie headers', () => {
    const err = new Error('bad request');
    Object.assign(err, {
      config: {
        headers: {
          Cookie: 'session=abc123',
          'Set-Cookie': 'session=abc123; HttpOnly',
          'Content-Type': 'application/json',
        },
      },
    });
    const serialized = safeErrorSerializer(err);
    const config = serialized.config as Record<string, unknown>;
    const headers = config.headers as Record<string, unknown>;

    expect(headers.Cookie).toBe('[REDACTED]');
    expect(headers['Set-Cookie']).toBe('[REDACTED]');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('handles plain errors without extra properties', () => {
    const err = new Error('simple error');
    const serialized = safeErrorSerializer(err);

    expect(serialized.message).toBe('simple error');
    expect(serialized.type).toBe('Error');
    expect(serialized.config).toBeUndefined();
    expect(serialized.response).toBeUndefined();
  });

  it('does not crash on deeply nested objects', () => {
    let nested: Record<string, unknown> = { Authorization: 'Bearer deep-secret' };
    for (let i = 0; i < 20; i++) {
      nested = { headers: nested };
    }
    const err = new Error('deep');
    Object.assign(err, { deep: nested });
    const serialized = safeErrorSerializer(err);

    expect(serialized.message).toBe('deep');
    // Should not throw, depth limit prevents infinite recursion
  });

  it('the full serialized output never contains the secret token string', () => {
    const secret = 'super-secret-admin-token';
    const serialized = safeErrorSerializer(makeAxiosError());
    const json = JSON.stringify(serialized);

    expect(json).not.toContain(secret);
    expect(json).not.toContain('GKsecret1234567890');
  });
});
