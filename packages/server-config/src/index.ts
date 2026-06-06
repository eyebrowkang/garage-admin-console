import crypto from 'node:crypto';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { migrate } from 'drizzle-orm/sqlite-proxy/migrator';
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
  accessTokenTtl: string;
  refreshTokenTtl: string;
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

  // Token TTLs are optional knobs with safe defaults: a short-lived access
  // token and a long-lived refresh token (the client transparently refreshes).
  // Accept an ms-style duration ('15m', '14d', '1h'); reject typos at startup.
  const ttlPattern = /^\d+(ms|s|m|h|d|w|y)$/i;
  const parseTtl = (name: string, raw: string | undefined, fallback: string): string => {
    const value = raw?.trim();
    if (!value) return fallback;
    if (!ttlPattern.test(value)) {
      throw new Error(
        `${name} must be a duration like '15m', '14d', '1h' (digits followed by ms|s|m|h|d|w|y).`,
      );
    }
    return value;
  };
  const accessTokenTtl = parseTtl('ACCESS_TOKEN_TTL', process.env.ACCESS_TOKEN_TTL, '15m');
  const refreshTokenTtl = parseTtl('REFRESH_TOKEN_TTL', process.env.REFRESH_TOKEN_TTL, '14d');

  return {
    nodeEnv,
    port,
    jwtSecret: process.env.JWT_SECRET as string,
    adminPassword: process.env.ADMIN_PASSWORD as string,
    encryptionKey,
    logLevel,
    logPretty,
    httpLogFormat,
    accessTokenTtl,
    refreshTokenTtl,
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

/**
 * JWT `type` claim. `access` tokens authenticate protected routes; `refresh`
 * tokens are only accepted at POST /auth/refresh (exchanged for a fresh pair)
 * and are rejected everywhere else. Both are signed with the same JWT_SECRET
 * and distinguished by this claim, so no second secret/env var is needed.
 */
export type AuthTokenType = 'access' | 'refresh';

function signAuthToken(jwtSecret: string, type: AuthTokenType, expiresIn: string | number): string {
  // `expiresIn` originates from env (a plain string like '15m'); cast to the
  // jsonwebtoken option type (a stricter ms-style template) at the call site.
  const options: SignOptions = {
    // The value is a validated duration string/number; cast to jsonwebtoken's
    // stricter ms-style type, stripping `undefined` (exactOptionalPropertyTypes).
    expiresIn: expiresIn as NonNullable<SignOptions['expiresIn']>,
    algorithm: 'HS256',
  };
  return jwt.sign({ role: 'admin', type }, jwtSecret, options);
}

export function createAuthenticateToken(jwtSecret: string) {
  return function authenticateToken(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) return res.sendStatus(401);

    // Pin the accepted algorithm: the secret is symmetric (HMAC), so refusing
    // any non-HS256 `alg` in the token header closes the algorithm-confusion
    // class of attacks instead of trusting whatever the token claims.
    jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }, (err, user) => {
      // Only a token explicitly minted as `type:'access'` authenticates — this
      // rejects a refresh token replayed as a bearer token (and any legacy
      // typeless token, which forces a one-time re-login after the upgrade).
      if (err || !user || typeof user !== 'object' || (user as JwtPayload).type !== 'access') {
        return res.sendStatus(401);
      }
      (req as AuthenticatedRequest).user = user;
      next();
    });
  };
}

const LoginSchema = z.object({
  password: z.string(),
});

const RefreshSchema = z.object({
  refreshToken: z.string(),
});

export interface CreateAuthRouterOptions {
  adminPassword: string;
  jwtSecret: string;
  /** Short-lived access-token TTL (ms-style string like '15m', or seconds). Default '15m'. */
  accessTokenExpiresIn?: string | number;
  /** Long-lived refresh-token TTL. Default '14d'. */
  refreshTokenExpiresIn?: string | number;
}

/**
 * Constant-time credential comparison. Both sides are reduced to a fixed-length
 * SHA-256 digest first, so `timingSafeEqual` never sees mismatched buffer
 * lengths (which would throw, itself leaking length) and the compare time is
 * independent of how many leading characters happen to match.
 */
function safeEqual(a: string, b: string): boolean {
  const ah = crypto.createHash('sha256').update(a).digest();
  const bh = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ah, bh);
}

export function createAuthRouter({
  adminPassword,
  jwtSecret,
  accessTokenExpiresIn = '15m',
  refreshTokenExpiresIn = '14d',
}: CreateAuthRouterOptions): ExpressRouter {
  const router = Router();

  // Mint a fresh access + refresh pair. Refresh is "sliding": each successful
  // /refresh re-issues both, so a continuously-used (or kept-open) session
  // never expires, while an idle one lapses after the refresh TTL.
  const issueTokens = () => ({
    token: signAuthToken(jwtSecret, 'access', accessTokenExpiresIn),
    refreshToken: signAuthToken(jwtSecret, 'refresh', refreshTokenExpiresIn),
  });

  router.post('/login', (req, res) => {
    try {
      const { password } = LoginSchema.parse(req.body);

      if (!safeEqual(password, adminPassword)) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      res.json(issueTokens());
    } catch {
      res.status(400).json({ error: 'Invalid request' });
    }
  });

  // Stateless refresh: verify the refresh JWT (HS256 + type:'refresh') and hand
  // back a new pair. There is no server-side token store, so a single token
  // can't be revoked before it expires — global revocation = rotating JWT_SECRET.
  router.post('/refresh', (req, res) => {
    let refreshToken: string;
    try {
      refreshToken = RefreshSchema.parse(req.body).refreshToken;
    } catch {
      return res.status(400).json({ error: 'Invalid request' });
    }

    jwt.verify(refreshToken, jwtSecret, { algorithms: ['HS256'] }, (err, decoded) => {
      if (
        err ||
        !decoded ||
        typeof decoded !== 'object' ||
        (decoded as JwtPayload).type !== 'refresh'
      ) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }
      res.json(issueTokens());
    });
  });

  return router;
}

export interface CreateServiceLoggersOptions {
  service: string;
  logLevel: string;
  logPretty: boolean;
}

/**
 * HTTP header names whose values must never appear in logs.
 */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
]);

/**
 * Property names (compared case-insensitively) whose string values are
 * unconditionally replaced with '[REDACTED]'.
 */
const SENSITIVE_PROPS = new Set([
  'secretaccesskey',
  'secretaccesskeyduplicate',
  'password',
  'admintoken',
  'metrictoken',
]);

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 8;

function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? REDACTED : value;
  }
  return result;
}

function deepRedact(obj: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH || obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => deepRedact(item, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lower = key.toLowerCase();

    if (SENSITIVE_PROPS.has(lower) && typeof value === 'string') {
      result[key] = REDACTED;
      continue;
    }

    if (lower === 'headers' && value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactHeaders(value as Record<string, unknown>);
      continue;
    }

    result[key] =
      value !== null && typeof value === 'object' ? deepRedact(value, depth + 1) : value;
  }
  return result;
}

/**
 * Pino error serializer that strips credentials from serialized error objects.
 * Catches AxiosError `config.headers.Authorization`, AWS SDK metadata, and any
 * property whose name matches a known-sensitive pattern. Exported so call sites
 * can also use it directly if needed.
 */
export function safeErrorSerializer(err: Error): Record<string, unknown> {
  const base = pino.stdSerializers.err(err);
  return deepRedact(base, 0) as Record<string, unknown>;
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
        serializers: { err: safeErrorSerializer },
      },
      transport,
    );

  return {
    logger: createLogger('system', logLevel),
    httpLogger: createLogger('http', 'info'),
    createLogger,
  };
}

// The ESC (\x1b) control char is exactly what we're stripping out of morgan's
// colorized output, so the control-char-in-regex warning doesn't apply here.
// eslint-disable-next-line no-control-regex
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

/**
 * Conservative security response headers for both BFFs (the JSON API and the
 * SPA they serve). Deliberately omits a Content-Security-Policy and the
 * cross-origin isolation headers (COEP/CORP): the Admin SPA loads the S3 Browser
 * via Module Federation — often cross-origin — and those would block it. Revisit
 * a real CSP once the all-in-one image serves the remote same-origin. HSTS is
 * only honoured over HTTPS (ignored on plain HTTP), so it's safe to always set.
 */
export function createSecurityHeaders(): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  };
}

export interface CreateSqliteDbOptions {
  dataDir?: string;
  filename?: string;
}

type SqliteProxyMethod = 'run' | 'all' | 'values' | 'get';
type AnySqliteDatabase = SqliteRemoteDatabase<Record<string, unknown>>;

const sqliteClients = new WeakMap<AnySqliteDatabase, DatabaseSync>();

function bindParams(params: unknown[]): SQLInputValue[] {
  return params as SQLInputValue[];
}

async function executeSqliteQuery(
  client: DatabaseSync,
  sql: string,
  params: unknown[],
  method: SqliteProxyMethod,
): Promise<{ rows: unknown[] }> {
  const statement = client.prepare(sql);
  const boundParams = bindParams(params);

  if (method === 'run') {
    statement.run(...boundParams);
    return { rows: [] };
  }

  statement.setReturnArrays(true);

  if (method === 'get') {
    // setReturnArrays(true) makes the row come back as an array of column values,
    // which the static node:sqlite return type (a record) doesn't reflect — hence
    // the bridge through `unknown`. `unknown[]` keeps it off `any`.
    return { rows: statement.get(...boundParams) as unknown as unknown[] };
  }

  return { rows: statement.all(...boundParams) as unknown as unknown[][] };
}

export function createSqliteDb<TSchema extends Record<string, unknown>>(
  schema: TSchema,
  {
    dataDir = process.env.DATA_DIR ?? process.cwd(),
    filename = 'data.db',
  }: CreateSqliteDbOptions = {},
) {
  const dbPath = path.resolve(dataDir, filename);
  const client = new DatabaseSync(dbPath);
  const db = drizzle((sql, params, method) => executeSqliteQuery(client, sql, params, method), {
    schema,
  });
  sqliteClients.set(db as AnySqliteDatabase, client);
  return db;
}

export function getMigrationsFolder(importMetaUrl: string): string {
  const dirname = path.dirname(fileURLToPath(importMetaUrl));
  return path.resolve(dirname, '../../drizzle');
}

export async function runSqliteMigrations<TSchema extends Record<string, unknown>>(
  db: SqliteRemoteDatabase<TSchema>,
  importMetaUrl: string,
) {
  await migrate(
    db,
    async (migrationQueries) => {
      if (migrationQueries.length === 0) return;

      const client = sqliteClients.get(db as AnySqliteDatabase);
      if (!client) {
        throw new Error(
          'SQLite migrations can only run against a database created by createSqliteDb().',
        );
      }

      client.exec('BEGIN');
      try {
        for (const query of migrationQueries) {
          client.exec(query);
        }
        client.exec('COMMIT');
      } catch (error) {
        client.exec('ROLLBACK');
        throw error;
      }
    },
    { migrationsFolder: getMigrationsFolder(importMetaUrl) },
  );
}
