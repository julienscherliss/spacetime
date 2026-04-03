import { useEffect } from 'react';
import { useTouchDragStore } from '@/store/touchDragStore';

export function TouchDragGhost() {
  const dragging = useTouchDragStore((s) => s.dragging);
  const ghostPos = useTouchDragStore((s) => s.ghostPos);
  const preview = useTouchDragStore((s) => s.preview);

  // When dragging is active, OWN the global touchmove/touchend so the ghost
  // keeps following even if the source component unmounts (e.g. Library panel closes).
  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        useTouchDragStore.getState().moveGhost({ x: touch.clientX, y: touch.clientY });
      }
    };

    // Fallback cleanup: if touchend fires and dragging is still active after a tick,
    // TimelineColumn's handler runs synchronously first. If it handled the drop it
    // already called endDrag. If dragging is still set, the drop missed — clean up.
    const handleEnd = () => {
      setTimeout(() => {
        const { dragging: stillDragging } = useTouchDragStore.getState();
        if (stillDragging) {
          useTouchDragStore.getState().endDrag();
        }
      }, 80);
    };

    window.addEventListener('touchmove', handleMove, { passive: true });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);
    return () => {
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, [dragging]);

  if (!dragging || !ghostPos || !preview) return null;

  return (
    <div
      className="fixed z-[100] pointer-events-none"
      style={{
        left: ghostPos.x - preview.offsetX,
        top: ghostPos.y - preview.offsetY,
        width: preview.width,
        height: preview.height,
      }}
    >
      <div className="h-full rounded-[2px] border border-primary/30 bg-card/95 shadow-lg overflow-hidden backdrop-blur-[2px]">
        <div className="h-full flex items-start justify-between gap-2 px-2 py-1">
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-mono text-foreground truncate block">
              {dragging.title}
            </span>
            <span className="text-[9px] font-mono text-muted-foreground/50">
              {dragging.duration}m
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
