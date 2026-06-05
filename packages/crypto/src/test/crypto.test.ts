import { describe, expect, it } from 'vitest';

import { createCrypto } from '../index.js';

// A 32-byte ASCII key — the exact constraint both BFFs enforce on ENCRYPTION_KEY.
const KEY = '01234567890123456789012345678901';

describe('createCrypto — key validation', () => {
  it('throws when the key is not exactly 32 bytes', () => {
    expect(() => createCrypto('short')).toThrow(/32 bytes/);
    expect(() => createCrypto('0'.repeat(31))).toThrow(/32 bytes/);
    expect(() => createCrypto('0'.repeat(33))).toThrow(/32 bytes/);
  });

  it('accepts a 32-byte Buffer key', () => {
    const { encrypt, decrypt } = createCrypto(Buffer.alloc(32, 7));
    expect(decrypt(encrypt('hello'))).toBe('hello');
  });

  it('rejects a 32-character string whose UTF-8 byte length exceeds 32', () => {
    // 32 two-byte code points = 64 bytes, even though `.length` is 32.
    expect(() => createCrypto('é'.repeat(32))).toThrow(/32 bytes/);
  });
});

describe('encrypt / decrypt — round-trip', () => {
  const { encrypt, decrypt } = createCrypto(KEY);

  it.each([
    ['ascii token', 'admin-token-123'],
    ['whitespace', '   '],
    ['unicode', 'naïve—🚀—日本語'],
    ['long payload', 'x'.repeat(10_000)],
    ['json', JSON.stringify({ a: 1, b: [2, 3], c: 'GK_secret' })],
    ['control chars', 'line1\nline2\t\0end'],
  ])('round-trips %s', (_label, plaintext) => {
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('produces the iv:authTag:ciphertext shape (all hex)', () => {
    const [iv, tag, ct] = encrypt('payload').split(':');
    expect(iv).toMatch(/^[0-9a-f]{32}$/); // 16-byte IV
    expect(tag).toMatch(/^[0-9a-f]{32}$/); // 16-byte GCM auth tag
    expect(ct).toMatch(/^[0-9a-f]+$/);
  });

  it('uses a fresh random IV, so the same plaintext encrypts differently each time', () => {
    const a = encrypt('same');
    const b = encrypt('same');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('same');
    expect(decrypt(b)).toBe('same');
  });
});

describe('empty-string sentinel', () => {
  const { encrypt, decrypt } = createCrypto(KEY);

  it('decrypts the empty string to the empty string (optional-column sentinel)', () => {
    expect(decrypt('')).toBe('');
  });

  it('round-trips an explicitly encrypted empty string', () => {
    // GCM over empty plaintext produces no ciphertext bytes, so encrypt('')
    // yields `iv:tag:` with an empty third component...
    const enc = encrypt('');
    expect(enc.split(':')[2]).toBe('');
    // ...but the IV + auth tag still authenticate that empty message, so it
    // decrypts back to '' instead of being rejected.
    expect(decrypt(enc)).toBe('');
  });
});

describe('decrypt — rejects malformed / tampered input', () => {
  const { encrypt, decrypt } = createCrypto(KEY);

  it('throws on the wrong number of colon-separated parts', () => {
    expect(() => decrypt('only-one-part')).toThrow(/format/i);
    expect(() => decrypt('two:parts')).toThrow(/format/i);
    expect(() => decrypt('a:b:c:d')).toThrow(/format/i);
  });

  it('throws on empty components', () => {
    expect(() => decrypt('::')).toThrow(/components/i);
    expect(() => decrypt('ab::cd')).toThrow(/components/i);
  });

  it('rejects ciphertext tampering via the GCM auth tag', () => {
    const [iv, tag, ct] = encrypt('confidential').split(':');
    const flipped = ct!.slice(0, -1) + (ct!.endsWith('0') ? '1' : '0');
    expect(() => decrypt(`${iv}:${tag}:${flipped}`)).toThrow();
  });

  it('rejects a forged auth tag', () => {
    const [iv, tag, ct] = encrypt('confidential').split(':');
    const forged = (tag!.startsWith('0') ? '1' : '0') + tag!.slice(1);
    expect(() => decrypt(`${iv}:${forged}:${ct}`)).toThrow();
  });

  it('cannot decrypt a payload encrypted under a different key', () => {
    const other = createCrypto('abcdefabcdefabcdefabcdefabcdef12');
    const enc = encrypt('cross-key');
    expect(() => other.decrypt(enc)).toThrow();
  });
});
