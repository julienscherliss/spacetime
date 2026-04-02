import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, Task } from '@/store/taskStore';
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
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
          onClick={() => { handleSave(); setEditingTask(null); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="bg-card border border-border rounded-lg p-5 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 mr-3">
                <h3 className="font-display font-bold text-foreground text-base leading-tight mb-2">
                  {task.title}
                </h3>
                <PriorityBadge priority={task.priority} />
              </div>
              <button
                onClick={() => { handleSave(); setEditingTask(null); }}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Fields */}
            <div className="space-y-3 mb-5">
              <div className="flex items-center gap-2">
                <Calendar size={13} className="text-muted-foreground shrink-0" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="flex-1 bg-secondary border border-border rounded px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-muted-foreground shrink-0" />
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="flex-1 bg-secondary border border-border rounded px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-muted-foreground tracking-wider w-[13px] text-center">⏱</span>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  min={5}
                  step={5}
                  className="flex-1 bg-secondary border border-border rounded px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-[10px] font-mono text-muted-foreground">min</span>
              </div>
            </div>

            {/* Move count info */}
            {task.moveCount > 0 && (
              <div className="text-[10px] font-mono text-muted-foreground tracking-wider mb-4">
                MOVED {task.moveCount}× · ORIGINALLY {['FLEX', 'SEMI', 'FIXED', 'LOCK'][task.originalPriority]}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleFocus}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded bg-primary text-primary-foreground font-mono text-[11px] tracking-wider hover:bg-primary/90 transition-colors"
              >
                <Play size={13} />
                START FOCUS
              </button>
              <button
                onClick={() => { deleteTask(task.id); setEditingTask(null); }}
                className="p-2.5 rounded bg-secondary hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
