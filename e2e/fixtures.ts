import { test as base } from '@playwright/test';

// Test credentials for Garage cluster
export const TEST_GARAGE_CLUSTER = {
  name: 'Test Cluster',
  endpoint: 'http://192.168.88.60:3903',
  adminToken: 'W7z2s/jx/vubvFqbC3yWJTkAWbi4LmoonHAY+9quYlg=',
  region: 'test-region',
};

// Admin password for the console (from env or default)
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

// Extended test fixture with authentication
export const test = base.extend<{
  authenticatedPage: typeof base.prototype.page;
}>({
  authenticatedPage: async ({ page }, use) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
    await use(page);
  },
});

export { expect } from '@playwright/test';
