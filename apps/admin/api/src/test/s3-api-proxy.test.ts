import request from 'supertest';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadAdminAppForTest } from './helpers/load-admin-app.js';

vi.mock('axios', () => ({
  default: Object.assign(vi.fn(), {
    create: vi.fn(),
    post: vi.fn(),
  }),
}));

const axiosMock = vi.mocked(axios);

describe('s3 api proxy', () => {
  let restoreEnv: (() => void) | undefined;

  beforeEach(() => {
    axiosMock.mockReset();
  });

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
  });

  it('returns 503 when S3 Browser integration is not configured', async () => {
    const loaded = await loadAdminAppForTest({ S3_BROWSER_API_URL: undefined });
    restoreEnv = loaded.restoreEnv;

    const res = await request(loaded.app).get('/s3-api/connections');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'S3 Browser integration not configured' });
    expect(axiosMock).not.toHaveBeenCalled();
  });

  it('forwards Authorization and query params to the S3 Browser API', async () => {
    const loaded = await loadAdminAppForTest({
      S3_BROWSER_API_URL: 'http://s3-browser.internal/',
    });
    restoreEnv = loaded.restoreEnv;

    axiosMock.mockResolvedValue({
      status: 200,
      data: Buffer.from('{"ok":true}'),
      headers: { 'content-type': 'application/json' },
    });

    const res = await request(loaded.app)
      .get('/s3-api/connections')
      .query({ bucket: 'photos', prefix: 'logs/2026/' })
      .set('Authorization', 'Bearer bridge-token');

    expect(res.status).toBe(200);
    expect(axiosMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'http://s3-browser.internal/connections',
        headers: {
          Authorization: 'Bearer bridge-token',
        },
        params: {
          bucket: 'photos',
          prefix: 'logs/2026/',
        },
        responseType: 'arraybuffer',
      }),
    );
  });

  it('passes through download headers from upstream', async () => {
    const loaded = await loadAdminAppForTest({
      S3_BROWSER_API_URL: 'http://s3-browser.internal',
    });
    restoreEnv = loaded.restoreEnv;

    axiosMock.mockResolvedValue({
      status: 200,
      data: Buffer.from('report'),
      headers: {
        'content-type': 'text/plain',
        'content-disposition': 'attachment; filename="report.txt"',
        'content-length': '6',
      },
    });

    const res = await request(loaded.app).get('/s3-api/downloads/report');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain\b/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="report.txt"');
    expect(res.headers['content-length']).toBe('6');
  });
});
