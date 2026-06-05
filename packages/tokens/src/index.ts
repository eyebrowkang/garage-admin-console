/**
 * @garage/tokens — design tokens as TypeScript values.
 *
 * Mirrors the CSS variables in `./style.css`. Use these when you need the
 * raw HSL components in JS/TS (e.g. dynamic chart colors, inline styles).
 *
 * Format: HSL triples `"H S% L%"`, ready to drop into `hsl(...)`.
 */

export const tokens = {
  background: '36 100% 99%',
  foreground: '24 23% 12%',

  card: '0 0% 100%',
  cardForeground: '24 23% 12%',

  popover: '0 0% 100%',
  popoverForeground: '24 23% 12%',

  primary: '30 100% 58%',
  primaryForeground: '24 23% 12%',

  secondary: '35 45% 95%',
  secondaryForeground: '24 20% 18%',

  muted: '32 35% 95%',
  mutedForeground: '24 10% 40%',

  accent: '32 48% 92%',
  accentForeground: '24 20% 18%',

  destructive: '0 78% 56%',
  destructiveForeground: '0 0% 100%',

  success: '142 72% 29%',
  successForeground: '0 0% 100%',

  warning: '263 70% 50%',
  warningForeground: '0 0% 100%',

  border: '28 22% 88%',
  input: '28 22% 88%',
  ring: '30 100% 58%',

  radius: '0.5rem',
} as const;

export type TokenName = keyof typeof tokens;

/**
 * Build a CSS `hsl(...)` string for a token, with an optional alpha.
 *
 * @example
 *   hsl('primary')          // "hsl(30 100% 58%)"
 *   hsl('primary', 0.5)     // "hsl(30 100% 58% / 0.5)"
 */
export function hsl(name: TokenName, alpha?: number): string {
  const value = tokens[name];
  if (alpha === undefined) return `hsl(${value})`;
  return `hsl(${value} / ${alpha})`;
}
