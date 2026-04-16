import { useState, useEffect, useCallback } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { AppNav } from '@/components/AppNav';
import { setupNotificationTapListener } from '@/utils/notificationService';
import { isNativePlatform } from '@/utils/nativePlatform';
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
import { HelpPanel } from '@/components/HelpPanel';
import { InventoryDropZones } from '@/components/InventoryDropZones';
import { CarryIndicator } from '@/components/CarryIndicator';
import { AnalyticsPanel } from '@/components/analytics/AnalyticsPanel';
import { Paywall } from '@/components/Paywall';
import { useSubscription } from '@/hooks/useSubscription';
import { motion, AnimatePresence } from 'framer-motion';
import { useNativeNotifications } from '@/hooks/useNativeNotifications';
import { useForegroundReminders } from '@/hooks/useForegroundReminders';
import { InteractiveTutorial } from '@/components/InteractiveTutorial';

const Index = () => {
  const { viewMode, daySubMode, routinesEnabled, moveOverdueToWaitingRoom } = useTaskStore();
  useNativeNotifications();
  useForegroundReminders();
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const { trialDaysLeft, cancellingDaysLeft, subscription, refresh: refreshSub } = useSubscription();
  const [helpSection, setHelpSection] = useState<string | undefined>();
  const [tutorialNeeded, setTutorialNeeded] = useState(() => !localStorage.getItem('tutorial-completed'));

  const handleTutorialClose = useCallback(() => {
    setTutorialNeeded(false);
  }, []);

  // Handle Google Calendar OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state'); // state = deviceId from the auth URL
    if (code) {
      // If state (deviceId) came back from Google, adopt it so this browser
      // uses the same deviceId that initiated the auth flow.
      if (state) {
        localStorage.setItem('do-device-id', state);
        useCalendarStore.setState({ deviceId: state });
      }
      window.history.replaceState({}, '', window.location.pathname);
      useCalendarStore.getState().handleAuthCallback(code);
    }
  }, []);

  // Check calendar connection status on mount
  useEffect(() => {
    useCalendarStore.getState().checkStatus();
  }, []);

  // Switch to focus view when a notification is tapped
  useEffect(() => {
    if (!isNativePlatform()) return;
    const cleanup = setupNotificationTapListener((taskId) => {
      console.log('[Index] notification tap → switching to focus view, taskId:', taskId);
      useTaskStore.getState().setViewMode('focus');
    });
    return cleanup;
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

  // Listen for help panel open requests (e.g. from drag blocked info button)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setHelpSection(detail?.section);
      setHelpOpen(true);
    };
    window.addEventListener('open-help', handler);
    return () => window.removeEventListener('open-help', handler);
  }, []);

  // Listen for subscribe panel toggle
  useEffect(() => {
    const handler = () => setSubscribeOpen((o) => !o);
    window.addEventListener('toggle-subscribe', handler);
    return () => window.removeEventListener('toggle-subscribe', handler);
  }, []);

  return (
    <div className={`min-h-screen bg-background pb-16 sm:pb-0`}>
      {/* Mandatory tutorial for first-time users */}
      {tutorialNeeded && (
        <InteractiveTutorial open={true} onClose={handleTutorialClose} mandatory />
      )}

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
      <HelpPanel open={helpOpen} onClose={() => { setHelpOpen(false); setHelpSection(undefined); }} initialSection={helpSection} />

      {/* Subscribe dialog */}
      <AnimatePresence>
        {subscribeOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setSubscribeOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
            >
              <Paywall
                trialDaysLeft={trialDaysLeft}
                trialExpired={false}
                onAccessGranted={() => { refreshSub(); setSubscribeOpen(false); }}
                subscriptionStatus={subscription?.status}
                cancellingDaysLeft={cancellingDaysLeft}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;
