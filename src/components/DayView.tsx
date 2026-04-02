import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, Task } from '@/store/taskStore';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Check, Clock, GripVertical } from 'lucide-react';

export function DayView() {
  const today = new Date().toISOString().split('T')[0];
  const { tasks, completeTask, setFocusTask, setViewMode } = useTaskStore();
  const [selectedDate] = useState(today);

  const dayTasks = tasks
    .filter((t) => t.date === selectedDate)
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return (a.time || '').localeCompare(b.time || '');
    });

  const completedCount = dayTasks.filter((t) => t.completed).length;

  const handleFocus = (task: Task) => {
    setFocusTask(task.id);
    setViewMode('focus');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-display font-bold text-foreground tracking-tight">
          {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </h2>
        <p className="text-sm font-mono text-muted-foreground mt-1 tracking-wider">
          {completedCount}/{dayTasks.length} COMPLETED
        </p>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-secondary rounded-full mb-8 overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: dayTasks.length > 0 ? `${(completedCount / dayTasks.length) * 100}%` : '0%' }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Task list */}
      <div className="space-y-2">
        <AnimatePresence>
          {dayTasks.map((task, i) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ delay: i * 0.05 }}
              className={`group flex items-center gap-3 p-4 rounded-lg border transition-colors cursor-pointer ${
                task.completed
                  ? 'bg-muted/30 border-border/50 opacity-50'
                  : 'bg-card border-border hover:border-primary/30 hover:bg-elevated'
              }`}
              onClick={() => !task.completed && handleFocus(task)}
            >
              <GripVertical size={14} className="text-muted-foreground/30 shrink-0" />
              
              {/* Time */}
              {task.time && (
                <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground w-16 shrink-0">
                  <Clock size={12} />
                  {task.time}
                </div>
              )}

              {/* Title */}
              <div className={`flex-1 font-mono text-sm ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                {task.title}
              </div>

              {/* Priority */}
              <PriorityBadge priority={task.priority} />

              {/* Duration */}
              {task.duration && (
                <span className="text-[10px] font-mono text-muted-foreground tracking-wider">
                  {task.duration}m
                </span>
              )}

              {/* Complete button */}
              {!task.completed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    completeTask(task.id);
                  }}
                  className="p-1.5 rounded-md bg-secondary hover:bg-primary hover:text-primary-foreground text-muted-foreground transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Check size={14} />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {dayTasks.length === 0 && (
        <div className="text-center py-20">
          <p className="text-muted-foreground font-mono text-sm">No tasks for today</p>
        </div>
      )}
    </div>
  );
}
