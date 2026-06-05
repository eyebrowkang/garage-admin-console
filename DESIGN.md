---
name: Garage Admin Console
description: A warm, precise admin console for managing distributed object storage
colors:
  garage-orange: "#ff9429"
  warm-ink: "#261d18"
  warm-paper: "#fffdfa"
  warm-white: "#ffffff"
  warm-linen: "#f8f3ed"
  warm-stone: "#f7f3ee"
  warm-sand: "#f4ebe1"
  warm-clay: "#e7e0da"
  warm-slate: "#70645c"
  signal-red: "#e63737"
  signal-green: "#157f3c"
  signal-purple: "#6b26d9"
typography:
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  subtitle:
    fontFamily: "Manrope, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Manrope, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Manrope, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.garage-orange}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "#e68525"
    textColor: "{colors.warm-ink}"
  button-outline:
    backgroundColor: "{colors.warm-paper}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-destructive:
    backgroundColor: "{colors.signal-red}"
    textColor: "{colors.warm-white}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost-hover:
    backgroundColor: "{colors.warm-sand}"
    textColor: "{colors.warm-ink}"
  card-default:
    backgroundColor: "{colors.warm-white}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input-default:
    backgroundColor: "transparent"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  badge-success:
    backgroundColor: "#157f3c1a"
    textColor: "{colors.signal-green}"
    rounded: "9999px"
    padding: "2px 10px"
  badge-warning:
    backgroundColor: "#6b26d91a"
    textColor: "{colors.signal-purple}"
    rounded: "9999px"
    padding: "2px 10px"
  badge-destructive:
    backgroundColor: "#e637371a"
    textColor: "{colors.signal-red}"
    rounded: "9999px"
    padding: "2px 10px"
---

# Design System: Garage Admin Console

## 1. Overview

**Creative North Star: "The Workshop Bench"**

A craftsman's workbench: warm wood tones, honest materials, purposeful tools laid out where the hand expects them. The orange is the branded handle on every tool; the warm neutrals are the bench surface, worn smooth by use. Nothing decorative, everything functional, but the whole composition has the quiet beauty of a well-organized workspace.

This system rejects three things absolutely: the flashy SaaS dashboard (gradient heroes, vanity metrics, sales chrome), the bare-bones CLI wrapper (terminal output in HTML tables), and the over-designed dev tool (consumer-app ornament on infrastructure surfaces). The console earns trust through precision and restraint, not through visual spectacle.

Light theme only. The operators work in well-lit contexts (server rooms, offices, home labs); dark mode is intentionally out of scope. The palette is a restrained four-color system: theme orange for actions and brand, red for errors, green for health, purple for warnings. Everything else is warm neutral.

**Key Characteristics:**
- Warm neutrals ground the interface; the orange accent is reserved for primary actions and selection state
- Single typeface (Manrope) across all levels, hierarchy through weight and size only
- Rounded but sturdy components (8px radius on cards, 6px on controls)
- Density without clutter: tables with many rows, detail pages with all the fields, whitespace as structure
- Responsive table-to-card pattern (ResourceList) so mobile loses no information

## 2. Colors: The Four-Signal Palette

A restrained palette built on warm neutrals with exactly four chromatic signals. The orange is the only color that carries brand identity; the three semantic colors (red, green, purple) exist solely for status communication and never overlap with decorative use.

### Primary
- **Garage Orange** (`#ff9429` / `hsl(30, 100%, 58%)`): Primary actions, selection state, focus rings, and brand presence. Foreground on this fill is always dark ink (`#261d18`), never white (white on this orange is only 2.21:1, failing WCAG AA). Used on solid button fills, active nav indicators, checkbox accents, and text selection highlight (at 25% opacity).

### Neutral
- **Warm Ink** (`#261d18` / `hsl(24, 23%, 12%)`): Body text, headings, and primary foreground. A warm near-black, not a cold gray.
- **Warm Paper** (`#fffdfa` / `hsl(36, 100%, 99%)`): Body background. Nearly white with the faintest warm cast. The background carries a subtle linear gradient toward Warm Linen at the bottom-right.
- **Warm White** (`#ffffff`): Card and popover surfaces. Pure white against the tinted background gives cards a lifted, clean feel.
- **Warm Linen** (`#f8f3ed` / `hsl(35, 45%, 95%)`): Secondary surfaces, sidebar backgrounds, hover fills on secondary buttons.
- **Warm Stone** (`#f7f3ee` / `hsl(32, 35%, 95%)`): Muted surfaces and disabled backgrounds.
- **Warm Sand** (`#f4ebe1` / `hsl(32, 48%, 92%)`): Accent hover states, ghost button hover fill.
- **Warm Clay** (`#e7e0da` / `hsl(28, 22%, 88%)`): Borders, input strokes, dividers. The hairline that structures the interface.
- **Warm Slate** (`#70645c` / `hsl(24, 10%, 40%)`): Muted foreground for secondary text, descriptions, timestamps. Passes WCAG AA (4.5:1) against both Warm Paper and Warm White backgrounds.

### Semantic
- **Signal Red** (`#e63737` / `hsl(0, 78%, 56%)`): Destructive actions (delete, remove) and error states. Used as solid fills (white foreground) and as 10%-opacity tints behind red text badges.
- **Signal Green** (`#157f3c` / `hsl(142, 72%, 29%)`): Health and success indicators. Dark enough to pass WCAG AA as text on light tints.
- **Signal Purple** (`#6b26d9` / `hsl(263, 70%, 50%)`): Warnings and caution states. Used for irreversible-but-not-destructive actions (e.g., cleaning up incomplete uploads). Not the typical yellow/amber: this system uses purple to avoid confusion with the orange brand color.

### Named Rules
**The Four-Color Discipline.** No color exists outside the four-signal system. If a new status needs a color, it maps to one of the four. No teal, no blue, no secondary accent. The palette's restraint is its identity.

**The Dark-Ink-on-Orange Rule.** White text on Garage Orange is prohibited (fails WCAG AA at 2.21:1). Every orange fill uses `#261d18` as foreground.

## 3. Typography

**Body Font:** Manrope (with system sans-serif fallback)

**Character:** A single geometric sans that carries the entire hierarchy through weight contrast alone. Manrope's wide apertures and clean geometry give it the technical clarity of a monospace without the density penalty. Five weights loaded (400, 500, 600, 700, 800) provide enough range for every level without a second family.

### Hierarchy
- **Title** (700, 1.875rem / 30px, line-height 1.2, tracking -0.025em): Page headings on list pages (ModulePageHeader). Bold and tracked tight for authority.
- **Detail Title** (600, 1.25rem / 20px, line-height 1.3, tracking -0.015em): Detail page headings (DetailPageHeader). Slightly smaller, semibold, paired with breadcrumb navigation above.
- **Body** (400, 0.875rem / 14px, line-height 1.5): Descriptions, table cells, form help text. The workhorse.
- **Label** (600, 0.75rem / 12px, line-height 1.4): Column headers, field labels, badge text. Semibold at small sizes for legibility.
- **Small** (500, 0.75rem / 12px, line-height 1.4): Timestamps, secondary metadata, muted supplementary text.

### Named Rules
**The One-Family Rule.** Manrope everywhere. No display font for heroes, no monospace for data (unless rendering actual code/terminal output via the TerminalOutput component). Hierarchy is weight and size, never typeface.

## 4. Elevation

Flat by default. Shadows exist but serve a narrow, structural role: cards at rest carry a barely-visible `shadow` or `shadow-sm` to separate them from the tinted background. Hover lifts cards to `shadow-md` as interaction feedback. No dramatic drops, no layered shadow stacks, no ambient glows.

Depth is primarily conveyed through surface color: white cards on the warm-paper background, the warm-linen sidebar against the white content area. This tonal layering does the heavy lifting; shadows are a secondary reinforcement, not the primary depth signal.

### Shadow Vocabulary
- **Card rest** (`shadow` / `shadow-sm`): Subtle separation from the background gradient. Present on cards, popovers, and dropdown menus.
- **Card hover** (`shadow-md`): Lift on interactive cards (StatusCard, fleet items) to signal clickability.

### Named Rules
**The Flat-First Rule.** Shadows appear only as a response to state (hover, elevation from background) or to establish a popover/dropdown layer. No decorative shadows. No shadows on buttons, inputs, or inline elements at rest (inputs get `shadow-sm` as the single exception, for subtle depth on the transparent background).

## 5. Components

Components feel warm and sturdy: the orange anchor gives warmth, consistent 6-8px radii and firm padding give sturdiness. Every interactive component carries default, hover, focus, active, and disabled states.

### Buttons
- **Shape:** Gently rounded (6px radius), 36px default height, 14px text
- **Primary:** Solid Garage Orange fill with dark ink text. Hover darkens to 90% opacity. Disabled state drops to muted neutral fill (not a washed-out orange). Touch targets expand to 44px on pointer-coarse devices.
- **Focus:** 2px ring in Garage Orange, 2px offset from the background.
- **Destructive:** Solid Signal Red fill, white text. Same hover/disabled pattern.
- **Warning:** Solid Signal Purple fill, white text. For irreversible, non-destructive actions.
- **Outline:** Warm Clay border on Warm Paper, hover fills with Warm Sand.
- **Ghost:** Transparent at rest, Warm Sand fill on hover.
- **Link:** Orange text with underline on hover.

### Badges
- **Style:** Fully rounded (pill shape, 9999px radius), no border, 12px semibold text
- **Semantic variants:** 10%-opacity tint of the status color as background, full-strength status color as text (success, warning, destructive). This keeps badges lightweight while maintaining clear status communication.
- **Default:** Solid Garage Orange fill with dark ink text.
- **Secondary:** Warm Linen fill, darker warm text.

### Cards / Containers
- **Corner Style:** Gently rounded (8px radius)
- **Background:** Pure white (`#ffffff`) on the warm-tinted body background
- **Shadow Strategy:** `shadow` or `shadow-sm` at rest, `shadow-md` on hover for interactive cards (see Elevation)
- **Border:** 1px Warm Clay (`#e7e0da`). StatusCard uses full-border tinting in the status color (at 40-50% opacity) instead of side stripes.
- **Internal Padding:** 24px (p-6) for card body, 24px header/footer with 0 top-padding on content for tight header-to-content spacing.

### Inputs / Fields
- **Style:** Transparent background, 1px Warm Clay border, 6px radius, 36px height
- **Focus:** Border shifts to Garage Orange, 2px ring in orange at 70% opacity. Smooth transition on color, box-shadow, and border-color.
- **Disabled:** 50% opacity, not-allowed cursor.
- **Mobile:** Font-size forced to 16px below 768px to prevent iOS auto-zoom.

### Navigation
- **Desktop:** Collapsible sidebar (ClusterSidebar) at the left edge on lg+, with cluster name and endpoint at top, nav links below. Content area takes remaining width.
- **Mobile:** Navigation collapses into the global header's hamburger drawer (ClusterMobileNav). Full-width content below.
- **Active state:** Garage Orange indicator on the current nav item.
- **Page headers:** Two tiers. ModulePageHeader for list pages (large bold title, description, action buttons). DetailPageHeader for detail pages (breadcrumb, optional back button, smaller semibold title, badges, actions).

### ResourceList (Signature Component)
The responsive table-to-card shell that every cluster list page renders through. On `md`+ it is a real HTML table; below `md` every row reflows into a stacked label/value card. Owns search, sort, multi-select with floating bulk-action bar, and empty/search-miss states. Pages stay declarative: they describe columns and hand over data.

## 6. Do's and Don'ts

### Do:
- **Do** use dark ink (`#261d18`) on every Garage Orange fill. Never white text on orange.
- **Do** use 10%-opacity tints of semantic colors for badge/status backgrounds, with the full-strength color as text. Lightweight status that reads clearly.
- **Do** use the full-border status pattern on cards (StatusCard). A subtle tinted border around the whole card, not a thick side stripe.
- **Do** keep the palette to exactly four chromatic signals (orange, red, green, purple). Map new statuses to existing colors.
- **Do** use Manrope at every hierarchy level. Vary weight (400-800) and size, never typeface.
- **Do** provide `prefers-reduced-motion: reduce` alternatives for every animation.
- **Do** expand touch targets to 44px on pointer-coarse devices (`pointer-coarse:min-h-11`).

### Don't:
- **Don't** use gradient heroes, vanity metric cards, or sales-driven chrome. This is infrastructure tooling, not a growth product.
- **Don't** ship a component that looks like terminal output in an HTML table. The console is deliberately designed; raw data gets formatting, hierarchy, and whitespace.
- **Don't** add consumer-app ornament (decorative illustrations, playful micro-interactions, whimsical empty states). Components serve the task.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on cards, alerts, or callouts. Status is carried by full borders and text badges.
- **Don't** introduce colors outside the four-signal system. No teal info banners, no blue links, no secondary accent hue.
- **Don't** use a display or decorative font anywhere. Not for page titles, not for the login screen, not for marketing copy.
- **Don't** apply shadows to buttons or inputs at rest (inputs get `shadow-sm` as the documented exception).
- **Don't** animate layout properties or use choreographed page-load sequences. Motion is 150-250ms state feedback only.
