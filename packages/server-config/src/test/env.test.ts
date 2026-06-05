import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getParam, loadEnv } from '../index.js';

const VALID = {
  JWT_SECRET: 'jwt',
  ADMIN_PASSWORD: 'pw',
  ENCRYPTION_KEY: '01234567890123456789012345678901', // 32 ASCII bytes
};

let snapshot: NodeJS.ProcessEnv;

beforeEach(() => {
  snapshot = { ...process.env };
  // Start each test from a clean, known-good base so derivations are predictable.
  for (const key of ['PORT', 'LOG_LEVEL', 'LOG_PRETTY', 'MORGAN_FORMAT', 'NODE_ENV']) {
    delete process.env[key];
  }
  Object.assign(process.env, VALID);
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) delete process.env[key];
  }
  Object.assign(process.env, snapshot);
});

describe('loadEnv — required vars', () => {
  it('returns a validated env on the happy path', () => {
    expect(loadEnv(3001)).toMatchObject({
      jwtSecret: 'jwt',
      adminPassword: 'pw',
      encryptionKey: VALID.ENCRYPTION_KEY,
      port: 3001,
    });
  });

  it.each(['JWT_SECRET', 'ADMIN_PASSWORD', 'ENCRYPTION_KEY'])('throws when %s is missing', (key) => {
    delete process.env[key];
    expect(() => loadEnv(3001)).toThrow(new RegExp(key));
  });

  it('treats a whitespace-only required var as missing', () => {
    process.env.JWT_SECRET = '   ';
    expect(() => loadEnv(3001)).toThrow(/JWT_SECRET/);
  });
});

describe('loadEnv — ENCRYPTION_KEY length', () => {
  it('rejects a key shorter than 32 bytes', () => {
    process.env.ENCRYPTION_KEY = 'too-short';
    expect(() => loadEnv(3001)).toThrow(/ENCRYPTION_KEY/);
  });

  it('rejects a 32-character but >32-byte multibyte key', () => {
    process.env.ENCRYPTION_KEY = 'é'.repeat(32); // 32 chars, 64 bytes
    expect(() => loadEnv(3001)).toThrow(/ENCRYPTION_KEY/);
  });
});

describe('loadEnv — PORT', () => {
  it('defaults to the provided port when PORT is unset', () => {
    expect(loadEnv(3002).port).toBe(3002);
  });

  it('parses a valid PORT override', () => {
    process.env.PORT = '8080';
    expect(loadEnv(3001).port).toBe(8080);
  });

  it.each(['0', '-1', 'abc', '3.5'])('rejects invalid PORT %s', (port) => {
    process.env.PORT = port;
    expect(() => loadEnv(3001)).toThrow(/PORT/);
  });
});

describe('loadEnv — LOG_LEVEL', () => {
  it('defaults to info', () => {
    expect(loadEnv(3001).logLevel).toBe('info');
  });

  it('lowercases a valid level', () => {
    process.env.LOG_LEVEL = 'DEBUG';
    expect(loadEnv(3001).logLevel).toBe('debug');
  });

  it('rejects an unknown level', () => {
    process.env.LOG_LEVEL = 'verbose';
    expect(() => loadEnv(3001)).toThrow(/LOG_LEVEL/);
  });
});

describe('loadEnv — logPretty / httpLogFormat derivation', () => {
  it('defaults logPretty=true and httpLogFormat="dev" outside production', () => {
    process.env.NODE_ENV = 'development';
    const env = loadEnv(3001);
    expect(env.logPretty).toBe(true);
    expect(env.httpLogFormat).toBe('dev');
  });

  it('forces logPretty=false and httpLogFormat=null in production', () => {
    process.env.NODE_ENV = 'production';
    const env = loadEnv(3001);
    expect(env.logPretty).toBe(false);
    expect(env.httpLogFormat).toBeNull();
  });

  it('honours an explicit LOG_PRETTY=false in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.LOG_PRETTY = 'false';
    expect(loadEnv(3001).logPretty).toBe(false);
  });

  it('rejects an unparseable LOG_PRETTY', () => {
    process.env.LOG_PRETTY = 'maybe';
    expect(() => loadEnv(3001)).toThrow(/LOG_PRETTY/);
  });

  it('disables http logging when MORGAN_FORMAT is a disable keyword', () => {
    process.env.MORGAN_FORMAT = 'off';
    expect(loadEnv(3001).httpLogFormat).toBeNull();
  });

  it('passes a custom MORGAN_FORMAT through', () => {
    process.env.MORGAN_FORMAT = 'combined';
    expect(loadEnv(3001).httpLogFormat).toBe('combined');
  });
});

describe('getParam', () => {
  it('returns a scalar value', () => {
    expect(getParam({ id: 'abc' }, 'id')).toBe('abc');
  });

  it('returns the first element of an array value', () => {
    expect(getParam({ id: ['a', 'b'] }, 'id')).toBe('a');
  });

  it.each([
    ['missing key', {} as Record<string, string | string[] | undefined>],
    ['empty array', { id: [] }],
    ['explicit undefined', { id: undefined }],
  ])('returns "" for %s', (_label, params) => {
    expect(getParam(params, 'id')).toBe('');
  });
});
