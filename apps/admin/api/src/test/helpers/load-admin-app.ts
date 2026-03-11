import { vi } from 'vitest';

type EnvOverrides = Record<string, string | undefined>;

vi.mock('dotenv', () => ({
  default: {
    config: () => ({ parsed: {} }),
  },
}));

function applyEnvOverrides(overrides: EnvOverrides) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

export async function loadAdminAppForTest(overrides: EnvOverrides = {}) {
  const previousEnv = { ...process.env };

  vi.resetModules();
  applyEnvOverrides(overrides);

  const [{ app }, { env }] = await Promise.all([import('../../app.js'), import('../../config/env.js')]);

  return {
    app,
    env,
    restoreEnv() {
      for (const key of Object.keys(process.env)) {
        if (!(key in previousEnv)) {
          delete process.env[key];
        }
      }

      Object.assign(process.env, previousEnv);
    },
  };
}
