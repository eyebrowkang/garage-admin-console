import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  type CORSRule,
  type S3Client,
} from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetCorsCache, createBucketCorsCacheKey, ensureBucketCors } from '../cors.js';

const logger = { error: vi.fn() };

interface ClientHandlers {
  /** GetBucketCors response; omit to simulate NoSuchCORSConfiguration. */
  get?: () => { CORSRules?: CORSRule[] };
  /** PutBucketCors handler; omit for a successful no-op. */
  put?: () => unknown;
}

function makeClient(handlers: ClientHandlers) {
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof GetBucketCorsCommand) {
      if (!handlers.get) {
        throw Object.assign(new Error('no rules'), { name: 'NoSuchCORSConfiguration' });
      }
      return handlers.get();
    }
    if (command instanceof PutBucketCorsCommand) {
      return handlers.put?.() ?? {};
    }
    throw new Error('unexpected command');
  });
  return { send } as unknown as S3Client & { send: typeof send };
}

const COVERING_RULE: CORSRule = {
  AllowedOrigins: ['*'],
  AllowedMethods: ['GET', 'PUT', 'HEAD', 'POST'],
  AllowedHeaders: ['*'],
  ExposeHeaders: ['ETag'],
};

function putRulesFrom(client: ReturnType<typeof makeClient>): CORSRule[] | undefined {
  const call = client.send.mock.calls.find(([c]) => c instanceof PutBucketCorsCommand);
  if (!call) return undefined;
  return (call[0] as PutBucketCorsCommand).input.CORSConfiguration?.CORSRules;
}

beforeEach(() => {
  _resetCorsCache();
  logger.error.mockClear();
});

describe('createBucketCorsCacheKey', () => {
  it('escapes delimiter-bearing parts', () => {
    expect(createBucketCorsCacheKey('conn:1', 'http://s3.local:3900', true, 'bucket/name')).toBe(
      'conn%3A1:http%3A%2F%2Fs3.local%3A3900:true:bucket%2Fname',
    );
  });
});

describe('ensureBucketCors — rule reconciliation', () => {
  it('appends a default rule when the bucket has no CORS config', async () => {
    const client = makeClient({});
    await ensureBucketCors({ client, bucket: 'b', cacheKey: 'k1', logger });

    const rules = putRulesFrom(client);
    expect(rules).toHaveLength(1);
    expect(rules![0]).toMatchObject({
      AllowedOrigins: ['*'],
      AllowedMethods: ['GET', 'PUT', 'HEAD', 'POST'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('skips PutBucketCors when an existing rule already covers the requirements', async () => {
    const client = makeClient({ get: () => ({ CORSRules: [COVERING_RULE] }) });
    await ensureBucketCors({ client, bucket: 'b', cacheKey: 'k2', logger });
    expect(putRulesFrom(client)).toBeUndefined();
  });

  it('preserves existing user rules and appends the default when they fall short', async () => {
    const userRule: CORSRule = { AllowedOrigins: ['https://example.com'], AllowedMethods: ['GET'] };
    const client = makeClient({ get: () => ({ CORSRules: [userRule] }) });
    await ensureBucketCors({ client, bucket: 'b', cacheKey: 'k3', logger });

    const rules = putRulesFrom(client)!;
    expect(rules).toHaveLength(2);
    expect(rules[0]).toBe(userRule); // user rule preserved, in place
    expect(rules[1]).toMatchObject({ ExposeHeaders: ['ETag'] });
  });

  it('matches methods/headers case-insensitively when judging coverage', async () => {
    const lowercased: CORSRule = {
      AllowedOrigins: ['*'],
      AllowedMethods: ['get', 'put', 'head', 'post'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['etag'],
    };
    const client = makeClient({ get: () => ({ CORSRules: [lowercased] }) });
    await ensureBucketCors({ client, bucket: 'b', cacheKey: 'k3b', logger });
    expect(putRulesFrom(client)).toBeUndefined();
  });
});

describe('ensureBucketCors — caching', () => {
  it('caches success so a second call within the TTL makes no S3 calls', async () => {
    const client = makeClient({});
    await ensureBucketCors({ client, bucket: 'b', cacheKey: 'k4', logger });
    const after = client.send.mock.calls.length;
    await ensureBucketCors({ client, bucket: 'b', cacheKey: 'k4', logger });
    expect(client.send.mock.calls.length).toBe(after);
  });

  it('re-checks after the cache TTL expires', async () => {
    let t = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => t);
    const client = makeClient({ get: () => ({ CORSRules: [COVERING_RULE] }) });

    await ensureBucketCors({ client, bucket: 'b', cacheKey: 'k5', logger });
    const after = client.send.mock.calls.length;

    t += 5 * 60 * 1000 + 1; // past the 5-minute TTL
    await ensureBucketCors({ client, bucket: 'b', cacheKey: 'k5', logger });
    expect(client.send.mock.calls.length).toBeGreaterThan(after);
    nowSpy.mockRestore();
  });
});

describe('ensureBucketCors — resilience', () => {
  it('logs but still writes rules when GetBucketCors fails unexpectedly', async () => {
    const client = makeClient({
      get: () => {
        throw Object.assign(new Error('denied'), { name: 'AccessDenied' });
      },
    });
    await ensureBucketCors({ client, bucket: 'b', cacheKey: 'k6', logger });
    expect(logger.error).toHaveBeenCalled();
    expect(putRulesFrom(client)).toBeDefined();
  });

  it('never throws and does not cache when PutBucketCors fails', async () => {
    const client = makeClient({
      put: () => {
        throw new Error('put failed');
      },
    });
    await expect(
      ensureBucketCors({ client, bucket: 'b', cacheKey: 'k7', logger }),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();

    // Failure is not cached → the next call retries (more S3 calls).
    const after = client.send.mock.calls.length;
    await ensureBucketCors({ client, bucket: 'b', cacheKey: 'k7', logger });
    expect(client.send.mock.calls.length).toBeGreaterThan(after);
  });
});
