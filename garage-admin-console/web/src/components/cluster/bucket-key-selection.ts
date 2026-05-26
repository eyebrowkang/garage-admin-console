export interface AuthorizedKey {
  accessKeyId: string;
  name: string;
  permissions: { read: boolean; write: boolean; owner: boolean };
}

function capabilityScore(k: AuthorizedKey): number {
  if (k.permissions.owner) return 3;
  if (k.permissions.read && k.permissions.write) return 2;
  if (k.permissions.read) return 1;
  return 0;
}

function bestByCapability(keys: AuthorizedKey[]): string {
  return [...keys].sort((a, b) => {
    const cap = capabilityScore(b) - capabilityScore(a);
    return cap !== 0 ? cap : a.accessKeyId.localeCompare(b.accessKeyId);
  })[0]!.accessKeyId;
}

/**
 * Select a default key from `authorizedKeys` using the 4-step fallback chain:
 *   1. Saved localStorage key (if still in the list).
 *   2. First key whose name starts with `garage-admin-console:`, by
 *      capability score then accessKeyId alphabetically.
 *   3. Highest-capability key (owner > rw > r).
 *   4. Alphabetically first accessKeyId when capability is equal.
 *
 * Returns null when `authorizedKeys` is empty.
 */
export function selectDefaultKey(
  authorizedKeys: AuthorizedKey[],
  savedKeyId: string | null,
): string | null {
  if (authorizedKeys.length === 0) return null;

  // Step 1: saved key still in the list
  if (savedKeyId && authorizedKeys.some((k) => k.accessKeyId === savedKeyId)) {
    return savedKeyId;
  }

  // Step 2: keys with the admin-console prefix
  const prefixKeys = authorizedKeys.filter((k) => k.name.startsWith('garage-admin-console:'));
  if (prefixKeys.length > 0) {
    return bestByCapability(prefixKeys);
  }

  // Steps 3+4: capability priority + alphabetical tiebreak
  return bestByCapability(authorizedKeys);
}
