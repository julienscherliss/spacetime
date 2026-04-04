import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, Task } from '@/store/taskStore';
import { X, Clock, AlertCircle, Archive, Check } from 'lucide-react';
import { PriorityBadge } from '@/components/PriorityBadge';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCarryStore } from '@/store/carryStore';
import { useLibraryStore } from '@/store/libraryStore';

function ReflectionModal({ task, onConfirm, onCancel }: { task: Task; onConfirm: () => void; onCancel: () => void }) {
  const count = task.waitingRoomCount || 1;
  const messages = [
    `This task has entered the Waiting Room ${count} time${count > 1 ? 's' : ''}. Is now a good time to commit to it?`,
    `This task has been here ${count} time${count > 1 ? 's' : ''}. Would it help to break it into smaller steps?`,
    `${count} visit${count > 1 ? 's' : ''} to the Waiting Room. Consider delegating this, or giving it a specific time.`,
    `This keeps coming back (${count}×). Maybe it needs a different approach?`,
  ];
  const message = messages[Math.min(count - 1, messages.length - 1)];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/60 backdrop-blur-[2px] p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        className="bg-card border border-border rounded-sm p-4 w-full max-w-xs shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 mb-3">
          <AlertCircle size={16} className="text-primary shrink-0 mt-0.5" />
          <p className="text-[12px] font-mono text-foreground/80 leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-sm border border-border text-[10px] font-mono tracking-wider text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
          >
            Keep in Waiting Room
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-sm bg-primary text-primary-foreground text-[10px] font-mono tracking-widest hover:bg-primary/90 transition-colors min-h-[44px]"
          >
            Schedule it
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function WaitingRoomItem({ task, isMobile, onReflect, onClosePanel }: { task: Task; isMobile: boolean; onReflect: () => void; onClosePanel: () => void }) {
  const { completeTask, updateTask, deleteTask } = useTaskStore();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const handlePointerDown = useCallback(() => {
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

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (!longPressFired.current) {
      onReflect();
    }
  }, [onReflect]);

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
    useLibraryStore.getState().addFromSchedule(task.title, task.duration || 30);
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
    >
      {/* Complete button */}
      <button
        onClick={handleComplete}
        data-touch-ignore
        className="p-1.5 rounded-sm text-muted-foreground/25 hover:text-primary hover:bg-primary/5 transition-all shrink-0"
      >
        <Check size={isMobile ? 16 : 14} />
      </button>

      <div className="flex-1 min-w-0">
        <div className={`font-mono text-foreground/80 truncate leading-tight ${
          isMobile ? 'text-[14px]' : 'text-[13px]'
        }`}>{task.title}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`font-mono text-muted-foreground/35 ${isMobile ? 'text-[10px]' : 'text-[10px]'}`}>{task.date}</span>
          {(task.waitingRoomCount || 0) > 1 && (
            <span className="text-[9px] font-mono text-primary/50">{task.waitingRoomCount}× returned</span>
          )}
        </div>
      </div>

      <PriorityBadge priority={task.priority} />

      {/* Move to library */}
      <button
        onClick={handleMoveToLibrary}
        data-touch-ignore
        className={`p-1.5 text-muted-foreground/25 hover:text-foreground transition-colors ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        title="Move to Library"
      >
        <Archive size={isMobile ? 14 : 12} />
      </button>
    </div>
  );
}

export function WaitingRoom({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tasks, updateTask } = useTaskStore();
  const isMobile = useIsMobile();
  const [reflectTask, setReflectTask] = useState<Task | null>(null);

  const waitingTasks = tasks.filter((t) => t.inWaitingRoom && !t.completed);

  const handleReschedule = (task: Task) => {
    updateTask(task.id, {
      inWaitingRoom: false,
      date: new Date().toISOString().split('T')[0],
      time: '09:00',
    } as any);
    setReflectTask(null);
  };

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
                  <Clock size={14} className="text-muted-foreground/50" />
                  <span className="text-[12px] font-mono tracking-[0.12em] text-foreground font-medium">
                    WAITING ROOM
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

              <div className="flex-1 overflow-y-auto px-2 py-2" style={{ WebkitOverflowScrolling: 'touch' }}>
                {waitingTasks.length === 0 ? (
                  <div className="text-center py-12">
                    <Clock size={24} className="mx-auto text-muted-foreground/15 mb-3" />
                    <p className="text-[12px] font-mono text-muted-foreground/30 tracking-wider">NO OVERDUE TASKS</p>
                    <p className="text-[11px] font-mono text-muted-foreground/20 mt-1">tasks that pass their time move here</p>
                  </div>
                ) : (
                  <div className="space-y-px">
                    {waitingTasks.map((task) => (
                      <WaitingRoomItem key={task.id} task={task} isMobile={isMobile} onReflect={() => setReflectTask(task)} onClosePanel={onClose} />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reflectTask && (
          <ReflectionModal
            task={reflectTask}
            onConfirm={() => handleReschedule(reflectTask)}
            onCancel={() => setReflectTask(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
