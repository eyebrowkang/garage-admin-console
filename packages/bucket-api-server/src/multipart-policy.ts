/**
 * Adaptive multipart upload part-size policy.
 *
 * `computeMultipartPartSize` picks a part size that keeps the part count
 * manageable as files grow; `readMultipartPolicyEnv` parses the operator-tunable
 * knobs from the environment (shared by both BFFs so the validation isn't forked
 * inline). Both are pure/side-effect-light and unit-tested.
 */
import {
  MULTIPART_DEFAULT_MAX_PART_SIZE_BYTES,
  MULTIPART_MAX_PART_SIZE_BYTES,
  MULTIPART_MAX_PARTS,
  MULTIPART_MIN_PART_SIZE_BYTES,
  MULTIPART_PART_SIZE_BYTES,
  MULTIPART_TARGET_PARTS,
} from './constants.js';

export interface MultipartPartSizeOptions {
  /** Ladder floor (>= 5 MiB). Default MULTIPART_PART_SIZE_BYTES (8 MiB). */
  basePartSize?: number;
  /** Soft goal for the part count; the ladder climbs until at/below it. */
  targetParts?: number;
  /** Ladder top (a soft cap kept small enough to keep each PUT retryable). */
  maxPartSize?: number;
}

/**
 * Choose a multipart part size for a known file size. Doubles from `basePartSize`
 * up to `maxPartSize` until the part count is at/below `targetParts` (the soft
 * phase), then — only for absurdly large inputs — keeps doubling up to S3's 5 GiB
 * per-part ceiling so the part count never exceeds MULTIPART_MAX_PARTS (the hard
 * phase). Returns at least the 5 MiB S3 minimum.
 */
export function computeMultipartPartSize(
  fileSize: number,
  opts: MultipartPartSizeOptions = {},
): number {
  const base = Math.max(
    MULTIPART_MIN_PART_SIZE_BYTES,
    Math.floor(opts.basePartSize ?? MULTIPART_PART_SIZE_BYTES),
  );
  const targetParts = Math.max(1, Math.floor(opts.targetParts ?? MULTIPART_TARGET_PARTS));
  const ladderTop = Math.min(
    MULTIPART_MAX_PART_SIZE_BYTES,
    Math.max(base, Math.floor(opts.maxPartSize ?? MULTIPART_DEFAULT_MAX_PART_SIZE_BYTES)),
  );

  const size = Math.max(0, Math.floor(fileSize));
  let partSize = base;

  // Soft phase — climb the ladder until under the target part count.
  while (partSize < ladderTop && Math.ceil(size / partSize) > targetParts) {
    partSize = Math.min(ladderTop, partSize * 2);
  }
  // Hard phase — never exceed the 10k-part cap, even past the ladder top (up to
  // the S3 5 GiB per-part limit). Only reachable for inputs beyond S3's 5 TiB
  // object limit, so in practice a no-op.
  while (
    partSize < MULTIPART_MAX_PART_SIZE_BYTES &&
    Math.ceil(size / partSize) > MULTIPART_MAX_PARTS
  ) {
    partSize = Math.min(MULTIPART_MAX_PART_SIZE_BYTES, partSize * 2);
  }
  return partSize;
}

export interface MultipartPolicyOptions {
  /** Ladder floor / the part size returned when no fileSize is given. */
  multipartPartSize: number;
  /** Soft target part count the ladder climbs toward. */
  multipartTargetParts: number;
  /** Ladder top. */
  multipartMaxPartSize: number;
}

function parsePositiveInt(
  source: Record<string, string | undefined>,
  name: string,
  fallback: number,
): number {
  const raw = source[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return n;
}

/**
 * Parse the operator-tunable multipart part-size policy from `source` (defaults
 * to `process.env`). Throws on invalid config so the BFF fails fast at startup.
 *   S3_MULTIPART_BASE_PART_SIZE  (bytes, default 8 MiB; >= 5 MiB)
 *   S3_MULTIPART_TARGET_PARTS    (default 2000; 1..MULTIPART_MAX_PARTS)
 *   S3_MULTIPART_MAX_PART_SIZE   (bytes, default 1 GiB; base..5 GiB)
 */
export function readMultipartPolicyEnv(
  source: Record<string, string | undefined> = process.env,
): MultipartPolicyOptions {
  const basePartSize = parsePositiveInt(
    source,
    'S3_MULTIPART_BASE_PART_SIZE',
    MULTIPART_PART_SIZE_BYTES,
  );
  if (basePartSize < MULTIPART_MIN_PART_SIZE_BYTES) {
    throw new Error(
      `S3_MULTIPART_BASE_PART_SIZE must be >= ${MULTIPART_MIN_PART_SIZE_BYTES} (5 MiB).`,
    );
  }

  const maxPartSize = parsePositiveInt(
    source,
    'S3_MULTIPART_MAX_PART_SIZE',
    MULTIPART_DEFAULT_MAX_PART_SIZE_BYTES,
  );
  if (maxPartSize > MULTIPART_MAX_PART_SIZE_BYTES) {
    throw new Error(
      `S3_MULTIPART_MAX_PART_SIZE must be <= ${MULTIPART_MAX_PART_SIZE_BYTES} (5 GiB).`,
    );
  }
  if (maxPartSize < basePartSize) {
    throw new Error('S3_MULTIPART_MAX_PART_SIZE must be >= S3_MULTIPART_BASE_PART_SIZE.');
  }

  const targetParts = parsePositiveInt(source, 'S3_MULTIPART_TARGET_PARTS', MULTIPART_TARGET_PARTS);
  if (targetParts > MULTIPART_MAX_PARTS) {
    throw new Error(`S3_MULTIPART_TARGET_PARTS must be <= ${MULTIPART_MAX_PARTS}.`);
  }

  return {
    multipartPartSize: basePartSize,
    multipartTargetParts: targetParts,
    multipartMaxPartSize: maxPartSize,
  };
}
