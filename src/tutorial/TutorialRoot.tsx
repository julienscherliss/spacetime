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
  const { active, stepIndex, advance, dismiss, finishPart } = useTutorialStore();
  const libItems = useLibraryStore((s) => s.items);
  const tasks = useTaskStore((s) => s.tasks);

  const step = part1Steps[stepIndex];
  const isFinal = stepIndex >= part1Steps.length - 1;

  // Compute checklist progress for the create-tasks step from real library state.
  const checklistProgress = useMemo(() => {
    if (!step || step.id !== 'create-tasks') return undefined;
    const hit = [false, false, false];
    for (const it of libItems) {
      const h = horizonOf(it.dueDate);
      if (h !== null) hit[h] = true;
    }
    return hit;
  }, [step?.id, libItems]);

  // Smart adaptive: auto-advance when conditions for the current step are
  // already met (e.g. user has already created 3 tasks across horizons, or
  // already has a completed task).
  useEffect(() => {
    if (!active || !step) return;
    if (step.id === 'create-tasks' && checklistProgress) {
      const hit = checklistProgress.filter(Boolean).length;
      if (hit >= 2) {
        const t = setTimeout(() => advance(), 600);
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

  if (!active || !step) return null;

  const handleAdvance = () => {
    if (isFinal) {
      finishPart('part1');
      return;
    }
    advance();
  };

  return (
    <TutorialOverlay
      step={step}
      stepNumber={stepIndex + 1}
      totalSteps={part1Steps.length}
      checklistProgress={checklistProgress}
      onAdvance={handleAdvance}
      onSkip={dismiss}
    />
  );
}