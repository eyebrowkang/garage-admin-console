import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Isolate this BFF's SQLite file DB in its own throwaway temp dir, overriding
// any inherited DATA_DIR. Without this, running both BFFs' suites under one
// shared DATA_DIR (e.g. in CI) makes them collide on a single data.db and the
// second migrator skips table creation ("no such table: Connection").
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'garage-s3-browser-api-test-'));

process.env.DOTENV_CONFIG_PATH ??= '/dev/null';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.ADMIN_PASSWORD ??= 'test-admin-password';
process.env.ENCRYPTION_KEY ??= '01234567890123456789012345678901';
process.env.LOG_LEVEL ??= 'silent';
process.env.MORGAN_FORMAT ??= 'off';
