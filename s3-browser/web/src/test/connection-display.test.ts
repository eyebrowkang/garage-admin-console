import { describe, expect, it } from 'vitest';

import { connectionProvider } from '../lib/connection-display';
import type { Connection } from '../lib/types';

function conn(name: string, endpoint: string): Connection {
  return {
    id: '1',
    name,
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    createdAt: '',
    updatedAt: '',
  };
}

describe('connectionProvider', () => {
  it.each([
    ['Garage', conn('My Garage', 'http://garage.local:3900')],
    ['Cloudflare R2', conn('R2', 'https://abc.r2.cloudflarestorage.com')],
    ['Backblaze B2', conn('Backblaze', 'https://s3.us-west.backblazeb2.com')],
    ['Wasabi', conn('Wasabi', 'https://s3.wasabisys.com')],
    ['AWS S3', conn('Prod', 'https://s3.amazonaws.com')],
  ])('detects %s', (expected, connection) => {
    expect(connectionProvider(connection)).toBe(expected);
  });

  it('detects MinIO from a localhost endpoint', () => {
    expect(connectionProvider(conn('Local', 'http://localhost:9000'))).toBe('MinIO');
  });

  it('falls back to "S3-compatible" for unknown providers', () => {
    expect(connectionProvider(conn('Mystery', 'https://storage.example.com'))).toBe(
      'S3-compatible',
    );
  });

  it('prefers the earlier match when several keywords are present', () => {
    // "garage" is checked before "localhost" → Garage wins.
    expect(connectionProvider(conn('Garage', 'http://localhost:3900'))).toBe('Garage');
  });
});
