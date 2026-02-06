import type { Page } from '@playwright/test';
import { expect, TEST_GARAGE_CLUSTER } from './fixtures';

async function closeDialogIfOpen(page: Page) {
  const dialog = page.getByRole('dialog');
  if (!(await dialog.isVisible({ timeout: 500 }).catch(() => false))) {
    return;
  }

  const closeButton = dialog.getByRole('button', { name: 'Close' }).first();
  if (await closeButton.isVisible({ timeout: 500 }).catch(() => false)) {
    await closeButton.click();
  } else {
    await page.keyboard.press('Escape');
  }

  await expect(dialog).toBeHidden({ timeout: 5000 });
}

export async function ensureClusterExists(page: Page) {
  const clusterLink = page.locator('main a[href^="/clusters/"]').first();

  if (!(await clusterLink.isVisible({ timeout: 5000 }).catch(() => false))) {
    await page.getByRole('button', { name: 'Connect Cluster' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('input#name').fill(TEST_GARAGE_CLUSTER.name);
    await dialog.locator('input#endpoint').fill(TEST_GARAGE_CLUSTER.endpoint);
    await dialog.locator('input#token').fill(TEST_GARAGE_CLUSTER.adminToken);
    await dialog.getByRole('button', { name: 'Connect' }).click();
  }

  await closeDialogIfOpen(page);
  await expect(clusterLink).toBeVisible({ timeout: 10000 });
  return clusterLink;
}

export async function openClusterConsole(page: Page) {
  const clusterLink = await ensureClusterExists(page);
  await clusterLink.click();
  await page.waitForURL(/\/clusters\/[^/]+$/);
  await page.waitForLoadState('domcontentloaded');
}

export async function openClusterModule(page: Page, label: string) {
  await openClusterConsole(page);
  await page.getByRole('link', { name: label }).click();
}
