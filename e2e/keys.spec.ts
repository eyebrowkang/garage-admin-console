import { test, expect, TEST_GARAGE_CLUSTER } from './fixtures';

test.describe('Access Key Management', () => {
  const testKeyName = `test-key-${Date.now()}`;

  // Helper to ensure cluster exists and navigate to keys page
  async function setupKeysPage(page: typeof test.prototype.page) {
    // Check if cluster exists
    const clusterCard = page.locator(`text=${TEST_GARAGE_CLUSTER.name}`).first();
    if (!(await clusterCard.isVisible({ timeout: 3000 }).catch(() => false))) {
      // Add cluster if not exists
      await page.click('button:has-text("Connect Cluster")');
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      await page.fill('input#name', TEST_GARAGE_CLUSTER.name);
      await page.fill('input#endpoint', TEST_GARAGE_CLUSTER.endpoint);
      await page.fill('input#token', TEST_GARAGE_CLUSTER.adminToken);
      await page.locator('[role="dialog"] button:has-text("Connect")').click();
      await expect(clusterCard).toBeVisible({ timeout: 10000 });
    }

    // Navigate to cluster page
    await page.click('button:has-text("Manage Cluster")');
    await page.waitForURL(/\/clusters\/.+$/);
    await page.waitForLoadState('domcontentloaded');

    // Wait for sidebar and click Keys
    await page.waitForSelector('aside', { state: 'visible', timeout: 5000 }).catch(() => {});
    await page.locator('aside a:has-text("Keys")').click({ force: true });
    await expect(page.locator('h3:has-text("Access Keys")')).toBeVisible({ timeout: 10000 });
  }

  test('can create a new access key', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await setupKeysPage(page);

    // Click create key button
    await page.click('button:has-text("Create Key")');

    // Wait for dialog
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Fill in key name
    await page.fill('input[placeholder="my-app-key"]', testKeyName);

    // Submit - find the Create button in the dialog
    await page.locator('[role="dialog"] button:has-text("Create")').click();

    // Should see the created key dialog with secret
    await expect(page.locator('text=Access Key Created')).toBeVisible({ timeout: 10000 });

    // Close the dialog
    await page.click('button:has-text("Close")');

    // Key should appear in list
    await expect(page.locator(`text=${testKeyName}`).first()).toBeVisible();
  });
});
