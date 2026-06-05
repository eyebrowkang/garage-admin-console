import { defineConfig } from 'vitest/config';

/**
 * Root config used ONLY for aggregated coverage: `pnpm test:coverage`.
 *
 * The day-to-day runner is `pnpm test` → `pnpm -r test:run`, which runs each
 * workspace's own vitest in its own working directory. That isolation matters
 * for the two BFFs, which each migrate a SQLite file DB in their cwd — so they
 * are intentionally excluded here (running both in one process would collide on
 * a shared data.db). Their HTTP contract is covered by their supertest suites
 * under `pnpm test`; this aggregate reports line coverage for the pure-logic,
 * shared, and frontend layers where it is most meaningful.
 */
export default defineConfig({
  test: {
    projects: [
      'packages/crypto/vitest.config.ts',
      'packages/server-config/vitest.config.ts',
      'packages/web-shared/vitest.config.ts',
      'packages/bucket-api-server/vitest.config.ts',
      'packages/ui/vitest.config.ts',
      'garage-admin-console/web/vitest.config.ts',
      's3-browser/web/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['**/src/**'],
      exclude: ['**/src/test/**', '**/*.test.{ts,tsx}', '**/dist/**'],
    },
  },
});
