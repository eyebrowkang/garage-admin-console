import { useEffect, useRef } from 'react';

/**
 * Number-key tab switching for facet-rich detail pages: press 1..9 to jump to
 * the matching tab. Ignores keypresses while typing (inputs, textareas,
 * selects, contenteditable) and when a modifier is held, so it never fights
 * native shortcuts or form entry. Binds the listener once and reads the latest
 * args through a ref so callers can pass fresh arrays/handlers each render.
 */
export function useTabHotkeys(values: string[], onSelect: (value: string) => void) {
  const latest = useRef({ values, onSelect });
  // Keep the once-bound listener reading fresh args without re-binding. Writing
  // the ref in an effect (not during render) is the pattern react-hooks/refs wants.
  useEffect(() => {
    latest.current = { values, onSelect };
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.closest('[role="dialog"]'))
      ) {
        return;
      }
      const index = Number(event.key) - 1;
      const { values: vals, onSelect: select } = latest.current;
      if (Number.isInteger(index) && index >= 0 && index < vals.length) {
        select(vals[index]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

/**
 * Render-prop-free wrapper so a page can opt into number-key tab switching by
 * dropping `<TabHotkeys values={...} onSelect={...} />` inside its `<Tabs>`,
 * with no impact on the page's own hook order. Renders nothing.
 */
export function TabHotkeys({
  values,
  onSelect,
}: {
  values: string[];
  onSelect: (value: string) => void;
}): null {
  useTabHotkeys(values, onSelect);
  return null;
}
