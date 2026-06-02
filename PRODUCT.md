# Product

## Register

product

## Users

Storage operators and platform engineers running self-hosted object storage.

- **Garage Admin Console** — operators managing one or more [Garage](https://garagehq.deuxfleurs.fr/) clusters: connecting clusters, watching health/capacity, and drilling into nodes, buckets, keys, and workers.
- **S3 Browser** — developers and admins managing S3-compatible connections and browsing bucket objects, either standalone or embedded into the Admin Console's bucket detail page.

Context of use: a focused administrative task on desktop most of the time, but increasingly checked on a phone (incident triage, a quick health glance). The user is in a task, not browsing.

## Product Purpose

Two sibling products that share a design system (`@garage/tokens` + `@garage/ui`) and a Bucket Backend API surface (`@garage/bucket-api-server`). The Admin Console tracks the Garage Admin API v2; the S3 Browser is a generic S3-protocol file browser that also federates into the Console via Module Federation. Success = an operator trusts the status they see at a glance and completes管理 tasks (connect, inspect, edit, disconnect) without friction, on either screen size, in either product, without relearning anything.

## Brand Personality

Calm, professional, operator-trustworthy. The tool disappears into the task. Warmth comes from a single brand orange `rgb(255, 148, 41)` and the Manrope typeface, not from decoration. Three words: **restrained, dependable, legible.**

The brand orange is fixed and non-negotiable; readability is achieved by pairing it with dark ink, never by altering the hue. Light theme only. "List pages stay light, detail pages go deep."

## Anti-references

- SaaS hero-metric dashboards (big gradient number + supporting stats template).
- Glassmorphism, decorative blur, gradient text.
- The "every card wears a colored left stripe" look — a recognizable AI tell, and redundant when a text status badge already carries the state.
- Any color outside the four-color system (theme orange · red errors · green health · purple warnings).
- Dark mode. Fluid/clamp display type. Forking the two apps so they drift apart.

## Design Principles

1. **One design, two products.** Shared primitives in `@garage/ui`; never fork a component or page-level pattern into both apps. If the "save" button differs in two places, one is wrong.
2. **Status you can trust at a glance.** Live health, busy states, and specific errors over silence. State is always carried by text + icon, never by color alone.
3. **Restrained color.** Four colors only; the accent marks actions, selection, and real anomalies — not every surface.
4. **List light, detail deep.** Overview pages stay calm and neutral; depth and saturation are earned on detail pages.
5. **AA is the floor, not a goal.** WCAG 2.1 AA contrast is a hard requirement; the brand bends typography/ink to meet it, never the reverse.

## Accessibility & Inclusion

- Target **WCAG 2.1 AA** (4.5:1 body text, 3:1 large text and UI). Brand orange is paired with dark ink to meet this, not lightened.
- Light theme only; no color-only state (every status has a text/icon label).
- Visible focus rings on all interactive elements; full keyboard operability (Radix primitives for dialogs/menus).
- `prefers-reduced-motion`: every transition has a crossfade/instant fallback.
- Mobile: touch targets ≥ ~44px; forms and dialogs adapt to small screens rather than overflowing.
