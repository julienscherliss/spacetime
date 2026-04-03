import { useRef, useState, useCallback, useEffect, Fragment } from 'react';
import { useTaskStore, Task } from '@/store/taskStore';
import { PriorityBadge } from '@/components/PriorityBadge';
import { timeToMinutes, minutesToTime, snapTo15 } from '@/hooks/useCurrentTime';
import { Check } from 'lucide-react';

export const DEFAULT_HOUR_HEIGHT = 56;
export const HOUR_HEIGHT = DEFAULT_HOUR_HEIGHT; // backward compat
export const START_HOUR = 6;
export const END_HOUR = 23;
export const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

interface TimelineColumnProps {
  date: string;
  tasks: Task[];
  nowMinutes: number;
  isToday: boolean;
  showTimeLabels?: boolean;
  hourHeight?: number;
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function TimelineColumn({
  date,
  tasks,
  nowMinutes,
  isToday,
  showTimeLabels = true,
  hourHeight: hourHeightProp,
}: TimelineColumnProps) {
  const HOUR_HEIGHT = hourHeightProp ?? DEFAULT_HOUR_HEIGHT;
  const { setEditingTask, reorderTask, moveTask, resizeTask, completeTask, canMoveTask, addTask } = useTaskStore();
  const colRef = useRef<HTMLDivElement>(null);
  const [dragOverTime, setDragOverTime] = useState<string | null>(null);
  const [dragValid, setDragValid] = useState(true);
  const [dragMsg, setDragMsg] = useState('');

  // Track whether a drag/resize happened to suppress click
  const didDragRef = useRef(false);
  // Offset from cursor to top of dragged block (for accurate drop)
  const dragOffsetRef = useRef(0);

  const [resizing, setResizing] = useState<{
    id: string;
    edge: 'top' | 'bottom';
    startY: number;
    origTime: string;
    origDuration: number;
  } | null>(null);

  // Live resize feedback
  const [resizePreview, setResizePreview] = useState<{
    time: string;
    duration: number;
  } | null>(null);

  // Drag-to-create state
  const [creating, setCreating] = useState<{
    startMin: number;
    currentMin: number;
  } | null>(null);
  const [newTaskInput, setNewTaskInput] = useState<{
    time: string;
    duration: number;
    top: number;
    height: number;
  } | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const newTaskRef = useRef<HTMLInputElement>(null);

  const activeTasks = tasks.filter((t) => !t.completed && t.time);
  const nowTop = ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;

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
  }, [HOUR_HEIGHT]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const mins = getMinutesFromY(e.clientY - dragOffsetRef.current);
    const snapped = snapTo15(mins);
    setDragOverTime(minutesToTime(snapped));
    setDragValid(true);
  }, [getMinutesFromY]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    const sourceDate = e.dataTransfer.getData('sourceDate');
    if (!taskId) { setDragOverTime(null); return; }

    const mins = getMinutesFromY(e.clientY - dragOffsetRef.current);
    const snapped = snapTo15(mins);
    const newTime = minutesToTime(snapped);

    if (sourceDate && sourceDate !== date) {
      const validation = canMoveTask(taskId, date);
      if (!validation.allowed) {
        setDragMsg('reason' in validation ? validation.reason : 'Cannot move');
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

  // Resize — completely silent, no dialogs
  const handleResizeStart = useCallback((e: React.MouseEvent, task: Task, edge: 'top' | 'bottom') => {
    e.preventDefault();
    e.stopPropagation();
    // LOCK tasks cannot be resized
    if (task.priority >= 3) {
      setDragMsg('Task is locked');
      setTimeout(() => setDragMsg(''), 1500);
      return;
    }
    didDragRef.current = true;
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
        const clamped = Math.max(15, newDuration);
        resizeTask(resizing.id, resizing.origTime, clamped);
        setResizePreview({ time: resizing.origTime, duration: clamped });
      } else {
        const origStart = timeToMinutes(resizing.origTime);
        const newStart = snapTo15(origStart + deltaMinutes);
        const newDuration = resizing.origDuration + (origStart - newStart);
        if (newDuration >= 15) {
          resizeTask(resizing.id, minutesToTime(newStart), newDuration);
          setResizePreview({ time: minutesToTime(newStart), duration: newDuration });
        }
      }
    };
    const handleMouseUp = () => {
      setResizing(null);
      setResizePreview(null);
      // Keep didDragRef true briefly to suppress the click
      setTimeout(() => { didDragRef.current = false; }, 50);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, resizeTask]);

  // Drag-to-create: mouse handlers
  const handleCreateMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-task-block]')) return;
    if (newTaskInput) return;
    const mins = getMinutesFromY(e.clientY);
    const snapped = snapTo15(mins);
    setCreating({ startMin: snapped, currentMin: snapped });
  }, [getMinutesFromY, newTaskInput]);

  useEffect(() => {
    if (!creating) return;
    const handleMouseMove = (e: MouseEvent) => {
      const mins = getMinutesFromY(e.clientY);
      const snapped = snapTo15(mins);
      setCreating(prev => prev ? { ...prev, currentMin: snapped } : null);
    };
    const handleMouseUp = () => {
      if (!creating) return;
      const startMin = Math.min(creating.startMin, creating.currentMin);
      const endMin = Math.max(creating.startMin, creating.currentMin);
      const duration = Math.max(15, endMin - startMin);
      const time = minutesToTime(startMin);
      const top = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
      const height = (duration / 60) * HOUR_HEIGHT;
      setCreating(null);
      setNewTaskTitle('');
      setNewTaskInput({ time, duration, top, height });
      setTimeout(() => newTaskRef.current?.focus(), 50);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [creating, getMinutesFromY]);

  const handleNewTaskSubmit = useCallback(() => {
    if (!newTaskInput || !newTaskTitle.trim()) {
      setNewTaskInput(null);
      return;
    }
    addTask({
      title: newTaskTitle.trim(),
      date,
      time: newTaskInput.time,
      duration: newTaskInput.duration,
      priority: 0,
      type: 'one-time',
    });
    setNewTaskInput(null);
    setNewTaskTitle('');
  }, [newTaskInput, newTaskTitle, date, addTask]);

  // Creating preview dimensions
  const creatingPreview = creating ? (() => {
    const startMin = Math.min(creating.startMin, creating.currentMin);
    const endMin = Math.max(creating.startMin, creating.currentMin);
    const duration = Math.max(15, endMin - startMin);
    const top = ((startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
    const height = (duration / 60) * HOUR_HEIGHT;
    return { top, height, time: minutesToTime(startMin), duration };
  })() : null;

  const timeLabelsWidth = showTimeLabels ? '2.5rem' : '0';

  // Handle task click — only if no drag/resize happened
  const handleTaskClick = useCallback((taskId: string) => {
    if (didDragRef.current) return;
    setEditingTask(taskId);
  }, [setEditingTask]);

  return (
    <div
      ref={colRef}
      className="relative"
      style={{ height: HOURS.length * HOUR_HEIGHT }}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOverTime(null)}
      onDrop={handleDrop}
      onMouseDown={handleCreateMouseDown}
    >
      {/* Hour grid lines */}
      {HOURS.map((hour, i) => (
        <div
          key={hour}
          className="absolute left-0 right-0 flex items-start"
          style={{ top: i * HOUR_HEIGHT }}
        >
          {showTimeLabels && (
            <div className="w-10 shrink-0 text-[9px] font-mono text-muted-foreground/60 font-medium -mt-1.5 text-right pr-2 select-none">
              {hour.toString().padStart(2, '0')}
            </div>
          )}
          <div className="flex-1 border-t border-border/50" />
        </div>
      ))}

      {/* Half-hour lines — visible at default zoom and above */}
      {HOUR_HEIGHT >= 40 && HOURS.map((hour, i) => (
        <div
          key={`h30-${hour}`}
          className="absolute right-0 border-t border-border/20"
          style={{
            top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2,
            left: timeLabelsWidth,
          }}
        />
      ))}

      {/* 15-min lines — visible when zoomed in (hourHeight >= 72) */}
      {HOUR_HEIGHT >= 72 && HOURS.map((hour, i) => (
        <Fragment key={`q-${hour}`}>
          <div
            key={`h15-${hour}`}
            className="absolute right-0 border-t border-border/10"
            style={{
              top: i * HOUR_HEIGHT + HOUR_HEIGHT / 4,
              left: timeLabelsWidth,
            }}
          />
          <div
            key={`h45-${hour}`}
            className="absolute right-0 border-t border-border/10"
            style={{
              top: i * HOUR_HEIGHT + (HOUR_HEIGHT * 3) / 4,
              left: timeLabelsWidth,
            }}
          />
        </Fragment>
      ))}

      {/* Now line */}
      {isToday && nowTop > 0 && nowTop < HOURS.length * HOUR_HEIGHT && (
        <div
          className="absolute right-0 z-30 pointer-events-none"
          style={{ top: nowTop, left: timeLabelsWidth }}
        >
          <div className="h-[1.5px] bg-primary" />
          <div className="absolute -left-[3px] -top-[2.5px] w-[6px] h-[6px] rounded-full bg-primary" />
        </div>
      )}

      {/* Drop target indicator */}
      {dragOverTime && (
        <div
          className="absolute right-0 z-20 pointer-events-none"
          style={{
            top: ((timeToMinutes(dragOverTime) - START_HOUR * 60) / 60) * HOUR_HEIGHT,
            left: timeLabelsWidth,
          }}
        >
          <div className={`h-px ${dragValid ? 'bg-primary/30' : 'bg-destructive/40'}`} />
          <span className={`absolute -top-3.5 right-0 text-[8px] font-mono tracking-wider ${dragValid ? 'text-primary/50' : 'text-destructive/60'}`}>
            {dragOverTime}
          </span>
        </div>
      )}

      {/* Validation / lock message */}
      {dragMsg && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 px-2.5 py-1 rounded-sm bg-card border border-destructive/20 shadow-sm">
          <span className="text-[8px] font-mono text-destructive tracking-wider">{dragMsg}</span>
        </div>
      )}

      {/* Task blocks */}
      {activeTasks.map((task) => {
        if (!task.time) return null;
        const taskMinutes = timeToMinutes(task.time);
        const top = ((taskMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
        const height = Math.max(((task.duration || 30) / 60) * HOUR_HEIGHT, 18);
        const isActive = task.id === activeTaskId;
        const isResizingThis = resizing?.id === task.id;
        const isLocked = task.priority >= 3;
        const isRoutine = task.type === 'recurring';

        const borderLeftColor = {
          0: 'hsl(var(--priority-0) / 0.3)',
          1: 'hsl(var(--priority-1) / 0.5)',
          2: 'hsl(var(--priority-2) / 0.6)',
          3: 'hsl(var(--priority-3) / 0.7)',
        }[task.priority];

        const borderLeftWidth = task.priority >= 2 ? '3px' : '2px';

        return (
          <div
            key={task.id}
            data-task-block
            draggable={!isResizingThis && !isLocked}
            onDragStart={(e) => {
              if (isLocked) {
                e.preventDefault();
                setDragMsg('Task is locked');
                setTimeout(() => setDragMsg(''), 1500);
                return;
              }
              didDragRef.current = true;
              // Capture offset from cursor to top of the block
              const blockRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              dragOffsetRef.current = e.clientY - blockRect.top;
              e.dataTransfer.setData('taskId', task.id);
              e.dataTransfer.setData('sourceDate', task.date);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              setTimeout(() => { didDragRef.current = false; }, 50);
            }}
            onClick={() => handleTaskClick(task.id)}
            className={`absolute right-1 group select-none transition-shadow duration-200 ${
              isLocked
                ? 'cursor-default'
                : isResizingThis
                  ? 'cursor-ns-resize'
                  : 'cursor-grab active:cursor-grabbing'
            } ${isActive ? 'z-[15]' : 'z-10'}`}
            style={{
              top,
              height,
              left: showTimeLabels ? '2.75rem' : '2px',
            }}
          >
            <div
              className={`h-full rounded-[2px] transition-all duration-200 ${
                isActive
                  ? 'bg-card border border-primary/20 shadow-sm'
                  : isRoutine
                    ? 'bg-card border border-border/60 border-dashed hover:border-[hsl(var(--task-hover))] hover:shadow-sm'
                    : 'bg-card border border-[hsl(var(--task-border))] hover:border-[hsl(var(--task-hover))] hover:shadow-sm'
              }`}
              style={{
                borderLeftColor,
                borderLeftWidth,
              }}
            >
              {/* Resize handle — top (hidden for LOCK) */}
              {!isLocked && (
                <div
                  onMouseDown={(e) => handleResizeStart(e, task, 'top')}
                  className="absolute top-0 left-0 right-0 h-[5px] cursor-ns-resize z-20 opacity-0 group-hover:opacity-100"
                >
                  <div className="mx-auto mt-[1px] w-6 h-[1.5px] rounded-full bg-muted-foreground/20 transition-colors group-hover:bg-muted-foreground/40" />
                </div>
              )}

              {/* Content */}
              <div className="flex items-start justify-between h-full px-2 py-1 overflow-hidden">
                <div className="flex-1 min-w-0">
                  <div className={`text-[10px] font-mono leading-tight truncate ${
                    isActive ? 'text-foreground font-medium' : 'text-foreground/75'
                  }`}>
                    {task.title}
                  </div>
                  {height > 32 && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[8px] font-mono text-muted-foreground/50">
                        {task.time}
                      </span>
                      {task.duration && (
                        <span className="text-[8px] font-mono text-muted-foreground/35">{formatDuration(task.duration)}</span>
                      )}
                      {isActive && (
                        <span className="text-[8px] font-mono text-primary/70">
                          {formatDuration(Math.max(0, taskMinutes + (task.duration || 30) - nowMinutes))} left
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-1">
                  <PriorityBadge priority={task.priority} />
                  <button
                    onClick={(e) => { e.stopPropagation(); completeTask(task.id); }}
                    className="p-0.5 rounded-sm text-muted-foreground/20 hover:text-primary hover:bg-primary/5 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Check size={10} />
                  </button>
                </div>
              </div>

              {/* Live resize duration indicator */}
              {isResizingThis && resizePreview && (
                <div className="absolute -right-1 top-1/2 -translate-y-1/2 translate-x-full z-30 px-1.5 py-0.5 rounded-sm bg-card border border-border shadow-sm pointer-events-none">
                  <span className="text-[8px] font-mono text-foreground/70 whitespace-nowrap">
                    {resizePreview.time} – {minutesToTime(timeToMinutes(resizePreview.time) + resizePreview.duration)} · {formatDuration(resizePreview.duration)}
                  </span>
                </div>
              )}

              {/* Active progress fill */}
              {isActive && task.time && (
                <div
                  className="absolute bottom-0 left-0 right-0 bg-primary/[0.04] pointer-events-none rounded-b-[2px]"
                  style={{
                    height: `${Math.min(100, ((nowMinutes - taskMinutes) / (task.duration || 30)) * 100)}%`,
                  }}
                />
              )}

              {/* Resize handle — bottom (hidden for LOCK) */}
              {!isLocked && (
                <div
                  onMouseDown={(e) => handleResizeStart(e, task, 'bottom')}
                  className="absolute bottom-0 left-0 right-0 h-[5px] cursor-ns-resize z-20 opacity-0 group-hover:opacity-100"
                >
                  <div className="mx-auto mb-[1px] w-6 h-[1.5px] rounded-full bg-muted-foreground/20 transition-colors group-hover:bg-muted-foreground/40" />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Free time label */}
      {isToday && !activeTaskId && nowTop > 0 && nowTop < HOURS.length * HOUR_HEIGHT && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{ top: nowTop + 4, left: showTimeLabels ? '2.75rem' : '2px' }}
        >
          <span className="text-[8px] font-mono text-muted-foreground/25 tracking-widest">FREE</span>
        </div>
      )}

      {/* Drag-to-create preview */}
      {creatingPreview && (
        <div
          className="absolute right-1 z-20 pointer-events-none"
          style={{
            top: creatingPreview.top,
            height: creatingPreview.height,
            left: showTimeLabels ? '2.75rem' : '2px',
          }}
        >
          <div className="h-full rounded-[2px] border border-primary/30 bg-primary/[0.06] border-dashed">
            <div className="px-2 py-1">
              <span className="text-[8px] font-mono text-primary/60">
                {creatingPreview.time} · {formatDuration(creatingPreview.duration)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* New task inline input */}
      {newTaskInput && (
        <div
          className="absolute right-1 z-30"
          style={{
            top: newTaskInput.top,
            height: Math.max(newTaskInput.height, 28),
            left: showTimeLabels ? '2.75rem' : '2px',
          }}
        >
          <div className="h-full rounded-[2px] border border-primary/40 bg-card shadow-sm flex items-start px-2 py-1 gap-1.5"
               style={{ borderLeftWidth: '2px', borderLeftColor: 'hsl(var(--priority-0) / 0.4)' }}>
            <div className="flex-1 min-w-0">
              <input
                ref={newTaskRef}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNewTaskSubmit();
                  if (e.key === 'Escape') setNewTaskInput(null);
                }}
                onBlur={handleNewTaskSubmit}
                placeholder="Task name..."
                className="w-full bg-transparent text-[10px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none leading-tight"
              />
              <span className="text-[8px] font-mono text-muted-foreground/40">
                {newTaskInput.time} · {formatDuration(newTaskInput.duration)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
