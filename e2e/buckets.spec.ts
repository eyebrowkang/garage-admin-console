import { test, expect, TEST_GARAGE_CLUSTER } from './fixtures';

test.describe('Bucket Management', () => {
  const testBucketName = `test-bucket-${Date.now()}`;

  // Helper to ensure cluster exists and navigate to buckets page
  async function setupBucketsPage(page: typeof test.prototype.page) {
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

    // Wait for sidebar and click Buckets
    await page.waitForSelector('aside', { state: 'visible', timeout: 5000 }).catch(() => {});
    await page.locator('aside a:has-text("Buckets")').click({ force: true });
    await expect(page.locator('h3:has-text("Buckets")')).toBeVisible({ timeout: 10000 });
  }

  test('can create a new bucket', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await setupBucketsPage(page);

    // Click create bucket button
    await page.click('button:has-text("Create Bucket")');

    // Wait for dialog
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Fill in bucket name
    await page.fill('input[placeholder="my-bucket"]', testBucketName);

    // Submit - find the Create button in the dialog
    await page.locator('[role="dialog"] button:has-text("Create")').click();

    // Wait for bucket to appear in list
    await expect(page.locator(`text=${testBucketName}`).first()).toBeVisible({
      timeout: 10000,
    });
  });
});
