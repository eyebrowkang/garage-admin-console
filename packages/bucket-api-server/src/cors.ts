/**
 * Lazy, idempotent CORS-rule ensure helper.
 *
 * Browser-direct PUTs (multipart upload parts) and presigned GETs only
 * work if the target bucket has CORS rules allowing the browser's origin
 * and exposing ETag. We try the cheapest path:
 *
 *   1. Cache-hit (per bucket cache key) → return immediately.
 *   2. GetBucketCors. If an existing rule covers our needs, cache + return.
 *   3. Otherwise APPEND our rule to the existing list and PutBucketCors.
 *      We never replace user-defined rules — only add what's missing.
 *
 * The cache is in-memory and TTL'd so a CORS reset on the S3 side recovers
 * within a few minutes without a process restart.
 */
import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  type CORSRule,
  type S3Client,
} from '@aws-sdk/client-s3';

import type { Logger } from './types.js';
import { createTtlSweeper } from './ttl-sweep.js';

const REQUIRED_METHODS: ReadonlyArray<'GET' | 'PUT' | 'HEAD' | 'POST'> = [
  'GET',
  'PUT',
  'HEAD',
  'POST',
];
const REQUIRED_EXPOSE_HEADERS = ['ETag'] as const;
const TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

// Reclaim expired entries that are never re-checked (e.g. a bucket touched once)
// so the cache can't grow without bound. Timer is unref'd and self-stops empty.
const SWEEP_INTERVAL_MS = 60 * 1000;
const sweeper = createTtlSweeper(cache, (entry, now) => entry.expiresAt <= now, {
  intervalMs: SWEEP_INTERVAL_MS,
});

function ruleCoversMethods(rule: CORSRule): boolean {
  const allowed = (rule.AllowedMethods ?? []).map((m) => m.toUpperCase());
  return REQUIRED_METHODS.every((m) => allowed.includes(m));
}

function ruleCoversOriginWildcard(rule: CORSRule): boolean {
  return (rule.AllowedOrigins ?? []).includes('*');
}

function ruleExposesEtag(rule: CORSRule): boolean {
  return (rule.ExposeHeaders ?? []).some((h) => h.toLowerCase() === 'etag');
}

function ruleAllowsAnyHeader(rule: CORSRule): boolean {
  return (rule.AllowedHeaders ?? []).includes('*');
}

function isCoveredByExistingRule(rules: CORSRule[]): boolean {
  return rules.some(
    (r) =>
      ruleCoversOriginWildcard(r) &&
      ruleCoversMethods(r) &&
      ruleAllowsAnyHeader(r) &&
      ruleExposesEtag(r),
  );
}

function defaultRule(): CORSRule {
  return {
    AllowedOrigins: ['*'],
    AllowedMethods: [...REQUIRED_METHODS],
    AllowedHeaders: ['*'],
    ExposeHeaders: [...REQUIRED_EXPOSE_HEADERS],
    MaxAgeSeconds: 3000,
  };
}

export interface EnsureCorsInput {
  client: S3Client;
  bucket: string;
  /** Stable identity for the (endpoint, bucket) pair, used as cache key. */
  cacheKey: string;
  logger: Logger;
}

export type BucketCorsCacheKeyPart = string | number | boolean;

/**
 * Builds a delimiter-safe, non-secret cache key for bucket CORS setup.
 * Include the resolved S3 endpoint and bucket, plus any non-secret client
 * identity fields needed to distinguish tenant/account scoped services.
 */
export function createBucketCorsCacheKey(...parts: BucketCorsCacheKeyPart[]): string {
  return parts.map((part) => encodeURIComponent(String(part))).join(':');
}

/**
 * Ensures the bucket has a CORS rule sufficient for browser direct
 * upload/download. Never throws — CORS failures are logged but do not
 * block the calling route. (If CORS can't be configured, the browser
 * request will fail visibly with a CORS error and the user can act.)
 */
export async function ensureBucketCors({
  client,
  bucket,
  cacheKey,
  logger,
}: EnsureCorsInput): Promise<void> {
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return;

  try {
    let existing: CORSRule[] = [];
    try {
      const out = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
      existing = out.CORSRules ?? [];
    } catch (err) {
      // NoSuchCORSConfiguration is the expected "no rules yet" response —
      // any other error we still try to recover from by writing fresh rules.
      const code =
        (err as { name?: string; Code?: string }).name ?? (err as { Code?: string }).Code;
      if (code && code !== 'NoSuchCORSConfiguration' && code !== 'NoSuchCORSConfigurationError') {
        logger.error({ err, bucket }, 'GetBucketCors failed; will attempt PutBucketCors anyway');
      }
    }

    if (isCoveredByExistingRule(existing)) {
      cache.set(cacheKey, { expiresAt: Date.now() + TTL_MS });
      sweeper.ensure();
      return;
    }

    const merged = [...existing, defaultRule()];
    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: { CORSRules: merged },
      }),
    );
    cache.set(cacheKey, { expiresAt: Date.now() + TTL_MS });
    sweeper.ensure();
  } catch (err) {
    logger.error({ err, bucket }, 'ensureBucketCors failed');
    // Do not cache failures — retry on next request.
  }
}

/** Test helper: clear the in-memory cache. Not part of the public API. */
export function _resetCorsCache(): void {
  cache.clear();
  sweeper.stop();
}
