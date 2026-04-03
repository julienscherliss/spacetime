import { useTouchDragStore } from '@/store/touchDragStore';

export function TouchDragGhost() {
  const dragging = useTouchDragStore((s) => s.dragging);
  const ghostPos = useTouchDragStore((s) => s.ghostPos);

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
