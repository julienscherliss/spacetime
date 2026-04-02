import { useState, useCallback, useEffect, useRef } from 'react';

const SCALE_MIN = 28;   // compressed: ~28px per hour
const SCALE_DEFAULT = 56; // default
const SCALE_MAX = 120;  // detailed: ~120px per hour
const SCALE_STEP = 8;
const SCROLL_SENSITIVITY = 0.4;

const STORAGE_KEY_PREFIX = 'do-timescale-';

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function loadScale(view: string): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + view);
    if (raw) return clamp(Number(raw), SCALE_MIN, SCALE_MAX);
  } catch {}
  return SCALE_DEFAULT;
}

function saveScale(view: string, scale: number) {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + view, String(scale));
  } catch {}
}

export function useTimeScale(view: 'day' | 'week') {
  const [hourHeight, setHourHeight] = useState(() => loadScale(view));
  const isDraggingRef = useRef(false);

  // Persist on change
  useEffect(() => {
    saveScale(view, hourHeight);
  }, [hourHeight, view]);

  // Reload when view changes
  useEffect(() => {
    setHourHeight(loadScale(view));
  }, [view]);

  const zoomIn = useCallback(() => {
    setHourHeight(h => clamp(h + SCALE_STEP, SCALE_MIN, SCALE_MAX));
  }, []);

  const zoomOut = useCallback(() => {
    setHourHeight(h => clamp(h - SCALE_STEP, SCALE_MIN, SCALE_MAX));
  }, []);

  const resetZoom = useCallback(() => {
    setHourHeight(SCALE_DEFAULT);
  }, []);

  const setDragging = useCallback((v: boolean) => {
    isDraggingRef.current = v;
  }, []);

  // Attach Alt+scroll handler to a container ref
  const bindScrollZoom = useCallback((container: HTMLElement | null) => {
    if (!container) return;

    const handler = (e: WheelEvent) => {
      if (isDraggingRef.current) return;
      // Alt/Option + scroll
      if (!e.altKey) return;
      e.preventDefault();
      const delta = -e.deltaY * SCROLL_SENSITIVITY;
      setHourHeight(h => clamp(h + delta, SCALE_MIN, SCALE_MAX));
    };

    container.addEventListener('wheel', handler, { passive: false });
    return () => container.removeEventListener('wheel', handler);
  }, []);

  // Pinch-to-zoom for touch
  const bindPinchZoom = useCallback((container: HTMLElement | null) => {
    if (!container) return;
    let initialDistance = 0;
    let initialScale = SCALE_DEFAULT;

    const getDistance = (touches: TouchList) => {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initialDistance = getDistance(e.touches);
        initialScale = loadScale(view);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || isDraggingRef.current) return;
      e.preventDefault();
      const dist = getDistance(e.touches);
      const ratio = dist / initialDistance;
      setHourHeight(clamp(initialScale * ratio, SCALE_MIN, SCALE_MAX));
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
    };
  }, [view]);

  const zoomPercent = Math.round(((hourHeight - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100);

  return {
    hourHeight,
    zoomIn,
    zoomOut,
    resetZoom,
    setDragging,
    bindScrollZoom,
    bindPinchZoom,
    zoomPercent,
    isMin: hourHeight <= SCALE_MIN,
    isMax: hourHeight >= SCALE_MAX,
    isDefault: hourHeight === SCALE_DEFAULT,
  };
}
