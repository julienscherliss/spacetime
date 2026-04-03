import { useState, useEffect } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { AppNav } from '@/components/AppNav';
import { FocusView } from '@/components/FocusView';
import { DayView } from '@/components/DayView';
import { WeekView } from '@/components/WeekView';
import { CalendarView } from '@/components/CalendarView';
import { TaskEditPanel } from '@/components/TaskEditPanel';
import { DailyCompletionModal } from '@/components/DailyCompletionModal';
import { CalendarPanel } from '@/components/CalendarPanel';
import { LibraryPanel } from '@/components/LibraryPanel';
import { WaitingRoom } from '@/components/WaitingRoom';
import { motion, AnimatePresence } from 'framer-motion';

const Index = () => {
  const { viewMode, routinesEnabled, moveOverdueToWaitingRoom } = useTaskStore();
  const [waitingOpen, setWaitingOpen] = useState(false);

  // Move overdue tasks to waiting room periodically
  useEffect(() => {
    moveOverdueToWaitingRoom();
    const interval = setInterval(moveOverdueToWaitingRoom, 60000); // every minute
    return () => clearInterval(interval);
  }, [moveOverdueToWaitingRoom]);

  // Listen for waiting room toggle from nav
  useEffect(() => {
    const handler = () => setWaitingOpen((o) => !o);
    window.addEventListener('toggle-waiting-room', handler);
    return () => window.removeEventListener('toggle-waiting-room', handler);
  }, []);

  return (
    <div className={`min-h-screen bg-background`}>
      <AppNav />

      {/* Routines off banner */}
      <AnimatePresence>
        {!routinesEnabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-muted border-b border-border/30 text-center py-2">
              <span className="text-[10px] font-mono text-muted-foreground tracking-[0.2em]">
                ROUTINES OFF — ROUTINE TASKS HIDDEN
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.div
          key={viewMode}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          {viewMode === 'focus' && <FocusView />}
          {viewMode === 'day' && <DayView />}
          {viewMode === 'week' && <WeekView />}
          {viewMode === 'calendar' && <CalendarView />}
        </motion.div>
      </AnimatePresence>

      <TaskEditPanel />
      <DailyCompletionModal />
      <CalendarPanel />
      <LibraryPanel />
      <WaitingRoom open={waitingOpen} onClose={() => setWaitingOpen(false)} />
    </div>
  );
};

export default Index;
