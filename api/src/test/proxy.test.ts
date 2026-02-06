import request from 'supertest';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { app } from '../app.js';
import prisma from '../db.js';
import { encrypt } from '../encryption.js';

vi.mock('axios', () => ({ default: vi.fn() }));

const axiosMock = vi.mocked(axios);

const authHeader = () => {
  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET as string, {
    expiresIn: '1d',
  });
  return { Authorization: `Bearer ${token}` };
};

async function clearClusters() {
  const delays = [25, 50, 100];
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      await prisma.cluster.deleteMany();
      return;
    } catch (error) {
      if (attempt === delays.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

beforeEach(async () => {
  axiosMock.mockReset();
  await clearClusters();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('proxy', () => {
  it('forwards array request bodies', async () => {
    const cluster = await prisma.cluster.create({
      data: {
        name: 'Proxy Cluster',
        endpoint: 'http://localhost:9999',
        adminToken: encrypt('admin-token'),
        metricToken: null,
      },
    });

    axiosMock.mockResolvedValue({
      status: 200,
      data: { ok: true },
      headers: { 'content-type': 'application/json' },
    });

    const res = await request(app)
      .post(`/proxy/${cluster.id}/v2/TestArray`)
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
    const cluster = await prisma.cluster.create({
      data: {
        name: 'Proxy Cluster',
        endpoint: 'http://localhost:9999',
        adminToken: encrypt('admin-token'),
        metricToken: null,
      },
    });

    axiosMock.mockResolvedValue({
      status: 200,
      data: { ok: true },
      headers: { 'content-type': 'application/json' },
    });

    const res = await request(app)
      .post(`/proxy/${cluster.id}/v2/TestString`)
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
    const cluster = await prisma.cluster.create({
      data: {
        name: 'Proxy Cluster',
        endpoint: 'http://localhost:9999',
        adminToken: encrypt('admin-token'),
        metricToken: null,
      },
    });

    axiosMock.mockResolvedValue({
      status: 200,
      data: 'ok',
      headers: {
        'content-type': 'text/plain',
        'content-disposition': 'attachment; filename="report.txt"',
      },
    });

    const res = await request(app).get(`/proxy/${cluster.id}/v2/TestHeaders`).set(authHeader());

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="report.txt"');
  });
});
