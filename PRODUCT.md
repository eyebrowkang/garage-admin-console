# Product

## Register

product

## Users

Self-hosting sysadmins and platform/DevOps teams managing Garage distributed object storage clusters. Technical users comfortable with the CLI who reach for this console when they need a visual overview, want to perform bulk operations, or are onboarding a colleague who doesn't live in the terminal. The context is operational: they're checking cluster health, provisioning buckets, rotating keys, or diagnosing layout imbalances. Sessions are short and task-driven.

## Product Purpose

A web admin console for Garage object storage. It makes cluster operations visible and actionable without memorizing CLI flags or parsing JSON output. Success means the operator trusts the console to show ground truth, completes their task without friction, and closes the tab.

## Brand Personality

Confident, clear, calm. The interface conveys expert competence without showing off. It never over-explains, never dramatizes, and never makes the operator feel like a novice. Information density is welcome; visual noise is not.

## Anti-references

- **Flashy SaaS dashboards**: no gradient heroes, no vanity metrics, no sales-driven chrome. This is infrastructure tooling, not a growth product.
- **Bare-bones CLI wrappers**: the console should feel deliberately designed, not like a terminal output piped into HTML tables. Visual hierarchy, spacing, and polish earn trust.
- **Over-designed dev tools**: avoid excessive decoration that makes the tool feel like a consumer app. Components serve the task; ornament is suspect.

## Design Principles

1. **Show ground truth.** Every number, status, and identifier on screen must reflect the cluster's actual state. Prefer raw data with good formatting over abstracted summaries that obscure what's really happening.
2. **Disappear into the task.** The interface succeeds when operators forget they're using it. Consistent patterns, predictable navigation, zero surprises. The tool is a window, not a destination.
3. **Density without clutter.** These users want to see more, not less. Tables with many rows, sidebars with many links, and detail pages with all the fields are virtues. But every element earns its space through alignment, grouping, and whitespace rhythm.
4. **Calm authority.** Use restraint in color, motion, and copy. The orange accent marks actionable elements; everything else stays neutral. Status changes are visible but never alarming unless something is genuinely wrong.
5. **Respect the operator.** No tutorials for obvious actions, no confirmation dialogs for safe operations, no loading spinners where skeleton states work. Trust that users know what they're doing and show them the information they need.

## Accessibility & Inclusion

WCAG AA compliance: 4.5:1 minimum contrast for body text, 3:1 for large text and UI components. Full keyboard navigation. Meaningful focus indicators. Screen-reader-friendly markup with semantic HTML and ARIA where needed. Reduced-motion alternatives for any animations shipped.
