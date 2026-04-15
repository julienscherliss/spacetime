import { useEffect, useRef } from 'react';
import { TouchDragPayload, useTouchDragStore } from '@/store/touchDragStore';

type Point = { x: number; y: number };

interface UseIntentionalTouchDragOptions<T extends HTMLElement> {
  payload: TouchDragPayload;
  canDrag?: boolean;
  disabled?: boolean;
  threshold?: number;
  preventScrollOnTouchStart?: boolean;
  ignoreSelector?: string;
  onTap?: () => void;
  onDragStart?: (context: { point: Point; element: T }) => void;
  onDragMove?: (point: Point) => void;
  onDragEnd?: (point: Point) => void;
  onCancel?: () => void;
}

const DEFAULT_IGNORE_SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[data-touch-ignore]'
].join(',');

function getTouchById(touchList: TouchList, id: number) {
  for (let i = 0; i < touchList.length; i += 1) {
    if (touchList[i].identifier === id) {
      return touchList[i];
    }
  }

  return null;
}

export function useIntentionalTouchDrag<T extends HTMLElement>({
  payload,
  canDrag = true,
  disabled = false,
  threshold = 8,
  preventScrollOnTouchStart = false,
  ignoreSelector = DEFAULT_IGNORE_SELECTOR,
  onTap,
  onDragStart,
  onDragMove,
  onDragEnd,
  onCancel,
}: UseIntentionalTouchDragOptions<T>) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || disabled) return;

    const moveTarget = element.ownerDocument?.body ?? window;

    let activeTouchId: number | null = null;
    let startPoint: Point | null = null;
    let lastPoint: Point | null = null;
    let dragActivated = false;

    const clearGesture = () => {
      activeTouchId = null;
      startPoint = null;
      lastPoint = null;
      dragActivated = false;
      moveTarget.removeEventListener('touchmove', handleTouchMove);
      moveTarget.removeEventListener('touchend', handleTouchEnd);
      moveTarget.removeEventListener('touchcancel', handleTouchCancel);
    };

    const activateDrag = () => {
      if (!canDrag || dragActivated || !startPoint || !element) return;
      dragActivated = true;
      const rect = element.getBoundingClientRect();
      useTouchDragStore.getState().startDrag(payload, startPoint, {
        width: rect.width,
        height: rect.height,
        offsetX: startPoint.x - rect.left,
        offsetY: startPoint.y - rect.top,
      });
      onDragStart?.({ point: startPoint, element });
      if (lastPoint) {
        useTouchDragStore.getState().moveGhost(lastPoint);
        onDragMove?.(lastPoint);
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (activeTouchId === null || !startPoint) return;
      const touch = getTouchById(event.touches, activeTouchId);
      if (!touch) return;

      lastPoint = { x: touch.clientX, y: touch.clientY };
      const distance = Math.hypot(lastPoint.x - startPoint.x, lastPoint.y - startPoint.y);

      if (!dragActivated && distance >= threshold) {
        // Commit to drag — prevent scroll from here on
        activateDrag();
      }

      if (dragActivated) {
        event.preventDefault();
        useTouchDragStore.getState().moveGhost(lastPoint);
        onDragMove?.(lastPoint);
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (activeTouchId === null) return;
      const touch = getTouchById(event.changedTouches, activeTouchId);
      if (!touch) return;

      lastPoint = { x: touch.clientX, y: touch.clientY };

      if (dragActivated && lastPoint) {
        event.preventDefault();
        useTouchDragStore.getState().moveGhost(lastPoint);
        onDragEnd?.(lastPoint);
      } else {
        // Only fire tap if finger barely moved
        const distance = Math.hypot(lastPoint.x - startPoint!.x, lastPoint.y - startPoint!.y);
        if (distance < threshold) {
          onTap?.();
        }
      }

      clearGesture();
    };

    const handleTouchCancel = (event: TouchEvent) => {
      if (activeTouchId === null) return;

      const { dragging } = useTouchDragStore.getState();
      if (dragActivated && dragging?.id === payload.id && dragging.type === payload.type) {
        useTouchDragStore.getState().endDrag();
      }

      onCancel?.();
      clearGesture();
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;

      const target = event.target as HTMLElement | null;
      if (target?.closest(ignoreSelector)) return;

      if (preventScrollOnTouchStart) {
        event.preventDefault();
      }

      const touch = event.touches[0];
      activeTouchId = touch.identifier;
      startPoint = { x: touch.clientX, y: touch.clientY };
      lastPoint = startPoint;
      dragActivated = false;

      // Don't preventDefault here — let the browser scroll if the user swipes

      moveTarget.addEventListener('touchmove', handleTouchMove, { passive: false });
      moveTarget.addEventListener('touchend', handleTouchEnd, { passive: false });
      moveTarget.addEventListener('touchcancel', handleTouchCancel, { passive: false });
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: !preventScrollOnTouchStart });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      clearGesture();
    };
  }, [
    canDrag,
    disabled,
    ignoreSelector,
    onCancel,
    onDragEnd,
    onDragMove,
    onDragStart,
    onTap,
    payload.duration,
    payload.id,
    payload.sourceDate,
    payload.title,
    payload.type,
    preventScrollOnTouchStart,
    threshold,
  ]);

  return ref;
}