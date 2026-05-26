import { describe, expect, it } from 'vitest';
import { selectDefaultKey } from '../bucket-key-selection';
import type { AuthorizedKey } from '../bucket-key-selection';

function key(
  id: string,
  name: string,
  perms: Partial<{ read: boolean; write: boolean; owner: boolean }> = {},
): AuthorizedKey {
  return {
    accessKeyId: id,
    name,
    permissions: {
      read: perms.read ?? false,
      write: perms.write ?? false,
      owner: perms.owner ?? false,
    },
  };
}

describe('selectDefaultKey — fallback chain', () => {
  // Branch 1: saved localStorage key still in list
  it('returns the saved key when it is still in authorizedKeys', () => {
    const keys = [
      key('GK_a', 'alpha', { read: true }),
      key('GK_b', 'bravo', { read: true, write: true }),
      key('GK_saved', 'saved', { read: true }),
    ];
    expect(selectDefaultKey(keys, 'GK_saved')).toBe('GK_saved');
  });

  it('ignores the saved key when it has been removed from authorizedKeys', () => {
    const keys = [
      key('GK_a', 'alpha', { read: true }),
      key('GK_b', 'garage-admin-console:bucket1', { read: true, write: true }),
    ];
    // 'GK_gone' no longer in the list → falls through to branch 2
    expect(selectDefaultKey(keys, 'GK_gone')).toBe('GK_b');
  });

  // Branch 2: garage-admin-console: prefix keys
  it('prefers a key with garage-admin-console: prefix over higher-capability non-prefixed keys', () => {
    const keys = [
      key('GK_owner', 'owner-key', { read: true, write: true, owner: true }),
      key('GK_prefix', 'garage-admin-console:bucket', { read: true }),
    ];
    // prefix key has lower capability but is still chosen
    expect(selectDefaultKey(keys, null)).toBe('GK_prefix');
  });

  it('among prefix keys selects by capability (owner > rw > r)', () => {
    const keys = [
      key('GK_ronly', 'garage-admin-console:b', { read: true }),
      key('GK_rw', 'garage-admin-console:a', { read: true, write: true }),
    ];
    expect(selectDefaultKey(keys, null)).toBe('GK_rw');
  });

  it('breaks ties among prefix keys alphabetically by accessKeyId', () => {
    const keys = [
      key('GK_z', 'garage-admin-console:b', { read: true, write: true }),
      key('GK_a', 'garage-admin-console:a', { read: true, write: true }),
    ];
    expect(selectDefaultKey(keys, null)).toBe('GK_a');
  });

  // Branch 3+4: capability priority + alphabetical
  it('selects the highest-capability non-prefixed key when no prefix key exists', () => {
    const keys = [
      key('GK_r', 'read-only', { read: true }),
      key('GK_rw', 'read-write', { read: true, write: true }),
      key('GK_owner', 'owner', { read: true, write: true, owner: true }),
    ];
    expect(selectDefaultKey(keys, null)).toBe('GK_owner');
  });

  it('breaks ties by alphabetical accessKeyId when capability is equal', () => {
    const keys = [
      key('GK_z', 'z-key', { read: true, write: true }),
      key('GK_a', 'a-key', { read: true, write: true }),
    ];
    expect(selectDefaultKey(keys, null)).toBe('GK_a');
  });

  it('returns null for an empty authorizedKeys list', () => {
    expect(selectDefaultKey([], null)).toBeNull();
    expect(selectDefaultKey([], 'GK_any')).toBeNull();
  });
});
