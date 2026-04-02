import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { PriorityBadge } from '@/components/PriorityBadge';
import { BlockedModal } from '@/components/BlockedModal';
import { Clock, ArrowUp } from 'lucide-react';

export function WeekView() {
  const { tasks, setEditingTask, moveTask } = useTaskStore();
  const [blockedTaskId, setBlockedTaskId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);

  const weekDays = useMemo(() => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return {
        date: d.toISOString().split('T')[0],
        label: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        day: d.getDate(),
        isToday: d.toISOString().split('T')[0] === today.toISOString().split('T')[0],
      };
    });
  }, []);

  // Preview escalation info for dragged task
  const draggedTask = dragTaskId ? tasks.find((t) => t.id === dragTaskId) : null;
  const wouldEscalate = draggedTask && dragOverDay && dragOverDay !== draggedTask.date;
  const nextPriority = draggedTask ? Math.min(3, draggedTask.priority + 1) : 0;

  const handleDrop = (e: React.DragEvent, targetDate: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    const sourceDate = e.dataTransfer.getData('sourceDate');
    if (!taskId || sourceDate === targetDate) {
      setDragOverDay(null);
      setDragTaskId(null);
      return;
    }

    const result = moveTask(taskId, targetDate);
    if (result.blocked) setBlockedTaskId(taskId);

    setDragOverDay(null);
    setDragTaskId(null);
  };

  return (
    <div className="px-4 py-8 overflow-x-auto">
      <h2 className="text-2xl font-display font-bold text-foreground tracking-tight mb-8 px-2">
        This Week
      </h2>

      {/* Escalation preview */}
      {wouldEscalate && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 mx-2 px-3 py-2 rounded bg-card border border-primary/20 flex items-center gap-2"
        >
          <ArrowUp size={12} className="text-primary" />
          <span className="text-[10px] font-mono text-muted-foreground tracking-wider">
            MOVE → PRIORITY WILL INCREASE TO{' '}
            <span className="text-primary">{['FLEX', 'SEMI', 'FIXED', 'LOCK'][nextPriority]}</span>
          </span>
        </motion.div>
      )}

      <div className="grid grid-cols-7 gap-2 min-w-[800px]">
        {weekDays.map((day, di) => {
          const dayTasks = tasks
            .filter((t) => t.date === day.date && !t.completed)
            .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
          const isDragOver = dragOverDay === day.date;

          return (
            <motion.div
              key={day.date}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: di * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col"
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverDay(day.date);
              }}
              onDragLeave={() => setDragOverDay(null)}
              onDrop={(e) => handleDrop(e, day.date)}
            >
              {/* Day header */}
              <div className={`text-center py-3 rounded-t-md border-b transition-colors ${
                day.isToday
                  ? 'bg-primary/[0.06] border-primary/20'
                  : 'bg-card border-border/50'
              }`}>
                <div className="text-[9px] font-mono tracking-[0.2em] text-muted-foreground">
                  {day.label}
                </div>
                <div className={`text-lg font-display font-bold ${day.isToday ? 'text-primary' : 'text-foreground'}`}>
                  {day.day}
                </div>
              </div>

              {/* Tasks */}
              <div className={`flex-1 border-x border-b rounded-b-md p-1.5 space-y-1.5 min-h-[220px] transition-colors ${
                isDragOver
                  ? 'bg-primary/[0.04] border-primary/20'
                  : 'bg-card/30 border-border/30'
              }`}>
                {dayTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('taskId', task.id);
                      e.dataTransfer.setData('sourceDate', task.date);
                      setDragTaskId(task.id);
                    }}
                    onDragEnd={() => { setDragTaskId(null); setDragOverDay(null); }}
                    onClick={() => setEditingTask(task.id)}
                    className="task-card rounded-md p-2 cursor-grab active:cursor-grabbing"
                  >
                    <div className="text-[11px] font-mono text-foreground leading-tight mb-1.5 truncate">
                      {task.title}
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      {task.time && (
                        <span className="text-[9px] font-mono text-muted-foreground flex items-center gap-0.5">
                          <Clock size={8} />
                          {task.time}
                        </span>
                      )}
                      <PriorityBadge priority={task.priority} />
                    </div>
                  </div>
                ))}
                {dayTasks.length === 0 && (
                  <div className="flex items-center justify-center h-full min-h-[100px]">
                    <span className="text-[10px] font-mono text-muted-foreground/20">—</span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <BlockedModal taskId={blockedTaskId || ''} open={!!blockedTaskId} onClose={() => setBlockedTaskId(null)} />
    </div>
  );
}
