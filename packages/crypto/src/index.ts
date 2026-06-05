import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

export function createCrypto(encryptionKey: string | Buffer): {
  encrypt: (text: string) => string;
  decrypt: (text: string) => string;
} {
  const KEY = Buffer.isBuffer(encryptionKey) ? encryptionKey : Buffer.from(encryptionKey);
  if (KEY.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes.');
  }

  return {
    encrypt(text: string): string {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag().toString('hex');
      // Format: iv:authTag:encrypted
      return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    },

    decrypt(text: string): string {
      // Empty in → empty out: the empty string is the sentinel for "no value",
      // which is how optional encrypted columns (e.g. metricToken) are stored.
      // A non-empty but malformed value, by contrast, is a real error and
      // throws below rather than being silently swallowed.
      if (!text) return '';
      const parts = text.split(':');
      if (parts.length !== 3) throw new Error('Invalid encrypted string format');
      const [ivHex, authTagHex, encryptedHex] = parts;
      // IV and auth tag must be non-empty; the ciphertext segment may be empty
      // (encrypt('') produces no ciphertext bytes — the GCM auth tag still
      // authenticates that empty message, so it round-trips to ''). The
      // `=== undefined` check narrows encryptedHex to `string` for the cipher
      // call without rejecting an empty string.
      if (!ivHex || !authTagHex || encryptedHex === undefined) {
        throw new Error('Invalid encrypted string components');
      }
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    },
  };
}
