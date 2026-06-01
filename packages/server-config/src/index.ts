import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import express, {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
  type Router as ExpressRouter,
} from 'express';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import morgan from 'morgan';
import pino from 'pino';
import { z } from 'zod';

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

type AuthenticatedRequest = Request & { user?: string | JwtPayload | undefined };

export function createAuthenticateToken(jwtSecret: string) {
  return function authenticateToken(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, jwtSecret, (err, user) => {
      if (err || !user) return res.sendStatus(401);
      (req as AuthenticatedRequest).user = user;
      next();
    });
  };
}

const LoginSchema = z.object({
  password: z.string(),
});

export interface CreateAuthRouterOptions {
  adminPassword: string;
  jwtSecret: string;
  tokenExpiresIn?: SignOptions['expiresIn'];
}

export function createAuthRouter({
  adminPassword,
  jwtSecret,
  tokenExpiresIn = '1d',
}: CreateAuthRouterOptions): ExpressRouter {
  const router = Router();

  router.post('/login', (req, res) => {
    try {
      const { password } = LoginSchema.parse(req.body);

      if (password !== adminPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ role: 'admin' }, jwtSecret, { expiresIn: tokenExpiresIn });
      res.json({ token });
    } catch {
      res.status(400).json({ error: 'Invalid request' });
    }
  });

  return router;
}

export interface CreateServiceLoggersOptions {
  service: string;
  logLevel: string;
  logPretty: boolean;
}

export function createServiceLoggers({
  service,
  logLevel,
  logPretty,
}: CreateServiceLoggersOptions) {
  const transport = logPretty
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      })
    : undefined;

  const createLogger = (component: string, level: string) =>
    pino(
      {
        level,
        base: { service, component },
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      transport,
    );

  return {
    logger: createLogger('system', logLevel),
    httpLogger: createLogger('http', 'info'),
    createLogger,
  };
}

const ANSI_COLOR_PATTERN = /\x1b\[[0-9;]*m/g;

function stripAnsi(value: string): string {
  return value.replace(ANSI_COLOR_PATTERN, '');
}

export function createHttpLogMiddleware(
  format: string | null,
  httpLogger: Pick<pino.Logger, 'info'>,
): RequestHandler | null {
  if (!format) return null;

  return morgan(format, {
    stream: {
      write: (message) => {
        const cleaned = stripAnsi(message).trim();
        if (cleaned) {
          httpLogger.info(cleaned);
        }
      },
    },
  }) as RequestHandler;
}

export function createMultipartAwareJsonParser(): RequestHandler {
  return express.json({
    strict: false,
    type: (req) => {
      const contentType = req.headers['content-type'] ?? '';
      return !contentType.toLowerCase().startsWith('multipart/form-data');
    },
  });
}

export interface CreateLibsqlDbOptions {
  dataDir?: string;
  filename?: string;
}

export function createLibsqlDb<TSchema extends Record<string, unknown>>(
  schema: TSchema,
  { dataDir = process.env.DATA_DIR ?? process.cwd(), filename = 'data.db' }: CreateLibsqlDbOptions = {},
) {
  const dbPath = path.resolve(dataDir, filename);
  const client = createClient({ url: `file:${dbPath}` });
  return drizzle({ client, schema });
}

export function getMigrationsFolder(importMetaUrl: string): string {
  const dirname = path.dirname(fileURLToPath(importMetaUrl));
  return path.resolve(dirname, '../../drizzle');
}

export async function runLibsqlMigrations<TSchema extends Record<string, unknown>>(
  db: LibSQLDatabase<TSchema>,
  importMetaUrl: string,
) {
  await migrate(db, { migrationsFolder: getMigrationsFolder(importMetaUrl) });
}
