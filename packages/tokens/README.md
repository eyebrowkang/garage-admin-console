# @garage/tokens

Framework-agnostic design tokens — the single source of the orange theme palette.

- `src/style.css` — CSS variables (`--primary`, `--border`, `--success`, …),
  imported once at each app's entry CSS.
- `src/index.ts` — the same palette as TypeScript constants for JS-driven theming.

Consumed by [`@garage/ui`](../ui/) and both web apps. Light theme only; four
semantic colors (orange · red · green · purple).
