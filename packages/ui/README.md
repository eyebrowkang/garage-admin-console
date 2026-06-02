# @garage/ui

Shared shadcn/Radix UI primitives + a few app-level components for both web
apps, built with tsup to `dist/` (ESM + types + a pre-compiled `dist/style.css`).

```ts
import { Button, Card, LoginForm, Toaster, useToast, cn } from '@garage/ui';
```

- shadcn primitives (button, card, dialog, select, table, …), plus `LoginForm`,
  `Toaster` / `useToast`, `useViewMode`, and the `cn()` class-merge helper.
- `peerDependencies`: `react`, `react-dom`. `dependencies`: `@garage/tokens`.
- Import the stylesheet **together with** tokens and Tailwind in one CSS file —
  see the import-order note in
  [docs/architecture.md](../../docs/architecture.md#the-garageui-css-cascade).

Put new shared UI here (not in a web app's source tree); rebuild with
`pnpm -F @garage/ui build` after adding or changing a primitive.
