import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from '../db/migrate.js';
import { app } from '../app.js';

beforeAll(async () => {
  // GET /api/clusters (used by the end-to-end auth check) needs the schema.
  await runMigrations();
});

describe('POST /api/auth/login', () => {
  it('returns a usable JWT for the correct password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: process.env.ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET as string) as {
      role?: string;
    };
    expect(decoded.role).toBe('admin');
  });

  it('rejects the wrong password with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: 'definitely-wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  it('rejects a malformed body (no password) with 400', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

describe('auth enforcement', () => {
  it('rejects protected routes without a token (401)', async () => {
    const res = await request(app).get('/api/clusters');
    expect(res.status).toBe(401);
  });

  it('accepts the minted token end-to-end on a protected route', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ password: process.env.ADMIN_PASSWORD });
    const res = await request(app)
      .get('/api/clusters')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/health', () => {
  it('reports ok without authentication', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
