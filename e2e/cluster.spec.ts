import { test, expect, TEST_GARAGE_CLUSTER } from './fixtures';

test.describe('Cluster Management', () => {
  // Helper to add cluster if it doesn't exist
  async function ensureClusterExists(page: typeof test.prototype.page) {
    const clusterCard = page.locator(`text=${TEST_GARAGE_CLUSTER.name}`).first();
    if (!(await clusterCard.isVisible({ timeout: 3000 }).catch(() => false))) {
      await page.click('button:has-text("Connect Cluster")');
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      await page.fill('input#name', TEST_GARAGE_CLUSTER.name);
      await page.fill('input#endpoint', TEST_GARAGE_CLUSTER.endpoint);
      await page.fill('input#region', TEST_GARAGE_CLUSTER.region);
      await page.fill('input#token', TEST_GARAGE_CLUSTER.adminToken);
      await page.locator('[role="dialog"] button:has-text("Connect")').click();
      await expect(clusterCard).toBeVisible({ timeout: 10000 });
    }
    return clusterCard;
  }

  test('can add a new cluster', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Click connect cluster button (the dialog trigger)
    await page.click('button:has-text("Connect Cluster")');

    // Wait for dialog to open
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Fill in cluster details
    await page.fill('input#name', TEST_GARAGE_CLUSTER.name);
    await page.fill('input#endpoint', TEST_GARAGE_CLUSTER.endpoint);
    await page.fill('input#region', TEST_GARAGE_CLUSTER.region);
    await page.fill('input#token', TEST_GARAGE_CLUSTER.adminToken);

    // Submit - click the Connect button inside the dialog footer
    await page.locator('[role="dialog"] button:has-text("Connect")').click();

    // Wait for the cluster card to appear
    await expect(page.locator(`text=${TEST_GARAGE_CLUSTER.name}`).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test('can view cluster overview', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Ensure cluster exists
    await ensureClusterExists(page);

    // Click manage cluster
    await page.click('button:has-text("Manage Cluster")');
    await page.waitForURL(/\/clusters\/.+$/);

    // Should see cluster overview elements
    await expect(page.locator('text=Status').first()).toBeVisible({ timeout: 15000 });
  });

  test('can navigate to buckets page', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await ensureClusterExists(page);

    await page.click('button:has-text("Manage Cluster")');
    await page.waitForURL(/\/clusters\/.+$/);
    await page.waitForLoadState('domcontentloaded');

    // Wait for sidebar and click Buckets
    await page.waitForSelector('aside', { state: 'visible', timeout: 5000 }).catch(() => {});
    await page.locator('aside a:has-text("Buckets")').click({ force: true });

    await expect(page.locator('h3:has-text("Buckets")')).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to keys page', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await ensureClusterExists(page);

    await page.click('button:has-text("Manage Cluster")');
    await page.waitForURL(/\/clusters\/.+$/);
    await page.waitForLoadState('domcontentloaded');

    // Wait for sidebar and click Keys
    await page.waitForSelector('aside', { state: 'visible', timeout: 5000 }).catch(() => {});
    await page.locator('aside a:has-text("Keys")').click({ force: true });

    await expect(page.locator('h3:has-text("Access Keys")')).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to nodes page', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await ensureClusterExists(page);

    await page.click('button:has-text("Manage Cluster")');
    await page.waitForURL(/\/clusters\/.+$/);
    await page.waitForLoadState('domcontentloaded');

    // Wait for sidebar and click Nodes
    await page.waitForSelector('aside', { state: 'visible', timeout: 5000 }).catch(() => {});
    await page.locator('aside a:has-text("Nodes")').click({ force: true });

    await expect(page.locator('text=Layout version')).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to layout page', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await ensureClusterExists(page);

    await page.click('button:has-text("Manage Cluster")');
    await page.waitForURL(/\/clusters\/.+$/);
    await page.waitForLoadState('domcontentloaded');

    // Wait for sidebar and click Layout
    await page.waitForSelector('aside', { state: 'visible', timeout: 5000 }).catch(() => {});
    await page.locator('aside a:has-text("Layout")').click({ force: true });

    // Look for the CardTitle specifically
    await expect(page.locator('h3:has-text("Cluster Layout"), div:has-text("Cluster Layout")').first()).toBeVisible({ timeout: 10000 });
  });
});
