import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '../api-client';

interface InterceptorHandle<T> {
  fulfilled: (value: T) => T;
  rejected: (error: unknown) => unknown;
}

function requestInterceptor(api: AxiosInstance): InterceptorHandle<InternalAxiosRequestConfig> {
  return (api.interceptors.request as unknown as { handlers: InterceptorHandle<InternalAxiosRequestConfig>[] })
    .handlers[0];
}

function responseInterceptor(api: AxiosInstance): InterceptorHandle<unknown> {
  return (api.interceptors.response as unknown as { handlers: InterceptorHandle<unknown>[] }).handlers[0];
}

const TOKEN_KEY = 'garage-test-token';

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('token storage helpers', () => {
  it('writes and reads the JWT under the configured key', () => {
    const { readStoredToken, writeStoredToken } = createApiClient({
      baseURL: '/api',
      tokenKey: TOKEN_KEY,
    });
    expect(readStoredToken()).toBeNull();
    writeStoredToken('jwt-123');
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('jwt-123');
    expect(readStoredToken()).toBe('jwt-123');
  });

  it('removes the token when writing null', () => {
    const { readStoredToken, writeStoredToken } = createApiClient({
      baseURL: '/api',
      tokenKey: TOKEN_KEY,
    });
    writeStoredToken('jwt-123');
    writeStoredToken(null);
    expect(readStoredToken()).toBeNull();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe('request interceptor', () => {
  it('attaches a Bearer header when a token is stored', () => {
    const client = createApiClient({ baseURL: '/api', tokenKey: TOKEN_KEY });
    client.writeStoredToken('jwt-xyz');
    const cfg = requestInterceptor(client.api).fulfilled({
      headers: {},
    } as InternalAxiosRequestConfig);
    expect((cfg.headers as Record<string, unknown>).Authorization).toBe('Bearer jwt-xyz');
  });

  it('leaves requests unauthenticated when no token is stored', () => {
    const client = createApiClient({ baseURL: '/api', tokenKey: TOKEN_KEY });
    const cfg = requestInterceptor(client.api).fulfilled({
      headers: {},
    } as InternalAxiosRequestConfig);
    expect((cfg.headers as Record<string, unknown>).Authorization).toBeUndefined();
  });
});

describe('response interceptor — 401/403 routing', () => {
  it.each([401, 403])('invokes onUnauthorized for status %d, then re-rejects', async (status) => {
    const onUnauthorized = vi.fn();
    const client = createApiClient({ baseURL: '/api', tokenKey: TOKEN_KEY, onUnauthorized });
    const err = { response: { status } };
    await expect(responseInterceptor(client.api).rejected(err)).rejects.toBe(err);
    expect(onUnauthorized).toHaveBeenCalledWith(err);
  });

  it.each([400, 404, 500])('does not invoke onUnauthorized for status %d', async (status) => {
    const onUnauthorized = vi.fn();
    const client = createApiClient({ baseURL: '/api', tokenKey: TOKEN_KEY, onUnauthorized });
    const err = { response: { status } };
    await expect(responseInterceptor(client.api).rejected(err)).rejects.toBe(err);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('tolerates a missing onUnauthorized callback', async () => {
    const client = createApiClient({ baseURL: '/api', tokenKey: TOKEN_KEY });
    const err = { response: { status: 401 } };
    await expect(responseInterceptor(client.api).rejected(err)).rejects.toBe(err);
  });
});

describe('token change subscription (reactive standalone auth)', () => {
  it('notifies subscribers when the token is written or cleared', () => {
    const { writeStoredToken, subscribe } = createApiClient({ baseURL: '/api', tokenKey: TOKEN_KEY });
    const listener = vi.fn();
    subscribe(listener);
    writeStoredToken('jwt-123');
    writeStoredToken(null);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stops notifying after unsubscribe', () => {
    const { writeStoredToken, subscribe } = createApiClient({ baseURL: '/api', tokenKey: TOKEN_KEY });
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    writeStoredToken('a');
    unsubscribe();
    writeStoredToken('b');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a 401 that clears the token notifies subscribers (the standalone redirect trigger)', async () => {
    const { api, readStoredToken, writeStoredToken, subscribe } = createApiClient({
      baseURL: '/api',
      tokenKey: TOKEN_KEY,
      onUnauthorized: () => writeStoredToken(null),
    });
    writeStoredToken('live-session');
    const listener = vi.fn();
    subscribe(listener);
    await expect(
      responseInterceptor(api).rejected({ response: { status: 401 } }),
    ).rejects.toBeTruthy();
    expect(readStoredToken()).toBeNull();
    expect(listener).toHaveBeenCalled();
  });
});
