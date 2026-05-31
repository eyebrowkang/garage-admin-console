/**
 * The validated environment shared by both BFFs. The two products differ only
 * in their default port, so the rest of the loader is identical.
 */
export interface ServerEnv {
  nodeEnv: string;
  port: number;
  jwtSecret: string;
  adminPassword: string;
  encryptionKey: string;
  logLevel: string;
  logPretty: boolean;
  httpLogFormat: string | null;
}

/**
 * Validate the BFF environment from `process.env`. Throws (failing fast at
 * startup) on any missing/invalid required variable. Callers load their `.env`
 * (e.g. `dotenv.config()`) BEFORE invoking this — keeping the file-loading side
 * effect out of here makes the validator pure and trivially testable.
 *
 * `defaultPort` is the only per-product difference: 3001 for the Admin Console
 * BFF, 3002 for the S3 Browser BFF.
 */
export function loadEnv(defaultPort: number): ServerEnv {
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

  const portRaw = process.env.PORT ?? String(defaultPort);
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT must be a positive integer.');
  }

  const logLevel = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  const allowedLogLevels = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);
  if (!allowedLogLevels.has(logLevel)) {
    throw new Error(`LOG_LEVEL must be one of: ${Array.from(allowedLogLevels).sort().join(', ')}.`);
  }

  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const morganFormatRaw = process.env.MORGAN_FORMAT?.trim();
  const logPrettyRaw = process.env.LOG_PRETTY?.trim();

  const truthy = new Set(['1', 'true', 'yes', 'on']);
  const falsy = new Set(['0', 'false', 'no', 'off']);

  let logPretty = nodeEnv !== 'production';
  if (logPrettyRaw) {
    const normalized = logPrettyRaw.toLowerCase();
    if (truthy.has(normalized)) {
      logPretty = true;
    } else if (falsy.has(normalized)) {
      logPretty = false;
    } else {
      throw new Error('LOG_PRETTY must be one of: true, false, 1, 0, yes, no, on, off.');
    }
  }

  if (nodeEnv === 'production') {
    logPretty = false;
  }

  let httpLogFormat: string | null;
  if (morganFormatRaw) {
    const normalized = morganFormatRaw.toLowerCase();
    const disabled = new Set(['off', 'none', 'false', '0', 'silent']);
    httpLogFormat = disabled.has(normalized) ? null : morganFormatRaw;
  } else {
    httpLogFormat = nodeEnv === 'production' ? null : 'dev';
  }

  return {
    nodeEnv,
    port,
    jwtSecret: process.env.JWT_SECRET as string,
    adminPassword: process.env.ADMIN_PASSWORD as string,
    encryptionKey,
    logLevel,
    logPretty,
    httpLogFormat,
  };
}

/**
 * Read a single Express route param by name, tolerating the `string[]` shape
 * Express can produce and normalizing a missing value to `''`. Shared so both
 * BFFs' bucket routers extract `:clusterId` / `:connId` / `:bucket` the same way.
 */
export function getParam(
  params: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const val = params[name];
  if (Array.isArray(val)) return val[0] ?? '';
  return val ?? '';
}
