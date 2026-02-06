import request from 'supertest';
import jwt from 'jsonwebtoken';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { app } from '../app.js';
import prisma from '../db.js';

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
  await clearClusters();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('clusters', () => {
  it('returns 404 when updating missing cluster', async () => {
    const res = await request(app)
      .put('/clusters/missing-id')
      .set(authHeader())
      .send({ name: 'Missing' });

    expect(res.status).toBe(404);
  });

  it('returns 404 when deleting missing cluster', async () => {
    const res = await request(app).delete('/clusters/missing-id').set(authHeader());

    expect(res.status).toBe(404);
  });

  it('supports clearing metricToken with null', async () => {
    const createRes = await request(app).post('/clusters').set(authHeader()).send({
      name: 'Test Cluster',
      endpoint: 'http://localhost:9999',
      adminToken: 'admin-token',
      metricToken: 'metric-token',
    });

    expect(createRes.status).toBe(201);

    const clusterId = createRes.body.id as string;

    const updateRes = await request(app)
      .put(`/clusters/${clusterId}`)
      .set(authHeader())
      .send({ metricToken: null });

    expect(updateRes.status).toBe(200);

    const cluster = await prisma.cluster.findUnique({ where: { id: clusterId } });
    expect(cluster?.metricToken).toBeNull();
  });
});
