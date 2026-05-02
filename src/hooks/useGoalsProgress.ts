import { useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, format, parseISO, isWithinInterval } from 'date-fns';
import { useTaskStore } from '@/store/taskStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useGoalsStore, type Goal, type GoalPeriod } from '@/store/goalsStore';

export interface GoalProgress {
  goal: Goal;
  current: number;
  target: number;
  pct: number;
  reached: boolean;
  periodLabel: string;
  periodKey: string;
  tagLabel: string;
}

function periodRange(period: GoalPeriod, ref = new Date()): { start: Date; end: Date; key: string; label: string } {
  if (period === 'daily') {
    const d = startOfDay(ref);
    return { start: d, end: d, key: format(d, 'yyyy-MM-dd'), label: 'TODAY' };
  }
  if (period === 'weekly') {
    const start = startOfWeek(ref, { weekStartsOn: 1 });
    const end = endOfWeek(ref, { weekStartsOn: 1 });
    return { start, end, key: `W-${format(start, 'yyyy-MM-dd')}`, label: 'THIS WEEK' };
  }
  const start = startOfMonth(ref);
  const end = endOfMonth(ref);
  return { start, end, key: `M-${format(start, 'yyyy-MM')}`, label: 'THIS MONTH' };
}

/** A task counts toward goal-tag if its category equals tag OR is a subtag (parent rolls up). */
function tagMatches(taskCategory: string | null | undefined, goalTag: string): boolean {
  const cat = taskCategory || '';
  if (goalTag === '') return cat === '';
  return cat === goalTag || cat.startsWith(goalTag + '/');
}

export function useGoalsProgress(): GoalProgress[] {
  const tasks = useTaskStore((s) => s.tasks);
  const goals = useGoalsStore((s) => s.goals);
  const categories = useLibraryStore((s) => s.categories);

  return useMemo(() => {
    return goals.map((goal) => {
      const { start, end, key, label } = periodRange(goal.period);
      const inRange = tasks.filter((t) => {
        if (t.archiveReason === 'deleted') return false;
        try {
          if (!isWithinInterval(parseISO(t.date), { start, end })) return false;
        } catch { return false; }
        return tagMatches(t.category, goal.tag);
      });

      let current = 0;
      if (goal.metric === 'completed-tasks') {
        current = inRange.filter((t) => t.completed).length;
      } else if (goal.metric === 'scheduled-minutes') {
        current = inRange.reduce((s, t) => s + (t.duration || 30), 0);
      } else {
        current = inRange.filter((t) => t.completed).reduce((s, t) => s + (t.duration || 30), 0);
      }

      const tagLabel =
        goal.tag === '' ? 'UNTAGGED' : (categories.find((c) => c.value === goal.tag)?.label || goal.tag);

      const pct = goal.target > 0 ? Math.min(1, current / goal.target) : 0;
      return {
        goal,
        current,
        target: goal.target,
        pct,
        reached: current >= goal.target && goal.target > 0,
        periodLabel: label,
        periodKey: key,
        tagLabel,
      };
    });
  }, [goals, tasks, categories]);
}

/** Mount once at the app/Analytics level — fires a single toast per period when a goal is hit. */
export function useGoalCelebrationWatcher() {
  const progress = useGoalsProgress();
  const lastCelebrated = useGoalsStore((s) => s.lastCelebrated);
  const markCelebrated = useGoalsStore((s) => s.markCelebrated);

  useEffect(() => {
    progress.forEach((p) => {
      if (!p.reached) return;
      if (lastCelebrated[p.goal.id] === p.periodKey) return;
      const metricLabel =
        p.goal.metric === 'completed-tasks'
          ? `${p.target} task${p.target === 1 ? '' : 's'} completed`
          : p.goal.metric === 'scheduled-minutes'
            ? `${p.target} min scheduled`
            : `${p.target} min completed`;
      toast.success(`Goal reached — ${p.tagLabel}`, {
        description: `${metricLabel} · ${p.periodLabel.toLowerCase()}. Nice work.`,
        duration: 6000,
      });
      markCelebrated(p.goal.id, p.periodKey);
    });
  }, [progress, lastCelebrated, markCelebrated]);
}