import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, Task } from '@/store/taskStore';
import { X, Clock, GripVertical, AlertCircle } from 'lucide-react';
import { PriorityBadge } from '@/components/PriorityBadge';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTouchDragStore } from '@/store/touchDragStore';

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
          <p className="text-[11px] font-mono text-foreground/80 leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-sm border border-border text-[9px] font-mono tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            Keep in Waiting Room
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 rounded-sm bg-primary text-primary-foreground text-[9px] font-mono tracking-widest hover:bg-primary/90 transition-colors"
          >
            Schedule it
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function WaitingRoom({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tasks, updateTask } = useTaskStore();
  const isMobile = useIsMobile();
  const [reflectTask, setReflectTask] = useState<Task | null>(null);

  const waitingTasks = tasks.filter((t) => t.inWaitingRoom && !t.completed);

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setReflectTask(task);
    e.preventDefault(); // prevent default drag — use reflection modal instead
  };

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
                  <span className="text-[11px] font-mono tracking-[0.12em] text-foreground font-medium">
                    WAITING ROOM
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground/30">{waitingTasks.length}</span>
                </div>
                <button
                  onClick={onClose}
                  className="p-1 text-muted-foreground/40 hover:text-foreground transition-colors"
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-2 py-2" style={{ WebkitOverflowScrolling: 'touch' }}>
                {waitingTasks.length === 0 ? (
                  <div className="text-center py-12">
                    <Clock size={20} className="mx-auto text-muted-foreground/15 mb-2" />
                    <p className="text-[10px] font-mono text-muted-foreground/25 tracking-wider">NO OVERDUE TASKS</p>
                    <p className="text-[9px] font-mono text-muted-foreground/15 mt-1">tasks that pass their time move here</p>
                  </div>
                ) : (
                  <div className="space-y-px">
                    {waitingTasks.map((task) => (
                      <div
                        key={task.id}
                        className="group flex items-center gap-2 rounded-sm hover:bg-muted/40 transition-colors cursor-pointer py-2 px-2"
                        onClick={() => setReflectTask(task)}
                      >
                        <GripVertical size={11} className="text-muted-foreground/20 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-mono text-foreground/70 truncate">{task.title}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[9px] font-mono text-muted-foreground/30">{task.date}</span>
                            {(task.waitingRoomCount || 0) > 1 && (
                              <span className="text-[8px] font-mono text-primary/50">{task.waitingRoomCount}× returned</span>
                            )}
                          </div>
                        </div>
                        <PriorityBadge priority={task.priority} />
                      </div>
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
