import { useEffect } from 'react';
import { useTouchDragStore } from '@/store/touchDragStore';

export function TouchDragGhost() {
  const dragging = useTouchDragStore((s) => s.dragging);
  const ghostPos = useTouchDragStore((s) => s.ghostPos);
  const preview = useTouchDragStore((s) => s.preview);

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
