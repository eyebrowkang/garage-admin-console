import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect, TEST_GARAGE_CLUSTER } from './fixtures';
import { openClusterConsole, openClusterModule, ensureClusterExists } from './helpers';

// Automated WCAG 2.1 A/AA checks (axe-core). Complements — does not replace —
// manual keyboard / screen-reader review: axe catches roughly a third of issues,
// but the ones it catches are deterministic, so they gate here.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Pre-existing violations, tracked in #52 — baselined per page and per
// offending *component*: a node is keyed by "<rule> <tag.classes>" of the element
// itself (not axe's positional selector). More instances of a listed component
// (e.g. extra table rows / copy buttons from earlier runs) are the same root
// cause with the same fix, so they are tolerated by design; a violation on any
// other element, or of any other rule, fails. An array entry is one component
// whose class list varies slightly between pages (matches any of them).
// Delete entries as they get fixed (an entry matching nothing is reported as an
// `a11y-baseline-stale` annotation); never add entries just to get green.

// Recurring offenders (see #52 for what each one is and how to fix it).
const TOAST_CLOSE_UNNAMED =
  'button-name button.absolute.right-2.top-2.rounded-md.p-1.text-foreground/50.opacity-0.transition-opacity.hover:bg-muted.hover:text-foreground.focus:opacity-100.focus:outline-none.focus:ring-1.focus:ring-ring.group-hover:opacity-100';
const NAV_ITEM_CONTRAST = [
  'color-contrast a.group.relative.flex.items-center.gap-2.5.rounded-lg.px-3.py-2.text-sm.transition-all.bg-primary/10.text-primary.font-medium',
  'color-contrast a.group.relative.flex.items-center.gap-2.5.rounded-lg.px-3.py-2.text-sm.transition-all.bg-primary/10.text-primary.font-medium.active',
];
const SUCCESS_BADGE_CONTRAST = [
  'color-contrast div.inline-flex.items-center.rounded-full.border.px-2.5.py-0.5.font-semibold.transition-colors.focus-visible:outline-none.focus-visible:ring-1.focus-visible:ring-ring.border-transparent.bg-success/10.text-success.text-xs',
  'color-contrast div.inline-flex.items-center.rounded-full.border.px-2.5.py-0.5.text-xs.font-semibold.transition-colors.focus-visible:outline-none.focus-visible:ring-1.focus-visible:ring-ring.border-transparent.bg-success/10.text-success',
];
const MUTED_PLACEHOLDER_CONTRAST = 'color-contrast span.text-sm.text-muted-foreground/60';
const DESTRUCTIVE_BUTTON_CONTRAST = [
  'color-contrast button.inline-flex.items-center.justify-center.gap-2.whitespace-nowrap.font-medium.transition-colors.focus-visible:outline-none.focus-visible:ring-2.focus-visible:ring-ring.focus-visible:ring-offset-2.focus-visible:ring-offset-background.disabled:pointer-events-none.pointer-coarse:min-h-11.pointer-coarse:min-w-11.[&_svg]:pointer-events-none.[&_svg]:size-4.[&_svg]:shrink-0.bg-destructive.text-destructive-foreground.shadow-sm.hover:bg-destructive/90.disabled:bg-muted.disabled:text-muted-foreground.disabled:opacity-100.disabled:shadow-none.h-8.rounded-md.px-3.text-xs',
  'color-contrast button.inline-flex.items-center.justify-center.gap-2.whitespace-nowrap.font-medium.transition-colors.focus-visible:outline-none.focus-visible:ring-2.focus-visible:ring-ring.focus-visible:ring-offset-2.focus-visible:ring-offset-background.disabled:pointer-events-none.pointer-coarse:min-h-11.pointer-coarse:min-w-11.[&_svg]:pointer-events-none.[&_svg]:size-4.[&_svg]:shrink-0.bg-destructive.text-destructive-foreground.shadow-sm.hover:bg-destructive/90.disabled:bg-muted.disabled:text-muted-foreground.disabled:opacity-100.disabled:shadow-none.h-8.rounded-md.px-3.text-xs.flex-1.sm:flex-initial',
];
const COPY_VALUE_LABEL_MISMATCH = [
  'label-content-name-mismatch button.group/copy.inline-flex.items-center.gap-1.5.rounded-md.text-left.align-middle.transition-colors.hover:bg-muted.focus-visible:outline-none.focus-visible:ring-2.focus-visible:ring-ring.disabled:pointer-events-none.disabled:opacity-60.pointer-coarse:min-h-11.-mx-1.px-1.py-0.5.max-w-[22ch].font-mono.text-xs.text-muted-foreground',
  'label-content-name-mismatch button.group/copy.inline-flex.items-center.gap-1.5.rounded-md.text-left.align-middle.transition-colors.hover:bg-muted.focus-visible:outline-none.focus-visible:ring-2.focus-visible:ring-ring.disabled:pointer-events-none.disabled:opacity-60.pointer-coarse:min-h-11.-mx-1.px-1.py-0.5.max-w-[26ch].font-mono',
  'label-content-name-mismatch button.group/copy.inline-flex.max-w-full.items-center.gap-1.5.rounded-md.text-left.align-middle.transition-colors.hover:bg-muted.focus-visible:outline-none.focus-visible:ring-2.focus-visible:ring-ring.disabled:pointer-events-none.disabled:opacity-60.pointer-coarse:min-h-11.border.border-border/70.bg-muted/20.px-2.py-0.5.text-xs',
];
const ROW_LABEL_MISMATCH =
  'label-content-name-mismatch tr.border-b.transition-colors.data-[state=selected]:bg-muted.group.cursor-pointer.hover:bg-muted/50.focus-visible:bg-primary/15.focus-visible:outline-none';
const BULK_BAR_HIDDEN_FOCUS =
  'aria-hidden-focus div.pointer-events-none.fixed.inset-x-0.bottom-[10vh].z-40.flex.justify-center.px-4.sm:bottom-[15vh]';
const SELECT_TRIGGER_UNNAMED =
  'button-name button.flex.h-9.w-full.items-center.justify-between.whitespace-nowrap.rounded-md.border.border-input.bg-transparent.px-3.py-2.text-sm.shadow-sm.ring-offset-background.data-[placeholder]:text-muted-foreground.focus:outline-none.focus:ring-1.focus:ring-ring.disabled:cursor-not-allowed.disabled:opacity-50.pointer-coarse:min-h-11.[&>span]:line-clamp-1';

const KNOWN_VIOLATIONS: Record<string, Array<string | string[]>> = {
  // The toast shows up on whichever page is open when it fires.
  '*': [TOAST_CLOSE_UNNAMED],
  dashboard: ['color-contrast span.hidden.sm:inline'],
  overview: [
    NAV_ITEM_CONTRAST,
    'scrollable-region-focusable pre.overflow-auto.whitespace-pre.px-4.py-4.font-mono.text-xs.leading-relaxed.text-background/90.selection:bg-primary/30.max-h-[420px]',
  ],
  Buckets: [
    BULK_BAR_HIDDEN_FOCUS,
    NAV_ITEM_CONTRAST,
    COPY_VALUE_LABEL_MISMATCH,
    ROW_LABEL_MISMATCH,
  ],
  'Access Keys': [
    BULK_BAR_HIDDEN_FOCUS,
    NAV_ITEM_CONTRAST,
    SUCCESS_BADGE_CONTRAST,
    MUTED_PLACEHOLDER_CONTRAST,
    COPY_VALUE_LABEL_MISMATCH,
    ROW_LABEL_MISMATCH,
  ],
  Nodes: [NAV_ITEM_CONTRAST, SUCCESS_BADGE_CONTRAST, COPY_VALUE_LABEL_MISMATCH, ROW_LABEL_MISMATCH],
  Layout: [NAV_ITEM_CONTRAST],
  'Admin Tokens': [
    BULK_BAR_HIDDEN_FOCUS,
    NAV_ITEM_CONTRAST,
    SUCCESS_BADGE_CONTRAST,
    MUTED_PLACEHOLDER_CONTRAST,
    ROW_LABEL_MISMATCH,
  ],
  Workers: [SELECT_TRIGGER_UNNAMED, NAV_ITEM_CONTRAST],
  Blocks: [SELECT_TRIGGER_UNNAMED, NAV_ITEM_CONTRAST, DESTRUCTIVE_BUTTON_CONTRAST],
  'bucket detail': [
    'button-name button.inline-flex.items-center.justify-center.gap-2.whitespace-nowrap.text-sm.font-medium.transition-colors.focus-visible:outline-none.focus-visible:ring-2.focus-visible:ring-ring.focus-visible:ring-offset-2.focus-visible:ring-offset-background.disabled:pointer-events-none.disabled:opacity-50.pointer-coarse:min-h-11.pointer-coarse:min-w-11.[&_svg]:pointer-events-none.[&_svg]:size-4.[&_svg]:shrink-0.hover:bg-accent.h-5.w-5.rounded-sm.text-muted-foreground.hover:text-destructive',
    NAV_ITEM_CONTRAST,
  ],
  'key detail': [NAV_ITEM_CONTRAST, DESTRUCTIVE_BUTTON_CONTRAST, SUCCESS_BADGE_CONTRAST],
  'node detail': [NAV_ITEM_CONTRAST, SUCCESS_BADGE_CONTRAST],
  'admin token detail': [NAV_ITEM_CONTRAST, DESTRUCTIVE_BUTTON_CONTRAST, SUCCESS_BADGE_CONTRAST],
};

// "tag.class1.class2…" read from the live element — axe's own `html` snippet
// truncates long class lists, which would make signatures far too broad.
async function nodeSignature(page: Page, target: string) {
  return page
    .locator(target)
    .first()
    .evaluate((el) => [el.tagName.toLowerCase(), ...Array.from(el.classList)].join('.'), null, {
      timeout: 2000,
    });
}

async function expectNoNewA11yViolations(page: Page, name: string) {
  // Scan the settled page, not its loading state: let every data query land
  // (the app polls at most every 30s, so the network does go idle).
  await page.waitForLoadState('networkidle');
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const found = [];
  for (const v of violations) {
    for (const n of v.nodes) {
      const target = n.target.join(' ');
      found.push({
        key: `${v.id} ${await nodeSignature(page, target)}`,
        impact: v.impact,
        help: v.help,
        target,
        html: n.html.slice(0, 120),
      });
    }
  }
  const entries = KNOWN_VIOLATIONS[name] ?? [];
  const known = new Set([...KNOWN_VIOLATIONS['*'], ...entries].flat());
  const stale = entries.filter((e) => ![e].flat().some((k) => found.some((f) => f.key === k)));
  if (stale.length > 0) {
    const description = stale.map((e) => [e].flat()[0]).join('\n');
    test.info().annotations.push({ type: 'a11y-baseline-stale', description });
  }
  // Compact, readable failure output: rule + node signature, impact, selector.
  expect(found.filter((f) => !known.has(f.key))).toEqual([]);
}

// Talks to the Garage admin API directly so detail pages have something to show.
async function garage<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${TEST_GARAGE_CLUSTER.endpoint}/v2/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${TEST_GARAGE_CLUSTER.adminToken}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Garage ${path}: HTTP ${res.status} ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// Every cluster route in App.tsx: [baseline key, nav link label, page heading].
const MODULES: Array<[string, string, string]> = [
  ['Buckets', 'Buckets', 'Buckets'],
  ['Access Keys', 'Access Keys', 'Access Keys'],
  ['Nodes', 'Nodes', 'Nodes'],
  ['Layout', 'Layout', 'Layout'],
  ['Admin Tokens', 'Admin Tokens', 'Admin Tokens'],
  ['Workers', 'Workers', 'Worker Management'],
  ['Blocks', 'Blocks', 'Block Management'],
];

test.describe('Accessibility (axe, WCAG 2.1 AA)', () => {
  const ids = { bucket: '', key: '', node: '', token: '' };

  test.beforeAll(async () => {
    const name = `a11y-${Date.now()}`;
    ids.bucket = (await garage<{ id: string }>('CreateBucket', { globalAlias: name })).id;
    ids.key = (await garage<{ accessKeyId: string }>('CreateKey', { name })).accessKeyId;
    ids.token = (await garage<{ id: string }>('CreateAdminToken', { name })).id;
    ids.node = (await garage<{ nodes: Array<{ id: string }> }>('GetClusterStatus')).nodes[0].id;
  });

  test.afterAll(async () => {
    // Best-effort cleanup; the cluster is disposable anyway.
    await Promise.allSettled([
      garage(`DeleteBucket?id=${ids.bucket}`, {}),
      garage(`DeleteKey?id=${ids.key}`, {}),
      garage(`DeleteAdminToken?id=${ids.token}`, {}),
    ]);
  });

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

  for (const [name, label, heading] of MODULES) {
    test(`cluster ${name} page`, async ({ authenticatedPage: page }) => {
      await openClusterModule(page, label);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible({
        timeout: 10000,
      });
      await expectNoNewA11yViolations(page, name);
    });
  }

  for (const [name, route] of [
    ['bucket detail', 'buckets/:bucket'],
    ['key detail', 'keys/:key'],
    ['node detail', 'nodes/:node'],
    ['admin token detail', 'tokens/:token'],
  ] as const) {
    test(`cluster ${name} page`, async ({ authenticatedPage: page }) => {
      await openClusterConsole(page);
      const id = ids[route.split(':')[1] as keyof typeof ids];
      await page.goto(`${page.url()}/${route.replace(/:\w+$/, encodeURIComponent(id))}`);
      await expect(page.getByRole('main')).toBeVisible();
      await expectNoNewA11yViolations(page, name);
    });
  }
});
