import { test, expect, ADMIN_PASSWORD } from './fixtures';

test.describe('Authentication', () => {
  test('shows login page for unauthenticated users', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/login');
    await expect(page.locator('#password')).toBeVisible();
  });

  test('can login with valid password', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('redirects to login after logout', async ({ authenticatedPage }) => {
    // Clear all client state (incl. the JWT under 'garage-admin.jwt') to log out.
    await authenticatedPage.evaluate(() => {
      localStorage.clear();
    });

    await authenticatedPage.goto('/');
    await expect(authenticatedPage).toHaveURL('/login');
  });
});
