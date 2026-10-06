import { createContext, useCallback, useContext, useLayoutEffect, useRef } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useTimezoneStore } from '@/store/timezoneStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useQuickAddStore } from '@/store/quickAddStore';
import { useCarryStore } from '@/store/carryStore';
import { useReflectionStore } from '@/store/reflectionStore';
import { useTutorialStore } from '@/tutorial/tutorialStore';
import { chooseAppEntryDestination, getAppClock } from '@/lib/appEntryDestination';
import { APP_ENTRY_REFRESH, type EntryRefreshEvent } from '@/lib/appActivity';

// Provided only after AuthGuard's current-account data/access gate has succeeded.
export const AppEntryAccountContext = createContext<string | null>(null);

export function useAppEntryNavigation(overlayOpen: boolean) {
  const userId = useContext(AppEntryAccountContext);
  const overlayRef = useRef(overlayOpen);
  overlayRef.current = overlayOpen;
  const initialApplied = useRef<string | null>(null);
  const pending = useRef<number | null>(null);
  const refreshing = useRef<number | null>(null);

  const blocked = useCallback(() => {
    const el = document.activeElement as HTMLElement | null;
    return overlayRef.current || !!useTaskStore.getState().editingTaskId ||
      useLibraryStore.getState().panelOpen || useCalendarStore.getState().panelOpen ||
      useQuickAddStore.getState().open || useTutorialStore.getState().active ||
      !!useCarryStore.getState().carried || !!useReflectionStore.getState().activePrompt ||
      !!document.querySelector('[role="dialog"], [role="alertdialog"]') ||
      !!el?.matches('input, textarea, [contenteditable="true"]') ||
      /(?:^|[?#&])(code|checkout|access_token|error)=/.test(location.search + location.hash);
  }, []);

  const apply = useCallback(() => {
    if (!userId || blocked()) return;
    const now = new Date();
    const timezone = useTimezoneStore.getState().timezone;
    const { date } = getAppClock(now, timezone);
    // Generation is idempotent; a no-op retains the tasks reference.
    useTaskStore.getState().generateRecurringInstances(date, date);
    const state = useTaskStore.getState();
    const destination = chooseAppEntryDestination(state.tasks, state.routinesEnabled, timezone, now);
    useTaskStore.setState(destination.view === 'day' ? {
      viewMode: 'day', daySubMode: 'timeline', currentDate: date, navigateToDate: date,
      listReturnZoom: null, showListReturn: false, focusTaskId: null, focusEntryPanel: null,
    } : { viewMode: 'focus', focusTaskId: null, focusEntryPanel: destination.panel });
    window.dispatchEvent(new Event('app-entry:applied'));
  }, [blocked, userId]);

  useLayoutEffect(() => {
    if (!userId || initialApplied.current === userId) return;
    initialApplied.current = userId;
    pending.current = null;
    if (document.visibilityState !== 'hidden') apply();
  }, [apply, userId]);

  useLayoutEffect(() => {
    const cancel = () => { pending.current = null; };
    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent<EntryRefreshEvent>).detail;
      if (detail.userId !== userId) return;
      if (detail.phase === 'start') {
        refreshing.current = detail.generation;
        pending.current = blocked() ? null : detail.generation;
      } else if (detail.phase === 'cancel') { refreshing.current = null; cancel(); }
      else if (refreshing.current === detail.generation) {
        refreshing.current = null;
        if (pending.current === detail.generation) { cancel(); apply(); }
      }
    };
    const unsub = useTaskStore.subscribe((s, previous) => {
      if (s.viewMode !== previous.viewMode || s.daySubMode !== previous.daySubMode ||
          s.currentDate !== previous.currentDate || s.navigateToDate !== previous.navigateToDate ||
          s.editingTaskId !== previous.editingTaskId) cancel();
    });
    window.addEventListener(APP_ENTRY_REFRESH, onRefresh);
    window.addEventListener('pointerdown', cancel, true);
    window.addEventListener('keydown', cancel, true);
    window.addEventListener('wheel', cancel, { passive: true, capture: true });
    return () => {
      refreshing.current = null; cancel(); unsub();
      window.removeEventListener(APP_ENTRY_REFRESH, onRefresh);
      window.removeEventListener('pointerdown', cancel, true);
      window.removeEventListener('keydown', cancel, true);
      window.removeEventListener('wheel', cancel, true);
    };
  }, [apply, blocked, userId]);

  // A notification during foreground refresh uses that refresh's settled snapshot.
  return useCallback(() => { if (refreshing.current === null) apply(); }, [apply]);
}
