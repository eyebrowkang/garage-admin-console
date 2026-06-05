import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../lib/cn';

interface PopoverProps {
  /** The clickable anchor (e.g. a "+2" chip). Clicking it toggles the popover. */
  trigger: ReactNode;
  /** Popover content, or a render fn receiving a `close` callback. */
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Horizontal edge to align to the anchor. */
  align?: 'start' | 'end';
  className?: string;
}

const OFFSCREEN: CSSProperties = { position: 'fixed', top: -9999, left: -9999 };

/**
 * A click popover rendered in a body portal, so it escapes the table's
 * `overflow-hidden` clip (an absolutely-positioned panel would be cropped).
 * Positioned with fixed coordinates measured from the anchor, flips above when
 * it would overflow the bottom, clamps to the viewport, and light-dismisses on
 * outside-click / Escape / scroll.
 */
export function Popover({ trigger, children, align = 'start', className }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>(OFFSCREEN);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const pop = popRef.current;
    if (!anchor || !pop) return;
    const a = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const gap = 6;
    let left = align === 'end' ? a.right - pw : a.left;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    let top = a.bottom + gap;
    if (top + ph > window.innerHeight - 8 && a.top - gap - ph > 8) {
      top = a.top - gap - ph; // flip above when there's no room below
    }
    setStyle({ position: 'fixed', top, left });
  }, [align]);

  useLayoutEffect(() => {
    if (open) reposition();
    // Measure-then-place before paint to avoid flicker; the synchronous setState
    // in this layout effect is the intended pattern for positioning.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else setStyle(OFFSCREEN);
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, reposition]);

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {trigger}
      </span>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            style={style}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'z-50 max-h-[60vh] overflow-auto rounded-lg border bg-card p-2 shadow-lg',
              className,
            )}
          >
            {typeof children === 'function' ? children(() => setOpen(false)) : children}
          </div>,
          document.body,
        )}
    </>
  );
}
