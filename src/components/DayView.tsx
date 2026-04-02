import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, Task } from '@/store/taskStore';
import { PriorityBadge } from '@/components/PriorityBadge';
import { Check, Clock } from 'lucide-react';
import { BlockedModal } from '@/components/BlockedModal';

const HOUR_HEIGHT = 64;
const START_HOUR = 6;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function snapTo15(mins: number): number {
  return Math.round(mins / 15) * 15;
}

export function DayView() {
  const today = new Date().toISOString().split('T')[0];
  const { tasks, completeTask, setEditingTask, reorderTask, moveTask } = useTaskStore();
  const [selectedDate] = useState(today);
  const [blockedTaskId, setBlockedTaskId] = useState<string | null>(null);
  const [dragOverTime, setDragOverTime] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const dayTasks = tasks
    .filter((t) => t.date === selectedDate)
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return (a.time || '').localeCompare(b.time || '');
    });

  const completedCount = dayTasks.filter((t) => t.completed).length;
  const activeTasks = dayTasks.filter((t) => !t.completed && t.time);

  // Current time position
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;

  const handleTimelineDrop = (e: React.DragEvent, targetMinutes?: number) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    const sourceDate = e.dataTransfer.getData('sourceDate');
    if (!taskId) return;

    if (targetMinutes !== undefined) {
      const snapped = snapTo15(targetMinutes);
      const newTime = minutesToTime(snapped);

      if (sourceDate && sourceDate !== selectedDate) {
        const result = moveTask(taskId, selectedDate, newTime);
        if (result.blocked) setBlockedTaskId(taskId);
      } else {
        reorderTask(taskId, newTime);
      }
    }
    setDragOverTime(null);
  };

  const handleTimelineDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutes = START_HOUR * 60 + (y / HOUR_HEIGHT) * 60;
    const snapped = snapTo15(minutes);
    setDragOverTime(minutesToTime(snapped));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-display font-bold text-foreground tracking-tight">
          {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </h2>
        <p className="text-[11px] font-mono text-muted-foreground mt-1 tracking-wider">
          {completedCount}/{dayTasks.length} COMPLETED
        </p>
      </div>

      {/* Progress bar */}
      <div className="h-[2px] bg-secondary rounded-full mb-6 overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: dayTasks.length > 0 ? `${(completedCount / dayTasks.length) * 100}%` : '0%' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {/* Timeline */}
      <div
        ref={timelineRef}
        className="relative"
        style={{ height: HOURS.length * HOUR_HEIGHT }}
        onDragOver={handleTimelineDragOver}
        onDragLeave={() => setDragOverTime(null)}
        onDrop={(e) => {
          if (!timelineRef.current) return;
          const rect = timelineRef.current.getBoundingClientRect();
          const y = e.clientY - rect.top;
          const minutes = START_HOUR * 60 + (y / HOUR_HEIGHT) * 60;
          handleTimelineDrop(e, minutes);
        }}
      >
        {/* Hour lines */}
        {HOURS.map((hour, i) => (
          <div
            key={hour}
            className="absolute left-0 right-0 flex items-start"
            style={{ top: i * HOUR_HEIGHT }}
          >
            <div className="w-12 shrink-0 text-[10px] font-mono text-muted-foreground/50 -mt-1.5 text-right pr-3">
              {hour.toString().padStart(2, '0')}:00
            </div>
            <div className="flex-1 border-t border-border/40" />
          </div>
        ))}

        {/* Now line */}
        {nowTop > 0 && nowTop < HOURS.length * HOUR_HEIGHT && (
          <div
            className="absolute left-12 right-0 z-20 pointer-events-none"
            style={{ top: nowTop }}
          >
            <div className="h-[2px] bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.4)]" />
            <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-primary" />
          </div>
        )}

        {/* Drop target indicator */}
        {dragOverTime && (
          <div
            className="absolute left-12 right-0 z-10 pointer-events-none"
            style={{ top: ((timeToMinutes(dragOverTime) - START_HOUR * 60) / 60) * HOUR_HEIGHT }}
          >
            <div className="h-[2px] bg-primary/40 border-dashed" />
            <span className="absolute -top-3 right-0 text-[9px] font-mono text-primary/60">{dragOverTime}</span>
          </div>
        )}

        {/* Task blocks */}
        {activeTasks.map((task) => {
          if (!task.time) return null;
          const taskMinutes = timeToMinutes(task.time);
          const top = ((taskMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
          const height = Math.max(((task.duration || 30) / 60) * HOUR_HEIGHT, 32);

          return (
            <motion.div
              key={task.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              draggable
              onDragStart={(e: any) => {
                e.dataTransfer?.setData('taskId', task.id);
                e.dataTransfer?.setData('sourceDate', task.date);
              }}
              onClick={() => setEditingTask(task.id)}
              className="absolute left-14 right-2 task-card rounded-md px-3 py-2 cursor-grab active:cursor-grabbing group z-10"
              style={{ top, height }}
            >
              <div className="flex items-start justify-between h-full">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-foreground leading-tight truncate">
                    {task.title}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] font-mono text-muted-foreground">
                      <Clock size={9} className="inline mr-0.5" />
                      {task.time}
                    </span>
                    {task.duration && (
                      <span className="text-[9px] font-mono text-muted-foreground">{task.duration}m</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <PriorityBadge priority={task.priority} />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      completeTask(task.id);
                    }}
                    className="p-1 rounded bg-secondary hover:bg-primary hover:text-primary-foreground text-muted-foreground transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Check size={12} />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Completed tasks */}
      {dayTasks.filter((t) => t.completed).length > 0 && (
        <div className="mt-6 pt-4 border-t border-border/30">
          <div className="text-[10px] font-mono text-muted-foreground/50 tracking-wider mb-2">COMPLETED</div>
          {dayTasks.filter((t) => t.completed).map((task) => (
            <div key={task.id} className="flex items-center gap-3 py-1.5 opacity-30">
              <span className="text-[10px] font-mono text-muted-foreground w-12">{task.time}</span>
              <span className="text-xs font-mono line-through text-muted-foreground">{task.title}</span>
            </div>
          ))}
        </div>
      )}

      {dayTasks.length === 0 && (
        <div className="text-center py-20">
          <p className="text-muted-foreground font-mono text-sm">No tasks for today</p>
        </div>
      )}

      <BlockedModal taskId={blockedTaskId || ''} open={!!blockedTaskId} onClose={() => setBlockedTaskId(null)} />
    </div>
  );
}
