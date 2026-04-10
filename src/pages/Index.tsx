import { useState, useEffect } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { AppNav } from '@/components/AppNav';
import { FocusView } from '@/components/FocusView';
import { DayView } from '@/components/DayView';
import { DayListView } from '@/components/DayListView';
import { WeekView } from '@/components/WeekView';
import { CalendarView } from '@/components/CalendarView';
import { TaskEditPanel } from '@/components/TaskEditPanel';
import { CalendarEventEditPanel } from '@/components/CalendarEventEditPanel';
import { DailyCompletionModal } from '@/components/DailyCompletionModal';

import { LibraryPanel } from '@/components/LibraryPanel';
import { WaitingRoom } from '@/components/WaitingRoom';
import { ArchivePanel } from '@/components/ArchivePanel';
import { TouchDragGhost } from '@/components/TouchDragGhost';
import { SettingsPanel } from '@/components/SettingsPanel';
import { InventoryDropZones } from '@/components/InventoryDropZones';
import { CarryIndicator } from '@/components/CarryIndicator';
import { AnalyticsPanel } from '@/components/analytics/AnalyticsPanel';
import { motion, AnimatePresence } from 'framer-motion';

const Index = () => {
  const { viewMode, daySubMode, routinesEnabled, moveOverdueToWaitingRoom } = useTaskStore();
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  // Handle Google Calendar OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      window.history.replaceState({}, '', window.location.pathname);
      useCalendarStore.getState().handleAuthCallback(code);
    }
  }, []);

  // Check calendar connection status on mount
  useEffect(() => {
    useCalendarStore.getState().checkStatus();
  }, []);

  // Move overdue tasks to waiting room periodically
  useEffect(() => {
    moveOverdueToWaitingRoom();
    const interval = setInterval(moveOverdueToWaitingRoom, 60000);
    return () => clearInterval(interval);
  }, [moveOverdueToWaitingRoom]);

  // Listen for waiting room toggle from nav
  useEffect(() => {
    const handler = () => setWaitingOpen((o) => !o);
    window.addEventListener('toggle-waiting-room', handler);
    return () => window.removeEventListener('toggle-waiting-room', handler);
  }, []);

  // Listen for settings toggle from nav
  useEffect(() => {
    const handler = () => setSettingsOpen((o) => !o);
    window.addEventListener('toggle-settings', handler);
    return () => window.removeEventListener('toggle-settings', handler);
  }, []);

  // Listen for archive toggle from nav
  useEffect(() => {
    const handler = () => setArchiveOpen((o) => !o);
    window.addEventListener('toggle-archive', handler);
    return () => window.removeEventListener('toggle-archive', handler);
  }, []);

  // Listen for analytics toggle from nav
  useEffect(() => {
    const handler = () => setAnalyticsOpen((o) => !o);
    window.addEventListener('toggle-analytics', handler);
    return () => window.removeEventListener('toggle-analytics', handler);
  }, []);

  return (
    <div className={`min-h-screen bg-background`}>
      <AppNav />


      <AnimatePresence mode="wait">
        <motion.div
          key={viewMode}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          style={{ willChange: 'opacity' }}
        >
          {viewMode === 'focus' && <FocusView />}
          {viewMode === 'day' && (daySubMode === 'list' ? <DayListView /> : <DayView />)}
          {viewMode === 'week' && <WeekView />}
          {viewMode === 'calendar' && <CalendarView />}
        </motion.div>
      </AnimatePresence>

      <TaskEditPanel />
      <CalendarEventEditPanel />
      <DailyCompletionModal />
      
      <LibraryPanel />
      <WaitingRoom open={waitingOpen} onClose={() => setWaitingOpen(false)} />
      <TouchDragGhost />
      <CarryIndicator />
      <InventoryDropZones />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ArchivePanel open={archiveOpen} onClose={() => setArchiveOpen(false)} />
      <AnalyticsPanel open={analyticsOpen} onClose={() => setAnalyticsOpen(false)} />
    </div>
  );
};

export default Index;
