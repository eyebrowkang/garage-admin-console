import request from 'supertest';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../db/migrate.js';
import { app } from '../app.js';
import db from '../db/index.js';
import { clusters } from '../db/schema.js';
import { encrypt } from '../encryption.js';
import { logger } from '../logger.js';
import { _resetBucketKeyCacheForTests } from '../lib/garage-keys.js';

vi.mock('axios', () => {
  const mockGet = vi.fn();
  const mockCreate = vi.fn(() => ({ get: mockGet }));
  return { default: { create: mockCreate } };
});

function authHeader() {
  const token = jwt.sign({ role: 'admin', type: 'access' }, process.env.JWT_SECRET as string, {
    expiresIn: '1d',
  });
  return { Authorization: `Bearer ${token}` };
}

let clusterId: string;

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  vi.clearAllMocks();
  _resetBucketKeyCacheForTests();
  await db.delete(clusters);

  const [row] = await db
    .insert(clusters)
    .values({
      name: 'Test Cluster',
      endpoint: 'http://garage-admin.local:3903',
      adminToken: encrypt('test-admin-token'),
      metricToken: null,
    })
    .returning();
  clusterId = row!.id;
});

describe('bucket routes — access key header enforcement', () => {
  it('returns 400 when X-Garage-Access-Key-Id is missing', async () => {
    const res = await request(app)
      .get(`/api/clusters/${clusterId}/buckets/my-bucket/list`)
      .set(authHeader());

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing access key/i);
  });

  it('returns 404 when the specified key does not exist in Garage', async () => {
    const mockGet = vi.fn().mockResolvedValue({ status: 404, data: null });
    vi.mocked(axios.create).mockReturnValue({ get: mockGet } as never);

    const res = await request(app)
      .get(`/api/clusters/${clusterId}/buckets/my-bucket/list`)
      .set(authHeader())
      .set('X-Garage-Access-Key-Id', 'GK_nonexistent');

    expect(res.status).toBe(404);
  });

  it('GET /keys returns bucket authorized keys without requiring the access key header', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      status: 200,
      data: {
        id: 'abc123',
        keys: [
          {
            accessKeyId: 'GKexample',
            name: 'my-key',
            permissions: { read: true, write: true, owner: false },
          },
        ],
      },
    });
    vi.mocked(axios.create).mockReturnValue({ get: mockGet } as never);

    const res = await request(app)
      .get(`/api/clusters/${clusterId}/buckets/my-bucket/keys`)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.keys).toHaveLength(1);
    expect(res.body.keys[0].accessKeyId).toBe('GKexample');
  });
});

describe('GetKeyInfo log sanitization', () => {
  it('does not log secrets when GetKeyInfo returns an error status', async () => {
    const fakeSecret = 'a'.repeat(40); // long hex-looking string
    const mockGet = vi.fn().mockResolvedValue({
      status: 500,
      data: { secretAccessKey: fakeSecret, secretAccessKeyDuplicate: fakeSecret },
    });
    vi.mocked(axios.create).mockReturnValue({ get: mockGet } as never);

    const loggedArgs: unknown[] = [];
    vi.spyOn(logger, 'error').mockImplementation((...args: unknown[]) => {
      loggedArgs.push(...args);
    });

    await request(app)
      .get(`/api/clusters/${clusterId}/buckets/my-bucket/list`)
      .set(authHeader())
      .set('X-Garage-Access-Key-Id', 'GKtest');

    // Flatten all logged data to a string and check for the secret
    const loggedText = JSON.stringify(loggedArgs);
    expect(loggedText).not.toContain(fakeSecret);
  });

  it('does not log secrets when the request throws (network error)', async () => {
    const fakeSecret = 'b'.repeat(40);
    const axiosErr = Object.assign(new Error('Network Error'), {
      response: {
        status: 503,
        data: { secretAccessKey: fakeSecret, secretAccessKeyDuplicate: fakeSecret },
      },
    });
    const mockGet = vi.fn().mockRejectedValue(axiosErr);
    vi.mocked(axios.create).mockReturnValue({ get: mockGet } as never);

    const loggedArgs: unknown[] = [];
    vi.spyOn(logger, 'error').mockImplementation((...args: unknown[]) => {
      loggedArgs.push(...args);
    });

    await request(app)
      .get(`/api/clusters/${clusterId}/buckets/my-bucket/list`)
      .set(authHeader())
      .set('X-Garage-Access-Key-Id', 'GKtest');

    const loggedText = JSON.stringify(loggedArgs);
    expect(loggedText).not.toContain(fakeSecret);
  });
});
