import { useTaskStore } from '@/store/taskStore';
import { AppNav } from '@/components/AppNav';
import { FocusView } from '@/components/FocusView';
import { DayView } from '@/components/DayView';
import { WeekView } from '@/components/WeekView';
import { CalendarView } from '@/components/CalendarView';
import { TaskEditPanel } from '@/components/TaskEditPanel';
import { DailyCompletionModal } from '@/components/DailyCompletionModal';
import { motion, AnimatePresence } from 'framer-motion';

const Index = () => {
  const { viewMode, vacationMode } = useTaskStore();

  return (
    <div className={`min-h-screen bg-background ${vacationMode ? 'vacation-active' : ''}`}>
      <AppNav />

      {/* Vacation banner */}
      <AnimatePresence>
        {vacationMode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-muted border-b border-border/30 text-center py-2">
              <span className="text-[10px] font-mono text-muted-foreground tracking-[0.2em]">
                VACATION MODE — RECURRING TASKS PAUSED
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
    </div>
  );
};

export default Index;
