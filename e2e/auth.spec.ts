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
    // Clear token to simulate logout
    await authenticatedPage.evaluate(() => {
      localStorage.removeItem('token');
    });

    await authenticatedPage.goto('/');
    await expect(authenticatedPage).toHaveURL('/login');
  });
});
