import { useRef, useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTaskStore, Task, Priority } from '@/store/taskStore';
import { PriorityBadge } from '@/components/PriorityBadge';
import { timeToMinutes, minutesToTime, snapTo15 } from '@/hooks/useCurrentTime';
import { Check } from 'lucide-react';

export const HOUR_HEIGHT = 60;
export const START_HOUR = 6;
export const END_HOUR = 23;
export const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const PRIORITY_LABELS = ['FLEX', 'SEMI', 'FIXED', 'LOCK'];

interface TimelineColumnProps {
  date: string;
  tasks: Task[];
  nowMinutes: number;
  isToday: boolean;
  showTimeLabels?: boolean;
  columnWidth?: string;
}

export function TimelineColumn({
  date,
  tasks,
  nowMinutes,
  isToday,
  showTimeLabels = true,
  columnWidth,
}: TimelineColumnProps) {
  const { setEditingTask, reorderTask, moveTask, resizeTask, completeTask, canMoveTask } = useTaskStore();
  const colRef = useRef<HTMLDivElement>(null);
  const [dragOverTime, setDragOverTime] = useState<string | null>(null);
  const [dragValid, setDragValid] = useState(true);
  const [dragMsg, setDragMsg] = useState('');
  const [resizing, setResizing] = useState<{ id: string; edge: 'top' | 'bottom'; startY: number; origTime: string; origDuration: number } | null>(null);

  const activeTasks = tasks.filter((t) => !t.completed && t.time);
  const nowTop = ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;

  // Find active task (intersects current time)
  const activeTaskId = isToday
    ? activeTasks.find((t) => {
        if (!t.time) return false;
        const start = timeToMinutes(t.time);
        const end = start + (t.duration || 30);
        return nowMinutes >= start && nowMinutes < end;
      })?.id || null
    : null;

  const getMinutesFromY = useCallback((clientY: number) => {
    if (!colRef.current) return 0;
    const rect = colRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    return START_HOUR * 60 + (y / HOUR_HEIGHT) * 60;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const mins = getMinutesFromY(e.clientY);
    const snapped = snapTo15(mins);
    setDragOverTime(minutesToTime(snapped));

    const taskId = e.dataTransfer.types.includes('text/plain') ? 'pending' : '';
    if (taskId) {
      // We'll validate on drop since we can't read data during dragover
      setDragValid(true);
    }
  }, [getMinutesFromY]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    const sourceDate = e.dataTransfer.getData('sourceDate');
    if (!taskId) { setDragOverTime(null); return; }

    const mins = getMinutesFromY(e.clientY);
    const snapped = snapTo15(mins);
    const newTime = minutesToTime(snapped);

    if (sourceDate && sourceDate !== date) {
      const validation = canMoveTask(taskId, date);
      if (!validation.allowed) {
        setDragMsg(validation.reason);
        setDragValid(false);
        setTimeout(() => { setDragMsg(''); setDragValid(true); }, 2000);
        setDragOverTime(null);
        return;
      }
      moveTask(taskId, date, newTime);
    } else {
      reorderTask(taskId, newTime);
    }
    setDragOverTime(null);
  }, [date, getMinutesFromY, canMoveTask, moveTask, reorderTask]);

  // Resize handling
  const handleResizeStart = useCallback((e: React.MouseEvent, task: Task, edge: 'top' | 'bottom') => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({
      id: task.id,
      edge,
      startY: e.clientY,
      origTime: task.time || '09:00',
      origDuration: task.duration || 30,
    });
  }, []);

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - resizing.startY;
      const deltaMinutes = (deltaY / HOUR_HEIGHT) * 60;

      if (resizing.edge === 'bottom') {
        const newDuration = snapTo15(resizing.origDuration + deltaMinutes);
        resizeTask(resizing.id, resizing.origTime, Math.max(15, newDuration));
      } else {
        const origStart = timeToMinutes(resizing.origTime);
        const newStart = snapTo15(origStart + deltaMinutes);
        const newDuration = resizing.origDuration + (origStart - newStart);
        if (newDuration >= 15) {
          resizeTask(resizing.id, minutesToTime(newStart), newDuration);
        }
      }
    };

    const handleMouseUp = () => setResizing(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, resizeTask]);

  return (
    <div
      ref={colRef}
      className="relative"
      style={{ height: HOURS.length * HOUR_HEIGHT, width: columnWidth }}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOverTime(null)}
      onDrop={handleDrop}
    >
      {/* Hour grid lines */}
      {HOURS.map((hour, i) => (
        <div
          key={hour}
          className="absolute left-0 right-0 flex items-start"
          style={{ top: i * HOUR_HEIGHT }}
        >
          {showTimeLabels && (
            <div className="w-11 shrink-0 text-[9px] font-mono text-muted-foreground/30 -mt-1.5 text-right pr-2.5 select-none">
              {hour.toString().padStart(2, '0')}
            </div>
          )}
          <div className="flex-1 border-t border-border/20" />
        </div>
      ))}

      {/* Half-hour lines */}
      {HOURS.map((hour, i) => (
        <div
          key={`half-${hour}`}
          className="absolute right-0 border-t border-border/8"
          style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2, left: showTimeLabels ? '2.75rem' : 0 }}
        />
      ))}

      {/* Now line */}
      {isToday && nowTop > 0 && nowTop < HOURS.length * HOUR_HEIGHT && (
        <div
          className="absolute right-0 z-30 pointer-events-none"
          style={{ top: nowTop, left: showTimeLabels ? '2.75rem' : 0 }}
        >
          <div className="h-[2px] bg-primary" style={{ boxShadow: '0 0 12px hsl(var(--primary) / 0.5)' }} />
          <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-primary" />
        </div>
      )}

      {/* Drop target */}
      {dragOverTime && (
        <div
          className="absolute right-0 z-20 pointer-events-none"
          style={{
            top: ((timeToMinutes(dragOverTime) - START_HOUR * 60) / 60) * HOUR_HEIGHT,
            left: showTimeLabels ? '2.75rem' : 0,
          }}
        >
          <div className={`h-[2px] ${dragValid ? 'bg-primary/40' : 'bg-destructive/40'}`} />
          <span className={`absolute -top-3 right-0 text-[9px] font-mono ${dragValid ? 'text-primary/60' : 'text-destructive/60'}`}>
            {dragOverTime}
          </span>
        </div>
      )}

      {/* Validation message */}
      {dragMsg && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded bg-destructive/10 border border-destructive/20">
          <span className="text-[9px] font-mono text-destructive tracking-wider">{dragMsg}</span>
        </div>
      )}

      {/* Task blocks */}
      {activeTasks.map((task) => {
        if (!task.time) return null;
        const taskMinutes = timeToMinutes(task.time);
        const top = ((taskMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
        const height = Math.max(((task.duration || 30) / 60) * HOUR_HEIGHT, 20);
        const isActive = task.id === activeTaskId;
        const isResizingThis = resizing?.id === task.id;

        const priorityBorder = {
          0: 'border-l-priority-0/40',
          1: 'border-l-priority-1/60',
          2: 'border-l-priority-2/70',
          3: 'border-l-priority-3/80',
        }[task.priority];

        const priorityBorderWidth = task.priority >= 2 ? 'border-l-[3px]' : 'border-l-2';

        return (
          <div
            key={task.id}
            draggable={!isResizingThis}
            onDragStart={(e) => {
              e.dataTransfer.setData('taskId', task.id);
              e.dataTransfer.setData('sourceDate', task.date);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onClick={() => setEditingTask(task.id)}
            className={`absolute right-1 group cursor-grab active:cursor-grabbing select-none ${priorityBorderWidth} ${priorityBorder}`}
            style={{
              top,
              height,
              left: showTimeLabels ? '3rem' : '0.25rem',
              zIndex: isActive ? 15 : 10,
            }}
          >
            <div
              className={`h-full rounded-r-[3px] px-2.5 py-1.5 transition-all duration-300 ${
                isActive
                  ? 'bg-[hsl(var(--surface-elevated))] border border-primary/25'
                  : 'bg-[hsl(var(--surface-elevated))] border border-[hsl(var(--task-border))] hover:border-[hsl(var(--task-glow)/0.3)]'
              }`}
              style={isActive ? { boxShadow: '0 0 24px -6px hsl(var(--primary) / 0.15)' } : undefined}
            >
              {/* Resize handle top */}
              <div
                onMouseDown={(e) => handleResizeStart(e, task, 'top')}
                className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100 hover:bg-primary/20 rounded-t transition-opacity"
              />

              <div className="flex items-start justify-between h-full overflow-hidden">
                <div className="flex-1 min-w-0">
                  <div className={`text-[11px] font-mono leading-tight truncate ${isActive ? 'text-foreground' : 'text-foreground/80'}`}>
                    {task.title}
                  </div>
                  {height > 36 && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[9px] font-mono text-muted-foreground/50">
                        {task.time}
                      </span>
                      {task.duration && (
                        <span className="text-[9px] font-mono text-muted-foreground/40">{task.duration}m</span>
                      )}
                      {isActive && (
                        <span className="text-[9px] font-mono text-primary/60">
                          {minutesToTime(Math.max(0, taskMinutes + (task.duration || 30) - nowMinutes)).replace(/^0/, '')} left
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-1">
                  <PriorityBadge priority={task.priority} />
                  <button
                    onClick={(e) => { e.stopPropagation(); completeTask(task.id); }}
                    className="p-0.5 rounded text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Check size={11} />
                  </button>
                </div>
              </div>

              {/* Active progress fill */}
              {isActive && task.time && (
                <div
                  className="absolute bottom-0 left-0 right-0 bg-primary/[0.06] pointer-events-none"
                  style={{
                    height: `${Math.min(100, ((nowMinutes - taskMinutes) / (task.duration || 30)) * 100)}%`,
                    borderRadius: '0 0 3px 0',
                  }}
                />
              )}

              {/* Resize handle bottom */}
              <div
                onMouseDown={(e) => handleResizeStart(e, task, 'bottom')}
                className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100 hover:bg-primary/20 rounded-b transition-opacity"
              />
            </div>
          </div>
        );
      })}

      {/* Free time indicator at now line */}
      {isToday && !activeTaskId && nowTop > 0 && nowTop < HOURS.length * HOUR_HEIGHT && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{ top: nowTop + 6, left: showTimeLabels ? '3rem' : '0.25rem' }}
        >
          <span className="text-[9px] font-mono text-muted-foreground/30 tracking-wider">FREE TIME</span>
        </div>
      )}
    </div>
  );
}
