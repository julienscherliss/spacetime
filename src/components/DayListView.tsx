import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTaskStore, Task } from '@/store/taskStore';
import { useTouchDragStore } from '@/store/touchDragStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useCurrentTime, formatTime12h } from '@/hooks/useCurrentTime';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { GroupListRow } from '@/components/GroupListRow';

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function getEndTime(time: string, duration: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + duration;
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

export function DayListView() {
  const {
    tasks, routinesEnabled, generateRecurringInstances,
    navigateToDate, setNavigateToDate, currentDate, setCurrentDate,
    setEditingTask, setDaySubMode,
    setListReturnZoom, setShowListReturn, completeTask,
  } = useTaskStore();
  const { dateStr: today } = useCurrentTime(15000);
  const [selectedDate, _setSelectedDate] = useState(navigateToDate || currentDate || today);

  const setSelectedDate = useCallback((dateOrFn: string | ((prev: string) => string)) => {
    _setSelectedDate(prev => {
      const next = typeof dateOrFn === 'function' ? dateOrFn(prev) : dateOrFn;
      setCurrentDate(next);
      return next;
    });
  }, [setCurrentDate]);

  // Swipe
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);

  useEffect(() => {
    if (navigateToDate) {
      setSelectedDate(navigateToDate);
      setNavigateToDate(null);
    }
  }, [navigateToDate, setNavigateToDate, setSelectedDate]);

  useEffect(() => {
    generateRecurringInstances(selectedDate, selectedDate);
  }, [selectedDate, generateRecurringInstances]);

  const { connected, calendars, fetchEvents } = useCalendarStore();
  useEffect(() => {
    if (connected) fetchEvents(selectedDate, selectedDate);
  }, [selectedDate, connected, calendars, fetchEvents]);

  const dayTasks = tasks
    .filter((t) => t.date === selectedDate && !t.inWaitingRoom && !t.archivedAt &&
      !(!routinesEnabled && t.isRoutine !== false && t.type === 'recurring'))
    .sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

  const completedCount = dayTasks.filter((t) => t.completed).length;
  const isToday = selectedDate === today;

  // Double-tap to complete
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);

  const handleTaskTap = (taskId: string) => {
    const now = Date.now();
    if (lastTapRef.current && lastTapRef.current.id === taskId && now - lastTapRef.current.time < 400) {
      lastTapRef.current = null;
      const task = dayTasks.find(t => t.id === taskId);
      if (task?.completed) {
        // Double tap on completed → uncomplete
        useTaskStore.getState().uncompleteTask(taskId);
      } else {
        // Double tap on active → complete
        completeTask(taskId);
      }
      if (navigator.vibrate) navigator.vibrate(20);
      return;
    }
    lastTapRef.current = { id: taskId, time: now };
    // Single tap → edit (delayed to distinguish from double)
    setTimeout(() => {
      if (lastTapRef.current && lastTapRef.current.id === taskId && Date.now() - lastTapRef.current.time >= 380) {
        setEditingTask(taskId);
        lastTapRef.current = null;
      }
    }, 400);
  };

  const handleTimeTap = (task: { time?: string; duration?: number }) => {
    if (!task.time) return;
    setListReturnZoom({ taskTime: task.time, taskDuration: task.duration || 30 });
    setShowListReturn(true);
    setDaySubMode('timeline');
  };

  const handleAddTask = () => {
    setDaySubMode('timeline');
  };

  // Swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (useTouchDragStore.getState().dragging) return;
    if (e.touches.length !== 1) return;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (useTouchDragStore.getState().dragging) return;
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      setSwiping(true);
      setSwipeOffset(dx);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (useTouchDragStore.getState().dragging) {
      setSwipeOffset(0);
      setSwiping(false);
      touchStartRef.current = null;
      return;
    }
    if (!touchStartRef.current) return;
    if (Math.abs(swipeOffset) > 60) {
      setSelectedDate(d => addDaysToDate(d, swipeOffset > 0 ? -1 : 1));
    }
    setSwipeOffset(0);
    setSwiping(false);
    touchStartRef.current = null;
  }, [swipeOffset]);

  return (
    <div
      className="max-w-3xl mx-auto px-3 sm:px-4"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="pt-3 pb-2">
        <h2 className="text-lg sm:text-xl font-display font-bold text-foreground tracking-tight">
          {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </h2>
        <p className="text-[10px] font-mono text-muted-foreground/50 mt-0.5 tracking-widest">
          {completedCount}/{dayTasks.length} COMPLETED
        </p>
      </div>

      {/* Navigation bar */}
      <div className="sticky top-0 z-30 bg-background py-1.5 flex items-center justify-between border-b border-border/30">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setSelectedDate(d => addDaysToDate(d, -1))}
            className="p-1.5 rounded-sm text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ChevronLeft size={16} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => setSelectedDate(today)}
            className={`px-2.5 py-1 rounded-sm text-[10px] font-mono tracking-widest transition-colors ${
              isToday
                ? 'text-primary bg-primary/5'
                : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/50'
            }`}
          >
            TODAY
          </button>
          <button
            onClick={() => setSelectedDate(d => addDaysToDate(d, 1))}
            className="p-1.5 rounded-sm text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ChevronRight size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="text-[9px] font-mono text-muted-foreground/40 tracking-widest">
          LIST
        </div>
      </div>

      {/* Task list */}
      <div
        className="py-2"
        style={{
          transform: swiping ? `translateX(${swipeOffset * 0.3}px)` : 'none',
        }}
      >
        {dayTasks.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground/30 font-mono text-sm tracking-wider">NO TASKS</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {dayTasks.map((task, i) => {
              const endTime = task.time && task.duration
                ? getEndTime(task.time, task.duration)
                : null;

              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`w-full text-left px-3 py-4 border-b border-border/20 transition-colors ${
                    task.completed ? 'opacity-40' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Time column — tappable to zoom timeline */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTimeTap(task);
                      }}
                      className="w-16 flex-shrink-0 pt-0.5 text-left active:bg-muted/40 rounded-sm -m-1 p-1 transition-colors"
                    >
                      {task.time ? (
                        <div>
                          <p className="text-[11px] font-mono text-foreground/80 leading-tight">
                            {formatTime12h(task.time)}
                          </p>
                          {task.duration && (
                            <p className="text-[9px] font-mono text-muted-foreground/40 mt-0.5">
                              {formatDuration(task.duration)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-[9px] font-mono text-muted-foreground/30 tracking-wider">
                          ANYTIME
                        </p>
                      )}
                    </button>

                    {/* Content — tappable to edit */}
                    <button
                      onClick={() => handleTaskTap(task.id)}
                      className="flex-1 min-w-0 text-left active:bg-muted/40 rounded-sm -m-1 p-1 transition-colors"
                    >
                      <p className={`text-sm font-display font-medium text-foreground leading-snug ${
                        task.completed ? 'line-through' : ''
                      }`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-[11px] text-muted-foreground/50 mt-0.5 line-clamp-1">
                          {task.description}
                        </p>
                      )}
                      {task.subtasks && task.subtasks.length > 0 && (
                        <p className="text-[9px] font-mono text-muted-foreground/40 mt-1 tracking-wider">
                          {task.subtasks.filter((s: any) => s.completed).length}/{task.subtasks.length} SUBTASKS
                        </p>
                      )}
                    </button>

                    {/* Priority dot */}
                    <div
                      className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                      style={{
                        backgroundColor: `hsl(var(--priority-${task.priority}))`,
                        opacity: 0.6,
                      }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB — positioned above bottom nav on mobile */}
      <button
        onClick={handleAddTask}
        className="fixed bottom-20 sm:bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus size={22} strokeWidth={2} />
      </button>
    </div>
  );
}
