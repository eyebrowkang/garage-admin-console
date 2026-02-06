import { test, expect } from './fixtures';
import { openClusterModule } from './helpers';

test.describe('Bucket Management', () => {
  const testBucketName = `test-bucket-${Date.now()}`;

  // Helper to ensure cluster exists and navigate to buckets page
  async function setupBucketsPage(page: typeof test.prototype.page) {
    await openClusterModule(page, 'Buckets');
    await expect(page.getByRole('heading', { name: 'Buckets' })).toBeVisible({ timeout: 10000 });
  }

  test('can create a new bucket', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await setupBucketsPage(page);

    // Click create bucket button
    await page.getByRole('button', { name: 'Create Bucket' }).click();

    // Wait for dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Fill in bucket name
    await dialog.locator('input[placeholder="my-bucket"]').first().fill(testBucketName);

    // Submit - find the Create button in the dialog
    await dialog.getByRole('button', { name: 'Create' }).click();

    // Wait for bucket to appear in list
    await expect(page.locator(`text=${testBucketName}`).first()).toBeVisible({
      timeout: 10000,
    });
  });
});
