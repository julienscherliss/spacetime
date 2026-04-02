import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { PriorityBadge } from '@/components/PriorityBadge';
import { X, Play, Calendar, Clock, Trash2 } from 'lucide-react';

export function TaskEditPanel() {
  const { tasks, editingTaskId, setEditingTask, updateTask, deleteTask, setFocusTask, setViewMode } = useTaskStore();
  const task = tasks.find((t) => t.id === editingTaskId);

  const [time, setTime] = useState(task?.time || '');
  const [duration, setDuration] = useState(task?.duration || 30);
  const [date, setDate] = useState(task?.date || '');

  useEffect(() => {
    if (task) {
      setTime(task.time || '');
      setDuration(task.duration || 30);
      setDate(task.date);
    }
  }, [task?.id]);

  const handleSave = () => {
    if (!task) return;
    updateTask(task.id, { time, duration, date });
  };

  const handleFocus = () => {
    if (!task) return;
    setFocusTask(task.id);
    setEditingTask(null);
    setViewMode('focus');
  };

  return (
    <AnimatePresence>
      {task && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-[2px] p-4"
          onClick={() => { handleSave(); setEditingTask(null); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="bg-card border border-border rounded-sm p-4 w-full max-w-xs shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 mr-3">
                <h3 className="font-display font-bold text-foreground text-sm leading-tight mb-1.5">
                  {task.title}
                </h3>
                <PriorityBadge priority={task.priority} />
              </div>
              <button
                onClick={() => { handleSave(); setEditingTask(null); }}
                className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>

            {/* Fields */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2">
                <Calendar size={11} className="text-muted-foreground/50 shrink-0" strokeWidth={1.5} />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="flex-1 bg-muted/50 border border-border rounded-sm px-2 py-1.5 text-[10px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <div className="flex items-center gap-2">
                <Clock size={11} className="text-muted-foreground/50 shrink-0" strokeWidth={1.5} />
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="flex-1 bg-muted/50 border border-border rounded-sm px-2 py-1.5 text-[10px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-muted-foreground/50 w-[11px] text-center">⏱</span>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  min={5}
                  step={5}
                  className="flex-1 bg-muted/50 border border-border rounded-sm px-2 py-1.5 text-[10px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <span className="text-[8px] font-mono text-muted-foreground/40">MIN</span>
              </div>
            </div>

            {/* Move info */}
            {task.moveCount > 0 && (
              <div className="text-[8px] font-mono text-muted-foreground/40 tracking-widest mb-3">
                MOVED {task.moveCount}× · ORIGINALLY {['FLEX', 'SEMI', 'FIXED', 'LOCK'][task.originalPriority]}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleFocus}
                className="flex-1 flex items-center justify-center gap-1 py-2 rounded-sm bg-primary text-primary-foreground font-mono text-[9px] tracking-widest hover:bg-primary/90 transition-colors"
              >
                <Play size={10} strokeWidth={1.5} />
                FOCUS
              </button>
              <button
                onClick={() => { deleteTask(task.id); setEditingTask(null); }}
                className="p-2 rounded-sm border border-border text-muted-foreground hover:text-destructive hover:border-destructive/20 transition-colors"
              >
                <Trash2 size={12} strokeWidth={1.5} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
