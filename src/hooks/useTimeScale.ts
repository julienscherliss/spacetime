import { useState, useCallback, useEffect, useRef } from 'react';
import { START_HOUR } from '@/components/TimelineColumn';
import { useTimezoneStore } from '@/store/timezoneStore';

export const SCALE_MIN = 28;
export const SCALE_DEFAULT = 56;
export const SCALE_MAX = 120;
export const SCALE_MAX_COMFORT = 168;

const SCROLL_SENSITIVITY = 0.4;
const STORAGE_KEY_PREFIX = 'do-timescale-';

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function getEffectiveMax(): number {
  return useTimezoneStore.getState().comfortMode ? SCALE_MAX_COMFORT : SCALE_MAX;
}

function loadScale(view: string): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + view);
    if (raw) return clamp(Number(raw), SCALE_MIN, getEffectiveMax());
  } catch {}
  return SCALE_DEFAULT;
}

function saveScale(view: string, scale: number) {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + view, String(scale));
  } catch {}
}

/**
 * Shared animated zoom that uses the EXACT same focal-point math as pinch gestures.
 *
 * Pinch math (from bindPinchZoom):
 *   timePos = (scrollTop + focalViewportY) / oldScale
 *   newScrollTop = timePos * newScale - focalViewportY
 *
 * This function animates scale from A→B and on every frame recomputes scroll
 * using the same formula, keeping focalMin pinned at focalViewportY.
 *
 * Returns a cancel function.
 */
export function animatePinchZoom(opts: {
  fromScale: number;
  toScale: number;
  /** The time (minutes from midnight) to keep visually pinned */
  focalMin: number;
  /** The viewport-Y coordinate where focalMin should stay */
  focalViewportY: number;
  /** Document-top of the timeline container (scrollRef.getBoundingClientRect().top + scrollY) */
  timelineDocTop: number;
  /** Animation duration in ms */
  duration: number;
  /** Scale setter — called every frame */
  setScale: (v: number) => void;
  /** Called once when animation completes */
  onComplete?: () => void;
}): () => void {
  const { fromScale, toScale: rawTo, focalMin, focalViewportY, timelineDocTop, duration, setScale, onComplete } = opts;
  const toScale = clamp(rawTo, SCALE_MIN, getEffectiveMax());
  const startTime = performance.now();
  let cancelled = false;

  // Pinch easing — same feel as a quick physical pinch
  function easeOut(t: number) {
    return 1 - Math.pow(1 - t, 3);
  }

  // Convert focalMin to the timeline-relative pixel offset (independent of scale)
  // At any given scale s: docY = timelineDocTop + ((focalMin - START_HOUR*60) / 60) * s
  // We want: window.scrollY = docY - focalViewportY
  const focalTimeHours = (focalMin - START_HOUR * 60) / 60;

  function tick(now: number) {
    if (cancelled) return;
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    const eased = easeOut(progress);

    const currentScale = fromScale + (toScale - fromScale) * eased;
    setScale(currentScale);

    // Exact pinch focal-point scroll: keep focalMin at focalViewportY
    const docY = timelineDocTop + focalTimeHours * currentScale;
    const targetScroll = Math.max(0, docY - focalViewportY);
    window.scrollTo({ top: targetScroll, behavior: 'auto' });

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      onComplete?.();
    }
  }

  requestAnimationFrame(tick);

  return () => { cancelled = true; };
}

export function useTimeScale(view: 'day' | 'week') {
  const comfortMode = useTimezoneStore((s) => s.comfortMode);
  const effectiveMax = comfortMode ? SCALE_MAX_COMFORT : SCALE_MAX;
  const [hourHeight, setHourHeight] = useState(() => loadScale(view));
  const isDraggingRef = useRef(false);

  useEffect(() => {
    saveScale(view, hourHeight);
  }, [hourHeight, view]);

  useEffect(() => {
    setHourHeight(loadScale(view));
  }, [view]);

  const setScale = useCallback((v: number) => {
    setHourHeight(clamp(v, 10, effectiveMax));
  }, [effectiveMax]);

  const zoomIn = useCallback(() => {
    setHourHeight(h => clamp(h + 4, SCALE_MIN, effectiveMax));
  }, [effectiveMax]);

  const zoomOut = useCallback(() => {
    setHourHeight(h => clamp(h - 4, SCALE_MIN, effectiveMax));
  }, [effectiveMax]);

  const resetZoom = useCallback(() => {
    setHourHeight(SCALE_DEFAULT);
  }, []);

  const setDragging = useCallback((v: boolean) => {
    isDraggingRef.current = v;
  }, []);

  const bindScrollZoom = useCallback((container: HTMLElement | null) => {
    if (!container) return;
    const handler = (e: WheelEvent) => {
      if (isDraggingRef.current) return;
      if (!e.altKey && !e.ctrlKey) return;
      e.preventDefault();
      const sensitivity = e.ctrlKey ? SCROLL_SENSITIVITY * 2.5 : SCROLL_SENSITIVITY;
      const delta = -e.deltaY * sensitivity;
      setHourHeight(h => clamp(h + delta, SCALE_MIN, effectiveMax));
    };
    container.addEventListener('wheel', handler, { passive: false });
    return () => container.removeEventListener('wheel', handler);
  }, []);

  const bindPinchZoom = useCallback((container: HTMLElement | null) => {
    if (!container) return;
    let initialDistance = 0;
    let initialScale = SCALE_DEFAULT;
    let initialScrollTop = 0;
    let gestureMidY = 0;

    const getDistance = (touches: TouchList) => {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const getMidY = (touches: TouchList) => {
      if (touches.length < 2) return 0;
      return (touches[0].clientY + touches[1].clientY) / 2;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initialDistance = getDistance(e.touches);
        initialScale = loadScale(view);
        initialScrollTop = container.scrollTop;
        const rect = container.getBoundingClientRect();
        gestureMidY = getMidY(e.touches) - rect.top;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || isDraggingRef.current) return;
      e.preventDefault();
      const dist = getDistance(e.touches);
      const ratio = dist / initialDistance;
      const newScale = clamp(initialScale * ratio, SCALE_MIN, effectiveMax);

      const timePos = (initialScrollTop + gestureMidY) / initialScale;

      setHourHeight(newScale);

      container.scrollTop = timePos * newScale - gestureMidY;
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
    };
  }, [view]);

  const zoomPercent = Math.round(((hourHeight - SCALE_MIN) / (effectiveMax - SCALE_MIN)) * 100);

  return {
    hourHeight,
    setScale,
    zoomIn,
    zoomOut,
    resetZoom,
    setDragging,
    bindScrollZoom,
    bindPinchZoom,
    zoomPercent,
    isMin: hourHeight <= SCALE_MIN,
    isMax: hourHeight >= effectiveMax,
    isDefault: hourHeight === SCALE_DEFAULT,
  };
}
