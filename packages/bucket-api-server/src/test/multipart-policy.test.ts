import { describe, expect, it } from 'vitest';

import { computeMultipartPartSize, readMultipartPolicyEnv } from '../multipart-policy.js';
import {
  MULTIPART_DEFAULT_MAX_PART_SIZE_BYTES,
  MULTIPART_MAX_PARTS,
  MULTIPART_MIN_PART_SIZE_BYTES,
  MULTIPART_PART_SIZE_BYTES,
  MULTIPART_TARGET_PARTS,
} from '../constants.js';

const MiB = 1024 * 1024;
const GiB = 1024 * 1024 * 1024;
const TiB = 1024 * 1024 * 1024 * 1024;

describe('computeMultipartPartSize', () => {
  it('keeps small and medium files at the 8 MiB base', () => {
    expect(computeMultipartPartSize(100 * MiB)).toBe(8 * MiB);
    expect(computeMultipartPartSize(2 * GiB)).toBe(8 * MiB); // ~239 parts, under target
  });

  it('climbs the ladder to keep the part count near the soft target', () => {
    const partSize = computeMultipartPartSize(200 * GiB);
    expect(partSize).toBeGreaterThan(8 * MiB);
    expect(Math.ceil((200 * GiB) / partSize)).toBeLessThanOrEqual(MULTIPART_TARGET_PARTS);
  });

  it('reaches a 5 TiB object within the hard cap, capped at the ladder top', () => {
    const partSize = computeMultipartPartSize(5 * TiB);
    expect(partSize).toBe(MULTIPART_DEFAULT_MAX_PART_SIZE_BYTES); // 1 GiB
    expect(Math.ceil((5 * TiB) / partSize)).toBeLessThanOrEqual(MULTIPART_MAX_PARTS);
  });

  it('never returns below the 5 MiB S3 floor', () => {
    expect(computeMultipartPartSize(0)).toBeGreaterThanOrEqual(MULTIPART_MIN_PART_SIZE_BYTES);
    expect(computeMultipartPartSize(1)).toBeGreaterThanOrEqual(MULTIPART_MIN_PART_SIZE_BYTES);
  });

  it('respects custom base/target/max options', () => {
    const partSize = computeMultipartPartSize(100 * GiB, {
      basePartSize: 16 * MiB,
      targetParts: 1000,
      maxPartSize: 256 * MiB,
    });
    expect(partSize).toBeGreaterThanOrEqual(16 * MiB);
    expect(partSize).toBeLessThanOrEqual(256 * MiB);
    expect(Math.ceil((100 * GiB) / partSize)).toBeLessThanOrEqual(1000);
  });

  it('enforces the hard 10k-part cap past the ladder top for absurd inputs', () => {
    // 20 TiB is beyond S3's 5 TiB object limit, but exercises the hard phase.
    const partSize = computeMultipartPartSize(20 * TiB, { maxPartSize: GiB });
    expect(partSize).toBeGreaterThan(GiB); // pushed past the ladder top
    expect(Math.ceil((20 * TiB) / partSize)).toBeLessThanOrEqual(MULTIPART_MAX_PARTS);
  });
});

describe('readMultipartPolicyEnv', () => {
  it('returns production defaults for an empty env', () => {
    expect(readMultipartPolicyEnv({})).toEqual({
      multipartPartSize: MULTIPART_PART_SIZE_BYTES,
      multipartTargetParts: MULTIPART_TARGET_PARTS,
      multipartMaxPartSize: MULTIPART_DEFAULT_MAX_PART_SIZE_BYTES,
    });
  });

  it('parses valid overrides', () => {
    expect(
      readMultipartPolicyEnv({
        S3_MULTIPART_BASE_PART_SIZE: String(16 * MiB),
        S3_MULTIPART_TARGET_PARTS: '1000',
        S3_MULTIPART_MAX_PART_SIZE: String(2 * GiB),
      }),
    ).toEqual({
      multipartPartSize: 16 * MiB,
      multipartTargetParts: 1000,
      multipartMaxPartSize: 2 * GiB,
    });
  });

  it('rejects a base below the 5 MiB floor', () => {
    expect(() => readMultipartPolicyEnv({ S3_MULTIPART_BASE_PART_SIZE: String(MiB) })).toThrow(
      /5 MiB|>=/,
    );
  });

  it('rejects a max above the 5 GiB ceiling', () => {
    expect(() => readMultipartPolicyEnv({ S3_MULTIPART_MAX_PART_SIZE: String(6 * GiB) })).toThrow(
      /5 GiB|<=/,
    );
  });

  it('rejects a max below the base', () => {
    expect(() =>
      readMultipartPolicyEnv({
        S3_MULTIPART_BASE_PART_SIZE: String(512 * MiB),
        S3_MULTIPART_MAX_PART_SIZE: String(64 * MiB),
      }),
    ).toThrow(/>=/);
  });

  it('rejects non-integer or non-positive values', () => {
    expect(() => readMultipartPolicyEnv({ S3_MULTIPART_TARGET_PARTS: 'abc' })).toThrow();
    expect(() => readMultipartPolicyEnv({ S3_MULTIPART_BASE_PART_SIZE: '0' })).toThrow();
  });

  it('rejects a target part count above the hard cap', () => {
    expect(() =>
      readMultipartPolicyEnv({ S3_MULTIPART_TARGET_PARTS: String(MULTIPART_MAX_PARTS + 1) }),
    ).toThrow();
  });
});
