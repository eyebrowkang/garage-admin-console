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

  it('issues a verifiable HS256 token for the correct password', async () => {
    const res = await login({ password: PASSWORD });
    expect(res.status).toBe(200);

    const { token } = (await res.json()) as { token: string };
    const decoded = jwt.verify(token, SECRET, { algorithms: ['HS256'] }) as { role?: string };
    expect(decoded.role).toBe('admin');

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
});
