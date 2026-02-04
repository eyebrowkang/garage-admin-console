import dotenv from 'dotenv';

dotenv.config();

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

const portRaw = process.env.PORT ?? '3001';
const port = Number(portRaw);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error('PORT must be a positive integer.');
}

const logLevel = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
const allowedLogLevels = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);
if (!allowedLogLevels.has(logLevel)) {
  throw new Error(
    `LOG_LEVEL must be one of: ${Array.from(allowedLogLevels).sort().join(', ')}.`,
  );
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const morganFormatRaw = process.env.MORGAN_FORMAT?.trim();

let httpLogFormat: string | null;
if (morganFormatRaw) {
  const normalized = morganFormatRaw.toLowerCase();
  const disabled = new Set(['off', 'none', 'false', '0', 'silent']);
  httpLogFormat = disabled.has(normalized) ? null : morganFormatRaw;
} else {
  httpLogFormat = nodeEnv === 'production' ? null : 'dev';
}

export const env = {
  nodeEnv,
  port,
  jwtSecret: process.env.JWT_SECRET as string,
  adminPassword: process.env.ADMIN_PASSWORD as string,
  encryptionKey,
  logLevel,
  httpLogFormat,
};
