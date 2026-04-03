import { useEffect } from 'react';
import { useTouchDragStore } from '@/store/touchDragStore';

export function TouchDragGhost() {
  const dragging = useTouchDragStore((s) => s.dragging);
  const ghostPos = useTouchDragStore((s) => s.ghostPos);

  // Global fallback: if touchend fires and dragging is still active after a tick, cancel it
  // (TimelineColumn's handler runs synchronously and calls endDrag, so if it's still set, drop missed)
  useEffect(() => {
    if (!dragging) return;
    const handler = () => {
      setTimeout(() => {
        const { dragging: stillDragging } = useTouchDragStore.getState();
        if (stillDragging) {
          useTouchDragStore.getState().endDrag();
        }
      }, 50);
    };
    window.addEventListener('touchend', handler);
    window.addEventListener('touchcancel', handler);
    return () => {
      window.removeEventListener('touchend', handler);
      window.removeEventListener('touchcancel', handler);
    };
  }, [dragging]);

  if (!dragging || !ghostPos) return null;

  return (
    <div
      className="fixed z-[100] pointer-events-none"
      style={{
        left: ghostPos.x - 60,
        top: ghostPos.y - 16,
      }}
    >
      <div className="bg-card border border-primary/30 rounded-sm shadow-lg px-3 py-1.5 max-w-[180px]">
        <span className="text-[11px] font-mono text-foreground truncate block">
          {dragging.title}
        </span>
        <span className="text-[9px] font-mono text-muted-foreground/50">
          {dragging.duration}m
        </span>
      </div>
    </div>
  );
}
