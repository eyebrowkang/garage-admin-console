import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    // Pin the timezone so the date/time formatters render deterministically
    // regardless of the host/CI timezone.
    env: { TZ: 'UTC' },
  },
});
