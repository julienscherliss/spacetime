import { useEffect, useMemo, useRef } from 'react';
import { useTutorialStore } from './tutorialStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useTaskStore } from '@/store/taskStore';
import { part1Steps } from './steps/part1';
import { TutorialOverlay } from './TutorialOverlay';
import { differenceInCalendarDays, parseISO } from 'date-fns';

/** Horizon buckets for the "add three tasks" checklist. */
function horizonOf(dueDate: string | null | undefined): number | null {
  if (!dueDate) return null;
  try {
    const d = typeof dueDate === 'string' ? parseISO(dueDate) : new Date(dueDate);
    if (isNaN(d.getTime())) return null;
    const days = differenceInCalendarDays(d, new Date());
    if (days <= 1) return 0; // today / tomorrow
    if (days <= 7) return 1; // this week
    return 2; // longer
  } catch {
    return null;
  }
}

export function TutorialRoot() {
  const { active, stepIndex, advance, finishPart, start, dismissed, completedParts } =
    useTutorialStore();
  const libItems = useLibraryStore((s) => s.items);
  const tasks = useTaskStore((s) => s.tasks);

  const step = part1Steps[stepIndex];
  const isFinal = stepIndex >= part1Steps.length - 1;

  // Auto-start the tutorial for empty accounts: no library items and no
  // future-scheduled (incomplete, non-archived) tasks. Re-triggers even for
  // users who previously completed the tutorial — if they're empty again,
  // they get re-onboarded. Only skipped when the user explicitly paused
  // (dismissed) in the current session. Waits briefly after mount so the
  // initial sync from the backend can populate stores first.
  useEffect(() => {
    if (active) return;
    if (dismissed) return;

    const timer = setTimeout(() => {
      const state = useTutorialStore.getState();
      if (state.active || state.dismissed) return;

      const libCount = useLibraryStore
        .getState()
        .items.filter((i) => !i.deletedAt && !i.completed).length;
      const todayStr = new Date().toISOString().slice(0, 10);
      const hasFutureTask = useTaskStore
        .getState()
        .tasks.some(
          (t) => !t.completed && !t.archivedAt && t.date && t.date >= todayStr
        );

      if (libCount === 0 && !hasFutureTask) {
        start('part1');
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [active, dismissed, start]);

  // Compute checklist progress for the create-tasks step from real library state.
  const checklistProgress = useMemo(() => {
    if (!step || step.id !== 'create-tasks') return undefined;
    const hit = [false, false, false];
    for (const it of libItems) {
      if (it.completed || it.deletedAt) continue;
      const h = horizonOf(it.dueDate);
      if (h !== null) hit[h] = true;
    }
    return hit;
  }, [step?.id, libItems]);

  // Auto-advance when conditions for the current step are fully met.
  useEffect(() => {
    if (!active || !step) return;
    if (step.id === 'create-tasks' && checklistProgress) {
      const allHit = checklistProgress.every(Boolean);
      if (allHit) {
        const t = setTimeout(() => advance(), 700);
        return () => clearTimeout(t);
      }
    }
    if (step.id === 'completion') {
      const anyCompleted = tasks.some((t) => t.completed);
      if (anyCompleted) {
        const t = setTimeout(() => advance(), 400);
        return () => clearTimeout(t);
      }
    }
  }, [active, step?.id, checklistProgress, tasks, advance]);

  // Event-driven advancement: each step may name an event whose arrival
  // moves the tutorial forward.
  useEffect(() => {
    if (!active || !step?.awaitEvent) return;
    const evt = step.awaitEvent;
    const handler = () => advance();
    window.addEventListener(evt, handler as EventListener);
    return () => window.removeEventListener(evt, handler as EventListener);
  }, [active, step?.id, step?.awaitEvent, advance]);

  // Detect task-created from library store length changes; fires the event
  // so the store itself stays decoupled.
  const prevLibCount = useRef(libItems.length);
  useEffect(() => {
    if (libItems.length > prevLibCount.current) {
      window.dispatchEvent(new CustomEvent('tutorial:task-created'));
    }
    prevLibCount.current = libItems.length;
  }, [libItems.length]);

  // Detect task-completed from tasks store.
  const prevCompletedCount = useRef(tasks.filter((t) => t.completed).length);
  useEffect(() => {
    const c = tasks.filter((t) => t.completed).length;
    if (c > prevCompletedCount.current) {
      window.dispatchEvent(new CustomEvent('tutorial:task-completed'));
    }
    prevCompletedCount.current = c;
  }, [tasks]);

  // When the archive step begins, close the Library panel so the
  // archive-trigger in the bottom nav is reachable on mobile (and visible
  // on desktop too).
  useEffect(() => {
    if (!active || !step) return;
    if (step.id === 'archive') {
      useLibraryStore.getState().setPanelOpen(false);
    }
    if (step.id === 'schedule-drag') {
      useLibraryStore.getState().setPanelOpen(true);
    }
    if (step.id === 'schedule-complete') {
      useLibraryStore.getState().setPanelOpen(false);
    }
  }, [active, step?.id]);

  // When the tutorial activates (e.g. replayed from Help inside Settings),
  // close obstructing overlays so the user sees the actual app surface.
  useEffect(() => {
    if (!active) return;
    window.dispatchEvent(new CustomEvent('close-settings'));
  }, [active]);

  if (!active || !step) return null;

  const handleAdvance = () => {
    if (isFinal) {
      window.dispatchEvent(new CustomEvent('open-help'));
      finishPart('part1');
      return;
    }
    advance();
  };

  // For the guided create-tasks step, rewrite the body so it asks for the
  // NEXT missing horizon one at a time — turning a single ambiguous prompt
  // into a sequence of concrete actions.
  let displayStep = step;
  if (step.id === 'create-tasks' && checklistProgress) {
    const prompts = [
      'Add a task that is due today. Type a name, set the date to today, and hit enter.',
      'Nice. Now add a task that is due later this week. Pick a date within the next 7 days.',
      'One more — add a task due later this year. Pick a date more than a week out.',
    ];
    const nextIdx = checklistProgress.findIndex((v) => !v);
    const body =
      nextIdx === -1
        ? 'All three added. Nicely done.'
        : prompts[nextIdx];
    displayStep = { ...step, body };
  }

  return (
    <TutorialOverlay
      step={displayStep}
      stepNumber={stepIndex + 1}
      totalSteps={part1Steps.length}
      checklistProgress={checklistProgress}
      onAdvance={handleAdvance}
    />
  );
}