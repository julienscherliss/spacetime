import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, Task } from '@/store/taskStore';
import { X, Clock, Archive, Check, PauseCircle } from 'lucide-react';
import { PriorityBadge } from '@/components/PriorityBadge';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCarryStore } from '@/store/carryStore';
import { useLibraryStore } from '@/store/libraryStore';
import { incrementPlaceCount } from '@/components/LibraryPanel';



function WaitingRoomItem({ task, isMobile, onClosePanel }: { task: Task; isMobile: boolean; onClosePanel: () => void }) {
  const { completeTask, updateTask, deleteTask } = useTaskStore();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const [isHovered, setIsHovered] = useState(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-touch-ignore]')) return;
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      useCarryStore.getState().pickup({
        taskId: task.id,
        title: task.title,
        duration: task.duration || 30,
        fromDate: task.date,
        fromTime: task.time,
        fromWaitingRoom: true,
        pickedUpAt: Date.now(),
      });
      onClosePanel();
    }, 250);
  }, [task, onClosePanel]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-touch-ignore]')) {
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
      return;
    }
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (!longPressFired.current) {
      useCarryStore.getState().pickup({
        taskId: task.id,
        title: task.title,
        duration: task.duration || 30,
        fromDate: task.date,
        fromTime: task.time,
        fromWaitingRoom: true,
        pickedUpAt: Date.now(),
      });
      onClosePanel();
    }
  }, [task, onClosePanel]);

  const handlePointerMove = useCallback(() => {
    if (longPressTimer.current && !longPressFired.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleComplete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    completeTask(task.id);
  }, [task.id, completeTask]);

  const handleMoveToLibrary = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    useLibraryStore.getState().addFromSchedule({
      title: task.title,
      duration: task.duration || 30,
      category: task.category,
      note: task.description,
    });
    deleteTask(task.id);
  }, [task, deleteTask]);

  return (
    <div
      className={`group flex items-center gap-3 rounded-sm hover:bg-muted/40 transition-colors cursor-pointer select-none ${
        isMobile ? 'py-3.5 px-3' : 'py-3 px-3'
      } min-h-[48px]`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onContextMenu={(e) => e.preventDefault()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="w-1 shrink-0" />

      <div className="flex-1 min-w-0">
        <div className={`font-mono text-foreground/80 truncate leading-tight flex items-center gap-2 ${
          isMobile ? 'text-[14px]' : 'text-[13px]'
        }`}>
          <span className="truncate">{task.title}</span>
          <AnimatePresence>
            {!isMobile && isHovered && (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.15 }}
                className="text-[9px] font-mono text-muted-foreground/40 tracking-wider whitespace-nowrap shrink-0"
              >
                hold to place
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`font-mono text-muted-foreground/35 ${isMobile ? 'text-[10px]' : 'text-[10px]'}`}>{task.date}</span>
          {(task.waitingRoomCount || 0) > 1 && (
            <span className="text-[9px] font-mono text-primary/50">{task.waitingRoomCount}× returned</span>
          )}
        </div>
      </div>

      <PriorityBadge priority={task.priority} />

      {/* Action buttons */}
      <div className={`flex items-center gap-0.5 ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={handleComplete}
          data-touch-ignore
          className="p-2 text-muted-foreground/30 hover:text-green-600 active:scale-110 transition-all duration-150"
          title="Mark Done"
        >
          <Check size={isMobile ? 16 : 13} />
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={handleMoveToLibrary}
          data-touch-ignore
          className="p-2 text-muted-foreground/30 hover:text-foreground active:translate-y-[-2px] transition-all duration-150"
          title="Move to Library"
        >
          <Archive size={isMobile ? 16 : 13} />
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
          data-touch-ignore
          className="p-2 text-muted-foreground/30 hover:text-destructive active:rotate-90 transition-all duration-150"
          title="Delete"
        >
          <X size={isMobile ? 16 : 13} />
        </button>
      </div>
    </div>
  );
}

export function WaitingRoom({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tasks } = useTaskStore();
  const isMobile = useIsMobile();

  const waitingTasks = tasks.filter((t) => t.inWaitingRoom && !t.completed && !t.archivedAt);

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-background/40 backdrop-blur-[2px]"
              onClick={onClose}
            />
            <motion.div
              initial={isMobile ? { y: '100%' } : { x: 320, opacity: 0 }}
              animate={isMobile ? { y: 0 } : { x: 0, opacity: 1 }}
              exit={isMobile ? { y: '100%' } : { x: 320, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className={`fixed z-50 bg-card border-border shadow-lg flex flex-col ${
                isMobile
                  ? 'left-0 right-0 bottom-0 top-[40%] border-t rounded-t-lg'
                  : 'right-0 top-0 bottom-0 w-80 border-l'
              }`}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <PauseCircle size={14} className="text-muted-foreground/50" />
                  <span className="text-[12px] font-mono tracking-[0.12em] text-foreground font-medium">
                    LIMBO
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground/40">{waitingTasks.length}</span>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 text-muted-foreground/40 hover:text-foreground transition-colors"
                >
                  <X size={16} strokeWidth={1.5} />
                </button>
              </div>

              <div className="px-4 py-3 border-b border-border/30 bg-muted/20">
                <p className="text-[11px] font-mono text-muted-foreground/60 leading-relaxed">
                  Things left undone tend to gather here.
                </p>
                <p className="text-[11px] font-mono text-muted-foreground/50 leading-relaxed mt-1">
                  Take a moment to decide what still matters—and what doesn't.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto px-2 py-2" style={{ WebkitOverflowScrolling: 'touch' }}>
                {waitingTasks.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <PauseCircle size={24} className="mx-auto text-muted-foreground/15 mb-3" />
                    <p className="text-[12px] font-mono text-muted-foreground/30 tracking-wider">LIMBO IS EMPTY</p>
                    <p className="text-[11px] font-mono text-muted-foreground/20 mt-1">tasks that pass their time move here</p>
                  </div>
                ) : (
                  <div className="space-y-px">
                    {waitingTasks.map((task) => (
                      <WaitingRoomItem key={task.id} task={task} isMobile={isMobile} onClosePanel={onClose} />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
