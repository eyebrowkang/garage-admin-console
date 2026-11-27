import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { openClusterConsole, openClusterModule, ensureClusterExists } from './helpers';

// Automated WCAG 2.1 A/AA checks (axe-core). Complements — does not replace —
// manual keyboard / screen-reader review: axe catches roughly a third of issues,
// but the ones it catches are deterministic, so they gate here.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Pre-existing violations, tracked in #52 — baselined per page and per
// offending *component*: a node is keyed by "<rule> <tag.classes>" from its own
// opening tag (not axe's positional selector). More instances of a listed
// component (e.g. extra table rows / copy buttons from earlier runs) are the
// same root cause with the same fix, so they are tolerated by design; a
// violation on any other element, or of any other rule, fails.
// Delete entries as they get fixed (a stale entry is reported as an
// `a11y-baseline-stale` annotation); never add entries just to get green.
const KNOWN_VIOLATIONS: Record<string, string[]> = {
  // Toast close button (@garage/ui toast.tsx) — on whichever page a toast is up.
  '*': [
    'button-name button.absolute.right-2.top-2.rounded-md.p-1.text-foreground/50.opacity-0.transition-opacity.hover:bg-muted.hover:text-foreground.focus:opacity-100.focus:outline-none.focus:ring-1.focus:ring-ring.group-hover:opacity-100',
  ],
  dashboard: ['color-contrast span.hidden.sm:inline'],
  overview: [
    'color-contrast a.group.relative.flex.items-center.gap-2.5.rounded-lg.px-3.py-2.text-sm.transition-all.bg-primary/10.text-primary.font-medium',
    'scrollable-region-focusable pre.overflow-auto.whitespace-pre.px-4.py-4.font-mono.text-xs.leading-relaxed.text-background/90.selection:bg-primary/30.max-h-[420px]',
  ],
  Buckets: [
    'aria-hidden-focus div.pointer-events-none.fixed.inset-x-0.bottom-[10vh].z-40.flex.justify-center.px-4.sm:bottom-[15vh]',
    'color-contrast a.group.relative.flex.items-center.gap-2.5.rounded-lg.px-3.py-2.text-sm.transition-all.bg-primary/10.text-primary.font-medium.active',
    'label-content-name-mismatch button.group/copy.inline-fl...',
    'label-content-name-mismatch tr.border-b.transition-colors.data-[state=selected]:bg-muted.group.cursor-pointer.hover:bg-muted/50.focus-visible:bg-primary/15.focus-visible:outline-none',
  ],
  'Access Keys': [
    'aria-hidden-focus div.pointer-events-none.fixed.inset-x-0.bottom-[10vh].z-40.flex.justify-center.px-4.sm:bottom-[15vh]',
    'color-contrast a.group.relative.flex.items-center.gap-2.5.rounded-lg.px-3.py-2.text-sm.transition-all.bg-primary/10.text-primary.font-medium.active',
    'color-contrast div.inline-flex.items-center.rounded-full.border.px-2.5.py-0.5.text-xs.font-semibold.transition-colors.focus-visible:outline-none.focus-visible:ring-1.focus-visible:ring-ring.border-transparent.bg-success/10.text-success',
    'color-contrast span.text-sm.text-muted-foreground/60',
    'label-content-name-mismatch button.group/copy.inline-fl...',
    'label-content-name-mismatch tr.border-b.transition-colors.data-[state=selected]:bg-muted.group.cursor-pointer.hover:bg-muted/50.focus-visible:bg-primary/15.focus-visible:outline-none',
  ],
  Nodes: [
    'color-contrast a.group.relative.flex.items-center.gap-2.5.rounded-lg.px-3.py-2.text-sm.transition-all.bg-primary/10.text-primary.font-medium.active',
    'color-contrast div.inline-flex.items-center.rounded-full.border.px-2.5.py-0.5.text-xs.font-semibold.transition-colors.focus-visible:outline-none.focus-visible:ring-1.focus-visible:ring-ring.border-transparent.bg-success/10.text-success',
    'label-content-name-mismatch button.group/copy.inline-fl...',
    'label-content-name-mismatch tr.border-b.transition-colors.data-[state=selected]:bg-muted.group.cursor-pointer.hover:bg-muted/50.focus-visible:bg-primary/15.focus-visible:outline-none',
  ],
  Layout: [
    'color-contrast a.group.relative.flex.items-center.gap-2.5.rounded-lg.px-3.py-2.text-sm.transition-all.bg-primary/10.text-primary.font-medium.active',
  ],
};

function nodeSignature(html: string) {
  const m = /^<([a-z][a-z0-9-]*)\b[^>]*?\sclass="([^"]*)"/i.exec(html);
  if (!m) return html.slice(0, 80);
  return [m[1], ...m[2].trim().split(/\s+/)].join('.');
}

async function expectNoNewA11yViolations(page: Page, name: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const found = violations.flatMap((v) =>
    v.nodes.map((n) => ({
      key: `${v.id} ${nodeSignature(n.html)}`,
      impact: v.impact,
      help: v.help,
      target: n.target.join(' '),
    })),
  );
  const known = new Set([...KNOWN_VIOLATIONS['*'], ...(KNOWN_VIOLATIONS[name] ?? [])]);
  const stale = (KNOWN_VIOLATIONS[name] ?? []).filter((k) => !found.some((f) => f.key === k));
  if (stale.length > 0) {
    test.info().annotations.push({ type: 'a11y-baseline-stale', description: stale.join('\n') });
  }
  // Compact, readable failure output: rule + node signature, impact, selector.
  expect(found.filter((f) => !known.has(f.key))).toEqual([]);
}

test.describe('Accessibility (axe, WCAG 2.1 AA)', () => {
  test('login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expectNoNewA11yViolations(page, 'login');
  });

  test('dashboard', async ({ authenticatedPage: page }) => {
    await ensureClusterExists(page);
    await expectNoNewA11yViolations(page, 'dashboard');
  });

  test('cluster overview', async ({ authenticatedPage: page }) => {
    await openClusterConsole(page);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expectNoNewA11yViolations(page, 'overview');
  });

  for (const module of ['Buckets', 'Access Keys', 'Nodes', 'Layout']) {
    test(`cluster ${module} page`, async ({ authenticatedPage: page }) => {
      await openClusterModule(page, module);
      await expect(page.getByRole('heading', { name: module, exact: true })).toBeVisible({
        timeout: 10000,
      });
      await expectNoNewA11yViolations(page, module);
    });
  }
});
