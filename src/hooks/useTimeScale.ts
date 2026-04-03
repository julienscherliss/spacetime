import { useState, useCallback, useEffect, useRef } from 'react';

export const SCALE_MIN = 28;
export const SCALE_DEFAULT = 56;
export const SCALE_MAX = 120;

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

  useEffect(() => {
    saveScale(view, hourHeight);
  }, [hourHeight, view]);

  useEffect(() => {
    setHourHeight(loadScale(view));
  }, [view]);

  const setScale = useCallback((v: number) => {
    setHourHeight(clamp(v, 10, SCALE_MAX));
  }, []);

  const zoomIn = useCallback(() => {
    setHourHeight(h => clamp(h + 4, SCALE_MIN, SCALE_MAX));
  }, []);

  const zoomOut = useCallback(() => {
    setHourHeight(h => clamp(h - 4, SCALE_MIN, SCALE_MAX));
  }, []);

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
      if (!e.altKey) return;
      e.preventDefault();
      const delta = -e.deltaY * SCROLL_SENSITIVITY;
      setHourHeight(h => clamp(h + delta, SCALE_MIN, SCALE_MAX));
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
        // Store the gesture midpoint relative to the container's viewport
        const rect = container.getBoundingClientRect();
        gestureMidY = getMidY(e.touches) - rect.top;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || isDraggingRef.current) return;
      e.preventDefault();
      const dist = getDistance(e.touches);
      const ratio = dist / initialDistance;
      const newScale = clamp(initialScale * ratio, SCALE_MIN, SCALE_MAX);

      // Calculate the "time position" under the gesture midpoint at the start
      // timePos = (scrollTop + gestureMidY) / initialScale  (in "hours" units)
      const timePos = (initialScrollTop + gestureMidY) / initialScale;

      setHourHeight(newScale);

      // Adjust scroll so the same time position stays under the gesture midpoint
      container.scrollTop = timePos * newScale - gestureMidY;
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
    setScale,
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
