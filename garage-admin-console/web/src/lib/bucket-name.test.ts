import { describe, expect, it } from 'vitest';

import { validateBucketAlias } from './bucket-name';

describe('validateBucketAlias', () => {
  it('accepts common valid aliases', () => {
    expect(validateBucketAlias('app-assets')).toBeNull();
    expect(validateBucketAlias('backups.2026')).toBeNull();
    expect(validateBucketAlias('abc')).toBeNull();
    expect(validateBucketAlias('a'.repeat(63))).toBeNull();
  });

  it('rejects names that are too short or too long', () => {
    expect(validateBucketAlias('ab')).toMatch(/3–63/);
    expect(validateBucketAlias('a'.repeat(64))).toMatch(/3–63/);
  });

  it('rejects uppercase, spaces, and other disallowed characters', () => {
    expect(validateBucketAlias('My-Bucket')).toMatch(/lowercase/);
    expect(validateBucketAlias('my bucket')).toMatch(/lowercase/);
    expect(validateBucketAlias('my_bucket')).toMatch(/lowercase/);
  });

  it('rejects leading or trailing dots and hyphens', () => {
    expect(validateBucketAlias('-bucket')).toMatch(/start and end/);
    expect(validateBucketAlias('bucket-')).toMatch(/start and end/);
    expect(validateBucketAlias('.bucket')).toMatch(/start and end/);
    expect(validateBucketAlias('bucket.')).toMatch(/start and end/);
  });
});
