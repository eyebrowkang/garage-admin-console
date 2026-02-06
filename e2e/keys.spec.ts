import { test, expect } from './fixtures';
import { openClusterModule } from './helpers';

test.describe('Access Key Management', () => {
  const testKeyName = `test-key-${Date.now()}`;

  // Helper to ensure cluster exists and navigate to keys page
  async function setupKeysPage(page: typeof test.prototype.page) {
    await openClusterModule(page, 'Access Keys');
    await expect(page.getByRole('heading', { name: 'Access Keys' })).toBeVisible({
      timeout: 10000,
    });
  }

  test('can create a new access key', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await setupKeysPage(page);

    // Click create key button
    await page.getByRole('button', { name: 'Create Key' }).click();

    // Wait for dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Fill in key name
    await dialog.locator('input[placeholder="my-app-key"]').fill(testKeyName);

    // Submit - find the Create button in the dialog
    await dialog.getByRole('button', { name: 'Create' }).click();

    // Should see the created key dialog with secret
    await expect(page.getByRole('heading', { name: 'Access Key Created' })).toBeVisible({
      timeout: 10000,
    });

    // Close the dialog
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click();

    // Key should appear in list
    await expect(page.locator(`text=${testKeyName}`).first()).toBeVisible();
  });
});
