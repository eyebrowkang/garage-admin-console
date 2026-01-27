import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();
const ALGORITHM = 'aes-256-gcm';
const KEY_STRING = process.env.ENCRYPTION_KEY || '';
if (KEY_STRING.length !== 32) {
    console.warn("Warning: ENCRYPTION_KEY is not 32 characters long. Using unsafe fallback or failing.");
    // For dev, we might accept shorter, but production should fail.
}
// Ensure key is 32 bytes. If string, take bytes.
const KEY = Buffer.alloc(32);
KEY.write(KEY_STRING);
export function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}
export function decrypt(text) {
    if (!text)
        return '';
    const parts = text.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted string format');
    }
    const [ivHex, authTagHex, encryptedHex] = parts;
    if (!ivHex || !authTagHex || !encryptedHex) {
        throw new Error('Invalid encrypted string components');
    }
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
//# sourceMappingURL=encryption.js.map