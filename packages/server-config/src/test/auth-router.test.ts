import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import express from 'express';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAuthRouter } from '../index.js';

const SECRET = 'unit-secret';
const PASSWORD = 'correct horse battery staple';

// Exercise the router over a real (loopback) HTTP round-trip rather than a mock
// req/res, so body parsing, status codes, and the issued token are all covered
// the way a BFF actually mounts it. No supertest dependency needed.
describe('createAuthRouter', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(createAuthRouter({ adminPassword: PASSWORD, jwtSecret: SECRET }));
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  function login(body: unknown) {
    return fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function refresh(body: unknown) {
    return fetch(`${baseUrl}/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('issues a verifiable HS256 access + refresh pair for the correct password', async () => {
    const res = await login({ password: PASSWORD });
    expect(res.status).toBe(200);

    const { token, refreshToken } = (await res.json()) as {
      token: string;
      refreshToken: string;
    };

    const access = jwt.verify(token, SECRET, { algorithms: ['HS256'] }) as {
      role?: string;
      type?: string;
    };
    expect(access.role).toBe('admin');
    expect(access.type).toBe('access');

    const decodedRefresh = jwt.verify(refreshToken, SECRET, { algorithms: ['HS256'] }) as {
      type?: string;
    };
    expect(decodedRefresh.type).toBe('refresh');

    // The signed token must declare HS256 in its header (pinned, not defaulted).
    const header = JSON.parse(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString());
    expect(header.alg).toBe('HS256');
  });

  it('rejects a wrong password with 401, regardless of length', async () => {
    expect((await login({ password: 'nope' })).status).toBe(401);
    expect((await login({ password: `${PASSWORD}x` })).status).toBe(401);
  });

  it('rejects a malformed body with 400', async () => {
    expect((await login({})).status).toBe(400);
    expect((await login({ password: 123 })).status).toBe(400);
  });

  it('exchanges a valid refresh token for a fresh access + refresh pair', async () => {
    const { refreshToken } = (await (await login({ password: PASSWORD })).json()) as {
      refreshToken: string;
    };

    const res = await refresh({ refreshToken });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { token: string; refreshToken: string };
    const access = jwt.verify(body.token, SECRET, { algorithms: ['HS256'] }) as { type?: string };
    expect(access.type).toBe('access');
    const next = jwt.verify(body.refreshToken, SECRET, { algorithms: ['HS256'] }) as {
      type?: string;
    };
    expect(next.type).toBe('refresh');
  });

  it('rejects an access token presented at /refresh with 401', async () => {
    const { token } = (await (await login({ password: PASSWORD })).json()) as { token: string };
    expect((await refresh({ refreshToken: token })).status).toBe(401);
  });

  it('rejects a refresh token signed with a different secret with 401', async () => {
    const forged = jwt.sign({ role: 'admin', type: 'refresh' }, 'wrong-secret');
    expect((await refresh({ refreshToken: forged })).status).toBe(401);
  });

  it('rejects a malformed /refresh body with 400', async () => {
    expect((await refresh({})).status).toBe(400);
    expect((await refresh({ refreshToken: 123 })).status).toBe(400);
  });
});
