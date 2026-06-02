#!/usr/bin/env node
/*
 * Guards the shared-Tailwind cascade invariants for both web apps so a silent
 * "styles stopped applying" regression becomes a loud CI failure instead of a
 * costly manual hunt. See packages/ui/src/styles/{input,base}.css and each
 * app's index.css for the full rationale.
 *
 * Two layers of checks:
 *   1. Source invariants (always run) — the structural guarantees that make the
 *      cascade deterministic:
 *        a. the precompiled @garage/ui/style.css is imported into a low-priority
 *           `vendor` layer, so the app's own utilities always win;
 *        b. the @layer order is predeclared with `vendor` BEFORE `utilities`;
 *        c. the app @sources @garage/ui, so its own pass re-emits the shared
 *           utilities (with Tailwind's base→responsive ordering intact).
 *   2. Built-CSS invariants (run only when dist/ exists, e.g. in CI after build)
 *        d. no legacy `min-width: 40rem|48rem` breakpoints — every build must
 *           keep Tailwind v4's modern `width >= …` range syntax;
 *        e. the winning `.sm:flex-row{flex-direction:row}` rule sits AFTER the
 *           last `flex-direction:column` (the concrete bug this all fixes).
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const APPS = [
  {
    name: 'admin',
    indexCss: 'garage-admin-console/web/src/index.css',
    dist: 'garage-admin-console/web/dist',
  },
  { name: 's3-browser', indexCss: 's3-browser/web/src/index.css', dist: 's3-browser/web/dist' },
];

const failures = [];
const fail = (app, msg) => failures.push(`${app}: ${msg}`);

function findCssFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...findCssFiles(full));
    else if (entry.endsWith('.css')) out.push(full);
  }
  return out;
}

for (const app of APPS) {
  // ---- 1. Source invariants -------------------------------------------------
  const src = readFileSync(join(root, app.indexCss), 'utf8');

  if (!/@import\s+['"]@garage\/ui\/style\.css['"]\s+layer\(vendor\)/.test(src)) {
    fail(app.name, "index.css must import '@garage/ui/style.css' into layer(vendor)");
  }

  const decl = src.match(/@layer\s+([^;{]+);/);
  if (!decl) {
    fail(app.name, 'index.css must predeclare the @layer order');
  } else {
    const order = decl[1].split(',').map((s) => s.trim());
    const vendor = order.indexOf('vendor');
    const utilities = order.indexOf('utilities');
    if (vendor === -1 || utilities === -1 || vendor > utilities) {
      fail(
        app.name,
        `@layer order must list 'vendor' before 'utilities' (got: ${order.join(', ')})`,
      );
    }
  }

  if (!/@source\s+['"][^'"]*@garage\/ui[^'"]*['"]/.test(src)) {
    fail(app.name, 'index.css must @source @garage/ui component sources');
  }

  // ---- 2. Built-CSS invariants (skip if not built) --------------------------
  const distDir = join(root, app.dist);
  if (!existsSync(distDir)) {
    console.log(`· ${app.name}: dist/ not built — skipping built-CSS checks`);
    continue;
  }
  // The standalone shell CSS is the largest non-federated chunk.
  const shellCss = findCssFiles(distDir)
    .filter((f) => !/FileBrowser|export_app/i.test(f))
    .map((f) => ({ f, size: statSync(f).size }))
    .sort((a, b) => b.size - a.size)[0]?.f;
  if (!shellCss) {
    fail(app.name, `no CSS emitted under ${app.dist}`);
    continue;
  }
  const css = readFileSync(shellCss, 'utf8');

  if (/min-width:\s*40rem/.test(css) || /min-width:\s*48rem/.test(css)) {
    fail(
      app.name,
      'built CSS contains legacy min-width breakpoints (expected modern width>= syntax)',
    );
  }

  const lastCol = css.lastIndexOf('flex-direction:column');
  const rowRe = /\.sm\\:flex-row\{flex-direction:row/g;
  let lastRow = -1;
  for (let m; (m = rowRe.exec(css)); ) lastRow = m.index;
  if (lastRow === -1) {
    fail(app.name, '.sm:flex-row rule not found in built CSS');
  } else if (lastCol !== -1 && lastRow < lastCol) {
    fail(
      app.name,
      'sm:flex-row is overridden by a later flex-col — header would render as a column on desktop',
    );
  }
}

if (failures.length) {
  console.error('\n✗ CSS cascade guard failed:');
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    '\nSee each app src/index.css and scripts/check-css-cascade.mjs for the invariants.',
  );
  process.exit(1);
}

console.log('✓ CSS cascade invariants hold for', APPS.map((a) => a.name).join(' + '));
