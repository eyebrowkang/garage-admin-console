import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  type CORSRule,
  type S3Client,
} from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetCorsCache,
  classifyBucketCors,
  createBucketCorsCacheKey,
  ensureBucketCors,
  recommendedCorsRule,
} from '../cors.js';

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

const WILDCARD_RULE: CORSRule = {
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

describe('classifyBucketCors', () => {
  it('marks a wildcard rule that exposes ETag as sufficient', () => {
    const status = classifyBucketCors([WILDCARD_RULE], ['https://app.example']);
    expect(status.sufficient).toBe(true);
    expect(status).toMatchObject({ coversOrigins: true, coversMethods: true, exposesEtag: true });
  });

  it('is insufficient and pinpoints the gap when ETag is not exposed', () => {
    const noEtag: CORSRule = {
      AllowedOrigins: ['*'],
      AllowedMethods: ['GET', 'PUT', 'HEAD', 'POST'],
      AllowedHeaders: ['*'],
    };
    const status = classifyBucketCors([noEtag], ['https://app.example']);
    expect(status.sufficient).toBe(false);
    expect(status.exposesEtag).toBe(false);
    expect(status.coversMethods).toBe(true);
  });

  it('is insufficient for an empty rule set', () => {
    expect(classifyBucketCors([], ['https://app.example']).sufficient).toBe(false);
  });

  it('recommendedCorsRule covers the four required methods and exposes ETag', () => {
    const rule = recommendedCorsRule(['https://app.example']);
    expect(rule.AllowedMethods).toEqual(['GET', 'PUT', 'HEAD', 'POST']);
    expect(rule.ExposeHeaders).toEqual(['ETag']);
    expect(rule.AllowedOrigins).toEqual(['https://app.example']);
  });
});

describe('ensureBucketCors — rule reconciliation', () => {
  it('appends a default rule scoped to the given origins when none exists', async () => {
    const client = makeClient({});
    await ensureBucketCors({
      client,
      bucket: 'b',
      cacheKey: 'k1',
      allowedOrigins: ['https://app.example'],
      logger,
    });

    const rules = putRulesFrom(client);
    expect(rules).toHaveLength(1);
    expect(rules![0]).toMatchObject({
      AllowedOrigins: ['https://app.example'],
      AllowedMethods: ['GET', 'PUT', 'HEAD', 'POST'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('reuses a wildcard rule for any requested origin', async () => {
    const client = makeClient({ get: () => ({ CORSRules: [WILDCARD_RULE] }) });
    await ensureBucketCors({
      client,
      bucket: 'b',
      cacheKey: 'k2',
      allowedOrigins: ['https://app.example'],
      logger,
    });
    expect(putRulesFrom(client)).toBeUndefined();
  });

  it('reuses a rule that already allows the exact requested origin', async () => {
    const exact: CORSRule = {
      AllowedOrigins: ['https://app.example'],
      AllowedMethods: ['GET', 'PUT', 'HEAD', 'POST'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
    };
    const client = makeClient({ get: () => ({ CORSRules: [exact] }) });
    await ensureBucketCors({
      client,
      bucket: 'b',
      cacheKey: 'k2b',
      allowedOrigins: ['https://app.example'],
      logger,
    });
    expect(putRulesFrom(client)).toBeUndefined();
  });

  it('appends a scoped rule when the existing rule covers only a different origin', async () => {
    const other: CORSRule = {
      AllowedOrigins: ['https://other.example'],
      AllowedMethods: ['GET', 'PUT', 'HEAD', 'POST'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
    };
    const client = makeClient({ get: () => ({ CORSRules: [other] }) });
    await ensureBucketCors({
      client,
      bucket: 'b',
      cacheKey: 'k2c',
      allowedOrigins: ['https://app.example'],
      logger,
    });

    const rules = putRulesFrom(client)!;
    expect(rules).toHaveLength(2);
    expect(rules[0]).toBe(other); // existing rule preserved, in place
    expect(rules[1]!.AllowedOrigins).toEqual(['https://app.example']);
  });

  it('preserves existing user rules and appends the default when they fall short', async () => {
    const userRule: CORSRule = { AllowedOrigins: ['https://example.com'], AllowedMethods: ['GET'] };
    const client = makeClient({ get: () => ({ CORSRules: [userRule] }) });
    await ensureBucketCors({
      client,
      bucket: 'b',
      cacheKey: 'k3',
      allowedOrigins: ['*'],
      logger,
    });

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
    await ensureBucketCors({
      client,
      bucket: 'b',
      cacheKey: 'k3b',
      allowedOrigins: ['https://app.example'],
      logger,
    });
    expect(putRulesFrom(client)).toBeUndefined();
  });
});

describe('ensureBucketCors — caching', () => {
  it('caches success so a second call within the TTL makes no S3 calls', async () => {
    const client = makeClient({});
    const opts = { client, bucket: 'b', cacheKey: 'k4', allowedOrigins: ['*'], logger };
    await ensureBucketCors(opts);
    const after = client.send.mock.calls.length;
    await ensureBucketCors(opts);
    expect(client.send.mock.calls.length).toBe(after);
  });

  it('re-checks after the cache TTL expires', async () => {
    let t = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => t);
    const client = makeClient({ get: () => ({ CORSRules: [WILDCARD_RULE] }) });
    const opts = { client, bucket: 'b', cacheKey: 'k5', allowedOrigins: ['*'], logger };

    await ensureBucketCors(opts);
    const after = client.send.mock.calls.length;

    t += 5 * 60 * 1000 + 1; // past the 5-minute TTL
    await ensureBucketCors(opts);
    expect(client.send.mock.calls.length).toBeGreaterThan(after);
    nowSpy.mockRestore();
  });

  it('re-checks when the allowed origins change (distinct cache entry)', async () => {
    const client = makeClient({ get: () => ({ CORSRules: [] }) });
    await ensureBucketCors({
      client,
      bucket: 'b',
      cacheKey: 'k5b',
      allowedOrigins: ['https://a'],
      logger,
    });
    const after = client.send.mock.calls.length;
    await ensureBucketCors({
      client,
      bucket: 'b',
      cacheKey: 'k5b',
      allowedOrigins: ['https://b'],
      logger,
    });
    expect(client.send.mock.calls.length).toBeGreaterThan(after);
  });
});

describe('ensureBucketCors — resilience', () => {
  it('skips the write to avoid clobbering when GetBucketCors fails unexpectedly', async () => {
    const client = makeClient({
      get: () => {
        throw Object.assign(new Error('denied'), { name: 'AccessDenied' });
      },
    });
    await ensureBucketCors({ client, bucket: 'b', cacheKey: 'k6', allowedOrigins: ['*'], logger });
    expect(logger.error).toHaveBeenCalled();
    // Must NOT PutBucketCors — that would replace rules we couldn't read.
    expect(putRulesFrom(client)).toBeUndefined();
  });

  it('never throws and does not cache when PutBucketCors fails', async () => {
    const client = makeClient({
      put: () => {
        throw new Error('put failed');
      },
    });
    const opts = { client, bucket: 'b', cacheKey: 'k7', allowedOrigins: ['*'], logger };
    await expect(ensureBucketCors(opts)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();

    // Failure is not cached → the next call retries (more S3 calls).
    const after = client.send.mock.calls.length;
    await ensureBucketCors(opts);
    expect(client.send.mock.calls.length).toBeGreaterThan(after);
  });
});
