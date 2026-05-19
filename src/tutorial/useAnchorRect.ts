import { useEffect, useState } from 'react';

export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Track a DOM element matching `[data-tutorial="<id>"]` (or null for centered).
 * Re-measures on resize, scroll, and a polling interval so it tracks layout
 * changes (panel slide-ins, etc) without requiring callers to know about it.
 */
export function useAnchorRect(anchorId: string | null): AnchorRect | null {
  const [rect, setRect] = useState<AnchorRect | null>(null);

  useEffect(() => {
    if (!anchorId) {
      setRect(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      // Pick the first visible match — components may render the same anchor
      // id in both mobile and desktop layouts; only one is on screen.
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(
        `[data-tutorial="${anchorId}"]`
        )
      );
      const el = nodes.find((n) => {
        const r = n.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        // Reject if the element (or a descendant) is not what's actually
        // painted at its center — i.e. something like a Settings/Archive
        // panel is covering it. This prevents the spotlight from outlining
        // a blank patch of an overlay panel.
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        if (!top) return false;
        return n === top || n.contains(top) || top.contains(n);
      });
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect((prev) => {
        if (
          prev &&
          Math.abs(prev.top - r.top) < 0.5 &&
          Math.abs(prev.left - r.left) < 0.5 &&
          Math.abs(prev.width - r.width) < 0.5 &&
          Math.abs(prev.height - r.height) < 0.5
        )
          return prev;
        return { top: r.top, left: r.left, width: r.width, height: r.height };
      });
    };
    measure();
    const tick = () => {
      measure();
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchorId]);

  return rect;
}