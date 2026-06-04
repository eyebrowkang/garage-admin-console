/**
 * Client-side guidance mirroring Garage's `is_valid_bucket_name` for the
 * mistakes users actually make (case, spaces, length, leading/trailing
 * punctuation). Garage applies the same rule to global *and* local aliases.
 *
 * The server stays the final authority: it additionally rejects IP-formatted
 * names, the `xn--` punycode prefix (unless the cluster enables it), and the
 * `-s3alias` suffix. We intentionally don't reproduce those here so we never
 * reject a name the cluster would actually accept — they surface via the API
 * error instead.
 *
 * Expects an already-trimmed alias. Returns an error message, or `null` if the
 * alias passes the common-case checks.
 */
export function validateBucketAlias(alias: string): string | null {
  if (alias.length < 3 || alias.length > 63) {
    return 'Use 3–63 characters.';
  }
  if (!/^[a-z0-9.-]+$/.test(alias)) {
    return 'Use lowercase letters, numbers, dots, and hyphens only.';
  }
  if (/^[.-]/.test(alias) || /[.-]$/.test(alias)) {
    return 'Must start and end with a letter or number.';
  }
  return null;
}
