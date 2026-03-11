import request from 'supertest';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../db/migrate.js';
import db from '../db/index.js';
import { clusters } from '../db/schema.js';
import { encrypt } from '../encryption.js';
import { loadAdminAppForTest } from './helpers/load-admin-app.js';

vi.mock('axios', () => ({
  default: Object.assign(vi.fn(), {
    create: vi.fn(),
    post: vi.fn(),
  }),
}));

const axiosCreateMock = vi.mocked(axios.create);
const axiosPostMock = vi.mocked(axios.post);

const authHeader = (jwtSecret: string) => {
  const token = jwt.sign({ role: 'admin' }, jwtSecret, { expiresIn: '1d' });
  return { Authorization: `Bearer ${token}` };
};

beforeAll(async () => {
  await runMigrations();
});

describe('s3 bridge', () => {
  let restoreEnv: (() => void) | undefined;

  beforeEach(async () => {
    axiosCreateMock.mockReset();
    axiosPostMock.mockReset();
    await db.delete(clusters);
  });

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
  });

  it('returns 503 when S3_BROWSER_API_URL is missing', async () => {
    const loaded = await loadAdminAppForTest({ S3_BROWSER_API_URL: undefined });
    restoreEnv = loaded.restoreEnv;

    const res = await request(loaded.app)
      .post('/api/s3-bridge/cluster-123/connect')
      .set(authHeader(loaded.env.jwtSecret))
      .send({
        bucketId: 'bucket-1',
        accessKeyId: 'key-1',
      });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/S3 Browser integration not configured/i);
    expect(axiosPostMock).not.toHaveBeenCalled();
    expect(axiosCreateMock).not.toHaveBeenCalled();
  });

  it('reuses an existing admin-bridge connection when names match', async () => {
    const loaded = await loadAdminAppForTest({
      S3_BROWSER_API_URL: 'http://s3-browser.internal/',
      S3_BROWSER_ADMIN_PASSWORD: undefined,
    });
    restoreEnv = loaded.restoreEnv;

    const [cluster] = await db
      .insert(clusters)
      .values({
        name: 'Bridge Cluster',
        endpoint: 'http://garage.internal:3903',
        adminToken: encrypt('garage-admin-token'),
        metricToken: null,
      })
      .returning();

    const garageApi = {
      get: vi
        .fn()
        .mockResolvedValueOnce({
          data: { globalAliases: ['photos'] },
        })
        .mockResolvedValueOnce({
          data: { secretAccessKey: 'garage-secret' },
        }),
    };
    const s3BrowserClient = {
      get: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'connection-1',
            name: `admin-bridge:${cluster!.id}:bucket-1:key-1`,
          },
        ],
      }),
      put: vi.fn().mockResolvedValue({ data: { id: 'connection-1' } }),
      post: vi.fn(),
    };

    axiosCreateMock
      .mockReturnValueOnce(garageApi as never)
      .mockReturnValueOnce(s3BrowserClient as never);
    axiosPostMock.mockResolvedValue({ data: { token: 's3-browser-token' } });

    const res = await request(loaded.app)
      .post(`/api/s3-bridge/${cluster!.id}/connect`)
      .set(authHeader(loaded.env.jwtSecret))
      .send({
        bucketId: 'bucket-1',
        accessKeyId: 'key-1',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      connectionId: 'connection-1',
      token: 's3-browser-token',
      apiBase: 'http://s3-browser.internal',
      bucketName: 'photos',
    });
    expect(garageApi.get).toHaveBeenNthCalledWith(1, '/v2/GetBucketInfo?id=bucket-1');
    expect(garageApi.get).toHaveBeenNthCalledWith(
      2,
      '/v2/GetKeyInfo?id=key-1&showSecretKey=true',
    );
    expect(axiosPostMock).toHaveBeenCalledWith('http://s3-browser.internal/auth/login', {
      password: loaded.env.adminPassword,
    });
    expect(s3BrowserClient.get).toHaveBeenCalledWith('/connections');
    expect(s3BrowserClient.put).toHaveBeenCalledWith(
      '/connections/connection-1',
      expect.objectContaining({
        name: `admin-bridge:${cluster!.id}:bucket-1:key-1`,
        endpoint: 'http://garage.internal:3900',
        accessKeyId: 'key-1',
        secretAccessKey: 'garage-secret',
        bucket: 'photos',
        pathStyle: true,
      }),
    );
    expect(s3BrowserClient.post).not.toHaveBeenCalled();
  });

  it('returns a 502-style error when S3 Browser auth fails', async () => {
    const loaded = await loadAdminAppForTest({
      S3_BROWSER_API_URL: 'http://s3-browser.internal',
      S3_BROWSER_ADMIN_PASSWORD: undefined,
    });
    restoreEnv = loaded.restoreEnv;

    const [cluster] = await db
      .insert(clusters)
      .values({
        name: 'Bridge Cluster',
        endpoint: 'http://garage.internal:3903',
        adminToken: encrypt('garage-admin-token'),
        metricToken: null,
      })
      .returning();

    const garageApi = {
      get: vi
        .fn()
        .mockResolvedValueOnce({
          data: { globalAliases: ['photos'] },
        })
        .mockResolvedValueOnce({
          data: { secretAccessKey: 'garage-secret' },
        }),
    };

    axiosCreateMock.mockReturnValueOnce(garageApi as never);
    axiosPostMock.mockRejectedValue({
      response: {
        status: 401,
        data: { error: 'Invalid password' },
      },
      message: 'Request failed with status code 401',
    });

    const res = await request(loaded.app)
      .post(`/api/s3-bridge/${cluster!.id}/connect`)
      .set(authHeader(loaded.env.jwtSecret))
      .send({
        bucketId: 'bucket-1',
        accessKeyId: 'key-1',
      });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: 'Failed to authenticate with S3 Browser API',
    });
  });
});
