import { describe, expect, it, vi } from 'vitest';

vi.mock('dotenv', () => ({
  default: {
    config: () => ({ parsed: {} }),
  },
}));

const baseEnv = {
  JWT_SECRET: 'test-jwt-secret',
  ADMIN_PASSWORD: 'test-admin-password',
  ENCRYPTION_KEY: '01234567890123456789012345678901',
  LOG_LEVEL: 'silent',
  MORGAN_FORMAT: 'off',
};

function applyEnv(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function resetEnv(snapshot: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }
  applyEnv(snapshot);
}

describe('env', () => {
  it('throws when JWT_SECRET is missing', async () => {
    const snapshot = { ...process.env };
    applyEnv(baseEnv);
    delete process.env.JWT_SECRET;

    vi.resetModules();
    await expect(import('../config/env.js')).rejects.toThrow(/JWT_SECRET/);

    resetEnv(snapshot);
  });

  it('throws when ADMIN_PASSWORD is missing', async () => {
    const snapshot = { ...process.env };
    applyEnv(baseEnv);
    delete process.env.ADMIN_PASSWORD;

    vi.resetModules();
    await expect(import('../config/env.js')).rejects.toThrow(/ADMIN_PASSWORD/);

    resetEnv(snapshot);
  });

  it('throws when ENCRYPTION_KEY is invalid', async () => {
    const snapshot = { ...process.env };
    applyEnv({ ...baseEnv, ENCRYPTION_KEY: 'short' });

    vi.resetModules();
    await expect(import('../config/env.js')).rejects.toThrow(/ENCRYPTION_KEY/);

    resetEnv(snapshot);
  });
});
