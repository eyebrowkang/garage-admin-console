import { test, expect } from './fixtures';
import { ensureClusterExists, openClusterConsole, openClusterModule } from './helpers';

test.describe('Cluster Management', () => {
  test('can add a new cluster', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const clusterLink = await ensureClusterExists(page);
    await expect(clusterLink).toBeVisible();
  });

  test('can view cluster overview', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await openClusterConsole(page);

    // Should see cluster overview elements
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible({ timeout: 15000 });
  });

  test('can navigate to buckets page', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await openClusterModule(page, 'Buckets');

    await expect(page.getByRole('heading', { name: 'Buckets' })).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to keys page', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await openClusterModule(page, 'Access Keys');

    await expect(page.getByRole('heading', { name: 'Access Keys' })).toBeVisible({
      timeout: 10000,
    });
  });

  test('can navigate to nodes page', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await openClusterModule(page, 'Nodes');

    await expect(page.getByRole('heading', { name: 'Nodes' })).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to layout page', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await openClusterModule(page, 'Layout');

    await expect(page.getByRole('heading', { name: 'Layout' })).toBeVisible({ timeout: 10000 });
  });
});
