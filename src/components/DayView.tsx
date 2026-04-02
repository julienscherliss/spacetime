import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTaskStore } from '@/store/taskStore';
import { useCurrentTime } from '@/hooks/useCurrentTime';
import { TimelineColumn } from '@/components/TimelineColumn';
import { BlockedModal } from '@/components/BlockedModal';
import { ZoomControl } from '@/components/ZoomControl';
import { useTimeScale } from '@/hooks/useTimeScale';

export function DayView() {
  const { tasks, routinesEnabled, generateRecurringInstances } = useTaskStore();
  const { minutes: nowMinutes, dateStr: today } = useCurrentTime(15000);
  const [selectedDate] = useState(today);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    hourHeight, zoomIn, zoomOut, resetZoom, setScale,
    bindScrollZoom, bindPinchZoom,
    zoomPercent, isMin, isMax, isDefault,
  } = useTimeScale('day');

  useEffect(() => {
    generateRecurringInstances(selectedDate, selectedDate);
  }, [selectedDate, generateRecurringInstances]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const cleanScroll = bindScrollZoom(el);
    const cleanPinch = bindPinchZoom(el);
    return () => { cleanScroll?.(); cleanPinch?.(); };
  }, [bindScrollZoom, bindPinchZoom]);

  const dayTasks = tasks.filter((t) => t.date === selectedDate &&
    !(!routinesEnabled && t.type === 'recurring'));
  const completedCount = dayTasks.filter((t) => t.completed).length;
  const isToday = selectedDate === today;

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <div className="mb-4">
        <h2 className="text-lg font-display font-bold text-foreground tracking-tight">
          {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </h2>
        <p className="text-[9px] font-mono text-muted-foreground/50 mt-0.5 tracking-widest">
          {completedCount}/{dayTasks.length} COMPLETED
        </p>
      </div>

      {/* Progress */}
      <div className="h-px bg-border/40 mb-4 overflow-hidden">
        <motion.div
          className="h-full bg-primary/50"
          initial={{ width: 0 }}
          animate={{ width: dayTasks.length > 0 ? `${(completedCount / dayTasks.length) * 100}%` : '0%' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {/* Timeline + Zoom control */}
      <div className="flex gap-3">
        <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
          <TimelineColumn
            date={selectedDate}
            tasks={dayTasks}
            nowMinutes={nowMinutes}
            isToday={isToday}
            showTimeLabels
            hourHeight={hourHeight}
          />
        </div>

        <div className="shrink-0 pt-2">
          <ZoomControl
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onReset={resetZoom}
            onSetScale={setScale}
            zoomPercent={zoomPercent}
            isMin={isMin}
            isMax={isMax}
            isDefault={isDefault}
          />
        </div>
      </div>

      {/* Completed */}
      {dayTasks.filter((t) => t.completed).length > 0 && (
        <div className="mt-4 pt-3 border-t border-border/30">
          <div className="text-[8px] font-mono text-muted-foreground/30 tracking-widest mb-1">COMPLETED</div>
          {dayTasks.filter((t) => t.completed).map((task) => (
            <div key={task.id} className="flex items-center gap-3 py-0.5 opacity-30">
              <span className="text-[8px] font-mono text-muted-foreground w-8">{task.time}</span>
              <span className="text-[10px] font-mono line-through text-muted-foreground">{task.title}</span>
            </div>
          ))}
        </div>
      )}

      {dayTasks.length === 0 && (
        <div className="text-center py-20">
          <p className="text-muted-foreground/30 font-mono text-xs tracking-wider">NO TASKS</p>
        </div>
      )}

      <BlockedModal taskId="" open={false} onClose={() => {}} />
    </div>
  );
}
