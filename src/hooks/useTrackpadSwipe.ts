import { useEffect, useRef, useCallback } from 'react';

/**
 * Detects intentional two-finger trackpad swipes on Mac.
 * Mac trackpad swipes fire wheel events — we accumulate deltaX/deltaY
 * and trigger callbacks when a threshold is crossed, with debounce
 * to prevent rapid-fire triggers from inertial scrolling.
 */
interface UseTrackpadSwipeOptions {
  direction: 'horizontal' | 'vertical';
  threshold?: number;
  cooldown?: number;
  /** Only fire when gesture starts inside this element */
  containerRef?: React.RefObject<HTMLElement | null>;
  onSwipePositive?: () => void; // right or down
  onSwipeNegative?: () => void; // left or up
  enabled?: boolean;
}

export function useTrackpadSwipe({
  direction,
  threshold = 150,
  cooldown = 600,
  containerRef,
  onSwipePositive,
  onSwipeNegative,
  enabled = true,
}: UseTrackpadSwipeOptions) {
  const accumulatedRef = useRef(0);
  const lastTriggerRef = useRef(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!enabled) return;
    // Skip if this is a pinch-to-zoom gesture (ctrlKey or altKey)
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const delta = direction === 'horizontal' ? e.deltaX : e.deltaY;
    const crossDelta = direction === 'horizontal' ? e.deltaY : e.deltaX;

    // Only process if movement is primarily in the target direction
    if (Math.abs(delta) < Math.abs(crossDelta) * 0.5) return;
    // Ignore tiny movements
    if (Math.abs(delta) < 2) return;

    // Cooldown check
    const now = Date.now();
    if (now - lastTriggerRef.current < cooldown) return;

    accumulatedRef.current += delta;

    // Reset accumulator if no input for a while
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      accumulatedRef.current = 0;
    }, 200);

    if (accumulatedRef.current > threshold) {
      accumulatedRef.current = 0;
      lastTriggerRef.current = now;
      if (direction === 'horizontal') {
        onSwipeNegative?.(); // scrolled right = swipe left = next
      } else {
        onSwipeNegative?.(); // scrolled down = swipe up = next
      }
    } else if (accumulatedRef.current < -threshold) {
      accumulatedRef.current = 0;
      lastTriggerRef.current = now;
      if (direction === 'horizontal') {
        onSwipePositive?.(); // scrolled left = swipe right = prev
      } else {
        onSwipePositive?.(); // scrolled up = swipe down = prev
      }
    }
  }, [direction, threshold, cooldown, onSwipePositive, onSwipeNegative, enabled]);

  useEffect(() => {
    const el = containerRef?.current ?? document.documentElement;
    if (!el || !enabled) return;

    el.addEventListener('wheel', handleWheel, { passive: true });
    return () => {
      el.removeEventListener('wheel', handleWheel);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [handleWheel, containerRef, enabled]);
}
