import request from 'supertest';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../db/migrate.js';
import { app } from '../app.js';
import db from '../db/index.js';
import { clusters } from '../db/schema.js';
import { encrypt } from '../encryption.js';

vi.mock('axios', () => ({ default: vi.fn() }));

const axiosMock = vi.mocked(axios);

const authHeader = () => {
  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET as string, {
    expiresIn: '1d',
  });
  return { Authorization: `Bearer ${token}` };
};

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  axiosMock.mockReset();
  await db.delete(clusters);
});

describe('proxy', () => {
  it('forwards array request bodies', async () => {
    const [cluster] = await db
      .insert(clusters)
      .values({
        name: 'Proxy Cluster',
        endpoint: 'http://localhost:9999',
        adminToken: encrypt('admin-token'),
        metricToken: null,
      })
      .returning();

    axiosMock.mockResolvedValue({
      status: 200,
      data: { ok: true },
      headers: { 'content-type': 'application/json' },
    });

    const res = await request(app)
      .post(`/proxy/${cluster!.id}/v2/TestArray`)
      .set(authHeader())
      .send([1, 2, 3]);

    expect(res.status).toBe(200);
    expect(axiosMock).toHaveBeenCalled();
    expect(axiosMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [1, 2, 3],
      }),
    );
  });

  it('forwards string request bodies', async () => {
    const [cluster] = await db
      .insert(clusters)
      .values({
        name: 'Proxy Cluster',
        endpoint: 'http://localhost:9999',
        adminToken: encrypt('admin-token'),
        metricToken: null,
      })
      .returning();

    axiosMock.mockResolvedValue({
      status: 200,
      data: { ok: true },
      headers: { 'content-type': 'application/json' },
    });

    const res = await request(app)
      .post(`/proxy/${cluster!.id}/v2/TestString`)
      .set(authHeader())
      .set('Content-Type', 'application/json')
      .send('"hello"');

    expect(res.status).toBe(200);
    expect(axiosMock).toHaveBeenCalled();
    expect(axiosMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: 'hello',
      }),
    );
  });

  it('passes through response headers', async () => {
    const [cluster] = await db
      .insert(clusters)
      .values({
        name: 'Proxy Cluster',
        endpoint: 'http://localhost:9999',
        adminToken: encrypt('admin-token'),
        metricToken: null,
      })
      .returning();

    axiosMock.mockResolvedValue({
      status: 200,
      data: 'ok',
      headers: {
        'content-type': 'text/plain',
        'content-disposition': 'attachment; filename="report.txt"',
      },
    });

    const res = await request(app)
      .get(`/proxy/${cluster!.id}/v2/TestHeaders`)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="report.txt"');
  });
});
