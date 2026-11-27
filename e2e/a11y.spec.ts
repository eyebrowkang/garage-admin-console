import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { openClusterConsole, openClusterModule, ensureClusterExists } from './helpers';

// Automated WCAG 2.1 A/AA checks (axe-core). Complements — does not replace —
// manual keyboard / screen-reader review: axe catches roughly a third of issues,
// but the ones it catches are deterministic, so they gate here.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Pre-existing violations, tracked in #52. Remove a rule from this list once it
// is fixed so the check starts gating it again — never add to it to get green.
const KNOWN_VIOLATIONS = [
  'color-contrast',
  'label-content-name-mismatch',
  'aria-hidden-focus',
  'scrollable-region-focusable',
  'button-name',
];

async function expectNoA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .disableRules(KNOWN_VIOLATIONS)
    .analyze();
  // Compact, readable failure output: rule id, impact, and offending nodes.
  const summary = violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 160) })),
  }));
  expect(summary).toEqual([]);
}

test.describe('Accessibility (axe, WCAG 2.1 AA)', () => {
  test('login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('dashboard', async ({ authenticatedPage: page }) => {
    await ensureClusterExists(page);
    await expectNoA11yViolations(page);
  });

  test('cluster overview', async ({ authenticatedPage: page }) => {
    await openClusterConsole(page);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expectNoA11yViolations(page);
  });

  for (const module of ['Buckets', 'Access Keys', 'Nodes', 'Layout']) {
    test(`cluster ${module} page`, async ({ authenticatedPage: page }) => {
      await openClusterModule(page, module);
      await expect(page.getByRole('heading', { name: module, exact: true })).toBeVisible({
        timeout: 10000,
      });
      await expectNoA11yViolations(page);
    });
  }
});
