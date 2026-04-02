import { useTaskStore } from '@/store/taskStore';
import { AppNav } from '@/components/AppNav';
import { FocusView } from '@/components/FocusView';
import { DayView } from '@/components/DayView';
import { WeekView } from '@/components/WeekView';
import { CalendarView } from '@/components/CalendarView';
import { motion, AnimatePresence } from 'framer-motion';

const Index = () => {
  const { viewMode, vacationMode } = useTaskStore();

  return (
    <div className="min-h-screen bg-background">
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
            <div className="bg-primary/5 border-b border-primary/10 text-center py-2">
              <span className="text-xs font-mono text-primary tracking-wider">
                🌴 VACATION MODE — recurring tasks paused
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.div
          key={viewMode}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
        >
          {viewMode === 'focus' && <FocusView />}
          {viewMode === 'day' && <DayView />}
          {viewMode === 'week' && <WeekView />}
          {viewMode === 'calendar' && <CalendarView />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default Index;
