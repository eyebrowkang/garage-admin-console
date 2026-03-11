import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const requiredVars = ['JWT_SECRET', 'ADMIN_PASSWORD', 'ENCRYPTION_KEY'] as const;
const missingVars = requiredVars.filter((key) => {
  const value = process.env[key];
  return !value || value.trim() === '';
});

if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

const encryptionKey = process.env.ENCRYPTION_KEY ?? '';
const encryptionKeyBytes = Buffer.from(encryptionKey);
if (encryptionKey.length !== 32 || encryptionKeyBytes.length !== 32) {
  throw new Error('ENCRYPTION_KEY must be exactly 32 bytes (32 ASCII characters).');
}

const portRaw = process.env.PORT ?? '3002';
const port = Number(portRaw);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error('PORT must be a positive integer.');
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const env = {
  nodeEnv,
  port,
  jwtSecret: process.env.JWT_SECRET as string,
  adminPassword: process.env.ADMIN_PASSWORD as string,
  encryptionKey,
};
