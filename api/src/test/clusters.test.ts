import request from 'supertest';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runMigrations } from '../db/migrate.js';
import { app } from '../app.js';
import db from '../db/index.js';
import { clusters } from '../db/schema.js';

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
  await db.delete(clusters);
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

    const [cluster] = await db.select().from(clusters).where(eq(clusters.id, clusterId)).limit(1);
    expect(cluster?.metricToken).toBeNull();
  });
});
