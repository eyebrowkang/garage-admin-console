import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
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
const REFRESH_KEY = 'garage-test-refresh';

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

describe('refresh token storage', () => {
  it('reads/writes the refresh token under refreshTokenKey', () => {
    const client = createApiClient({
      baseURL: '/api',
      tokenKey: TOKEN_KEY,
      refreshTokenKey: REFRESH_KEY,
    });
    expect(client.readStoredRefreshToken()).toBeNull();
    client.writeStoredRefreshToken('r-1');
    expect(window.localStorage.getItem(REFRESH_KEY)).toBe('r-1');
    expect(client.readStoredRefreshToken()).toBe('r-1');
    client.writeStoredRefreshToken(null);
    expect(client.readStoredRefreshToken()).toBeNull();
  });

  it('is a no-op when no refreshTokenKey is configured', () => {
    const client = createApiClient({ baseURL: '/api', tokenKey: TOKEN_KEY });
    client.writeStoredRefreshToken('r-1');
    expect(client.readStoredRefreshToken()).toBeNull();
  });
});

describe('automatic refresh on 401', () => {
  it('refreshes the access token and replays the original request', async () => {
    const postSpy = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { token: 'new-access', refreshToken: 'new-refresh' } });
    const client = createApiClient({
      baseURL: '/api',
      tokenKey: TOKEN_KEY,
      refreshTokenKey: REFRESH_KEY,
    });
    client.writeStoredToken('old-access');
    client.writeStoredRefreshToken('old-refresh');
    // Stub the replay so it resolves without touching the network.
    client.api.defaults.adapter = vi
      .fn()
      .mockResolvedValue({ data: 'ok', status: 200, statusText: 'OK', headers: {}, config: {} });

    const original = { headers: {} as Record<string, string> };
    const result = await responseInterceptor(client.api).rejected({
      response: { status: 401 },
      config: original,
    });

    expect(postSpy).toHaveBeenCalledWith('/api/auth/refresh', { refreshToken: 'old-refresh' });
    expect(client.readStoredToken()).toBe('new-access');
    expect(client.readStoredRefreshToken()).toBe('new-refresh');
    expect((result as { data: string }).data).toBe('ok');
    expect(original.headers.Authorization).toBe('Bearer new-access');
    postSpy.mockRestore();
  });

  it('clears both tokens and calls onUnauthorized when refresh fails', async () => {
    const postSpy = vi.spyOn(axios, 'post').mockRejectedValue(new Error('refresh failed'));
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseURL: '/api',
      tokenKey: TOKEN_KEY,
      refreshTokenKey: REFRESH_KEY,
      onUnauthorized,
    });
    client.writeStoredToken('old-access');
    client.writeStoredRefreshToken('old-refresh');

    const err = { response: { status: 401 }, config: { headers: {} } };
    await expect(responseInterceptor(client.api).rejected(err)).rejects.toBe(err);

    expect(client.readStoredToken()).toBeNull();
    expect(client.readStoredRefreshToken()).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledWith(err);
    postSpy.mockRestore();
  });

  it('does not attempt a refresh without a stored refresh token', async () => {
    const postSpy = vi.spyOn(axios, 'post');
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseURL: '/api',
      tokenKey: TOKEN_KEY,
      refreshTokenKey: REFRESH_KEY,
      onUnauthorized,
    });
    client.writeStoredToken('old-access'); // no refresh token stored
    const err = { response: { status: 401 }, config: { headers: {} } };
    await expect(responseInterceptor(client.api).rejected(err)).rejects.toBe(err);
    expect(postSpy).not.toHaveBeenCalled();
    expect(onUnauthorized).toHaveBeenCalledWith(err);
    postSpy.mockRestore();
  });
});

describe('proactive refresh before expiry', () => {
  function fakeJwt(expInSeconds: number): string {
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expInSeconds }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return `h.${payload}.s`;
  }

  it('refreshes shortly before the access token expires', async () => {
    vi.useFakeTimers();
    try {
      const postSpy = vi
        .spyOn(axios, 'post')
        .mockResolvedValue({ data: { token: 'refreshed', refreshToken: 'r-2' } });
      const client = createApiClient({
        baseURL: '/api',
        tokenKey: TOKEN_KEY,
        refreshTokenKey: REFRESH_KEY,
      });
      client.writeStoredRefreshToken('r-1');
      client.writeStoredToken(fakeJwt(120)); // expires in 120s → refresh ~60s in

      await vi.advanceTimersByTimeAsync(61_000);

      expect(postSpy).toHaveBeenCalledWith('/api/auth/refresh', { refreshToken: 'r-1' });
      expect(client.readStoredToken()).toBe('refreshed');
      postSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});
