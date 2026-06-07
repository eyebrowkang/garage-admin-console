import { S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  _resetS3ClientCacheForTests,
  _sweepS3ClientCacheForTests,
  createS3Client,
  getCachedS3Client,
  readChecksumMode,
  type S3ClientOptions,
} from '../s3-client.js';

const baseOptions: S3ClientOptions = {
  region: 'garage',
  endpoint: 'http://localhost:3900',
  forcePathStyle: true,
  credentials: { accessKeyId: 'GK_a', secretAccessKey: 'secret-a' },
};

afterEach(() => {
  _resetS3ClientCacheForTests();
  vi.restoreAllMocks();
});

describe('createS3Client', () => {
  it('builds a configured S3Client', async () => {
    const client = createS3Client(baseOptions);
    expect(client).toBeInstanceOf(S3Client);
    expect(await client.config.region()).toBe('garage');
    client.destroy();
  });
});

describe('getCachedS3Client — identity caching', () => {
  it('returns the same instance for identical options', () => {
    const a = getCachedS3Client(baseOptions);
    const b = getCachedS3Client({ ...baseOptions });
    expect(b).toBe(a);
  });

  it('returns a different instance when credentials rotate', () => {
    const a = getCachedS3Client(baseOptions);
    const b = getCachedS3Client({
      ...baseOptions,
      credentials: { accessKeyId: 'GK_b', secretAccessKey: 'secret-b' },
    });
    expect(b).not.toBe(a);
  });

  it('keys on every identity field (endpoint, region, path-style)', () => {
    const a = getCachedS3Client(baseOptions);
    expect(getCachedS3Client({ ...baseOptions, endpoint: 'http://other:3900' })).not.toBe(a);
    expect(getCachedS3Client({ ...baseOptions, region: 'us-east-1' })).not.toBe(a);
    expect(getCachedS3Client({ ...baseOptions, forcePathStyle: false })).not.toBe(a);
  });

  it('keys on the checksum mode so flipping S3_CHECKSUM_MODE yields a fresh client', () => {
    const a = getCachedS3Client(baseOptions); // default → when_required
    expect(getCachedS3Client({ ...baseOptions, checksumMode: 'when_required' })).toBe(a);
    expect(getCachedS3Client({ ...baseOptions, checksumMode: 'when_supported' })).not.toBe(a);
  });
});

describe('readChecksumMode', () => {
  it('defaults to when_required when unset or empty', () => {
    expect(readChecksumMode({})).toBe('when_required');
    expect(readChecksumMode({ S3_CHECKSUM_MODE: '' })).toBe('when_required');
  });

  it('parses when_supported (trimmed, case-insensitive)', () => {
    expect(readChecksumMode({ S3_CHECKSUM_MODE: 'when_supported' })).toBe('when_supported');
    expect(readChecksumMode({ S3_CHECKSUM_MODE: '  WHEN_SUPPORTED ' })).toBe('when_supported');
  });

  it('throws on an unknown value', () => {
    expect(() => readChecksumMode({ S3_CHECKSUM_MODE: 'always' })).toThrow(/S3_CHECKSUM_MODE/);
  });
});

describe('getCachedS3Client — TTL', () => {
  it('returns a fresh client after the TTL without destroying the stale one', () => {
    // The stale client is never torn down on eviction: a long-lived /download
    // or /upload may still be streaming through it (it borrowed the client once
    // and never re-looked-it-up), and destroy() would abort that healthy
    // transfer by killing the in-use keep-alive socket.
    let t = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => t);
    const a = getCachedS3Client(baseOptions);
    const destroySpy = vi.spyOn(a, 'destroy');

    t += 10 * 60 * 1000 + 1; // past CLIENT_TTL_MS
    const b = getCachedS3Client(baseOptions);

    expect(b).not.toBe(a);
    expect(destroySpy).not.toHaveBeenCalled();
  });

  it('the idle sweeper drops an expired entry without destroying the client', () => {
    let t = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => t);
    const a = getCachedS3Client(baseOptions);
    const destroySpy = vi.spyOn(a, 'destroy');

    t += 10 * 60 * 1000 + 1; // past CLIENT_TTL_MS
    _sweepS3ClientCacheForTests(); // fires while a stream could still hold `a`

    // The entry was removed (a later lookup builds a fresh client) ...
    expect(getCachedS3Client(baseOptions)).not.toBe(a);
    // ... but the swept client was NOT torn down — an in-flight stream survives.
    expect(destroySpy).not.toHaveBeenCalled();
  });

  it('slides the TTL forward on access so active clients stay warm', () => {
    let t = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => t);
    const a = getCachedS3Client(baseOptions);

    t += 9 * 60 * 1000; // within TTL → slides expiry to now+10min
    expect(getCachedS3Client(baseOptions)).toBe(a);

    t += 9 * 60 * 1000; // only 9min since the last access → still warm
    expect(getCachedS3Client(baseOptions)).toBe(a);
  });
});
