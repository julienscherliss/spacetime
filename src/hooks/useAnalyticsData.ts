import { useMemo } from 'react';
import { useTaskStore, Task } from '@/store/taskStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useCalendarStore } from '@/store/calendarStore';
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  subDays, subWeeks, subMonths, format, parseISO, isWithinInterval,
  eachDayOfInterval, differenceInDays, startOfDay, addDays,
} from 'date-fns';

export type TimeRange = 'today' | 'yesterday' | 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'custom';
export type GroupBy = 'day' | 'week' | 'month' | 'tag';
export type DataType = 'scheduled-time' | 'completed-time' | 'task-count' | 'completion-rate' | 'overdue';

export interface AnalyticsFilters {
  timeRange: TimeRange;
  customStart?: string;
  customEnd?: string;
  groupBy: GroupBy;
  dataType: DataType;
  tags: string[];
  completedOnly: boolean;
  incompleteOnly: boolean;
  routinesOnly: boolean;
  recurringOnly: boolean;
  priorities: number[];
  compareMode: 'none' | 'previous-period' | 'planned-vs-completed';
}

export const defaultFilters: AnalyticsFilters = {
  timeRange: 'this-week',
  groupBy: 'day',
  dataType: 'scheduled-time',
  tags: [],
  completedOnly: false,
  incompleteOnly: false,
  routinesOnly: false,
  recurringOnly: false,
  priorities: [],
  compareMode: 'none',
};

function getDateRange(filters: AnalyticsFilters): { start: Date; end: Date } {
  const today = startOfDay(new Date());
  switch (filters.timeRange) {
    case 'today':
      return { start: today, end: today };
    case 'yesterday':
      return { start: subDays(today, 1), end: subDays(today, 1) };
    case 'this-week':
      return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
    case 'last-week': {
      const lw = subWeeks(today, 1);
      return { start: startOfWeek(lw, { weekStartsOn: 1 }), end: endOfWeek(lw, { weekStartsOn: 1 }) };
    }
    case 'this-month':
      return { start: startOfMonth(today), end: endOfMonth(today) };
    case 'last-month': {
      const lm = subMonths(today, 1);
      return { start: startOfMonth(lm), end: endOfMonth(lm) };
    }
    case 'custom':
      return {
        start: filters.customStart ? parseISO(filters.customStart) : subDays(today, 7),
        end: filters.customEnd ? parseISO(filters.customEnd) : today,
      };
    default:
      return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
  }
}

function getPreviousPeriodRange(start: Date, end: Date): { start: Date; end: Date } {
  const days = differenceInDays(end, start) + 1;
  return { start: subDays(start, days), end: subDays(start, 1) };
}

function filterTasks(tasks: Task[], filters: AnalyticsFilters, start: Date, end: Date): Task[] {
  return tasks.filter(t => {
    // Exclude archived-deleted
    if (t.archiveReason === 'deleted') return false;
    // Date range
    const d = parseISO(t.date);
    if (!isWithinInterval(d, { start, end })) return false;
    // Tags
    if (filters.tags.length > 0 && !filters.tags.includes(t.category || '')) return false;
    // Completion
    if (filters.completedOnly && !t.completed) return false;
    if (filters.incompleteOnly && t.completed) return false;
    // Routines
    if (filters.routinesOnly && !t.isRoutine) return false;
    if (filters.recurringOnly && t.type !== 'recurring') return false;
    // Priority
    if (filters.priorities.length > 0 && !filters.priorities.includes(t.priority)) return false;
    return true;
  });
}

export interface TagBreakdown {
  tag: string;
  label: string;
  scheduledMinutes: number;
  completedMinutes: number;
  taskCount: number;
  completedCount: number;
}

export interface DayBreakdown {
  date: string;
  label: string;
  scheduledMinutes: number;
  completedMinutes: number;
  taskCount: number;
  completedCount: number;
}

export interface HeatmapCell {
  date: string;
  value: number;
  dayOfWeek: number;
  weekIndex: number;
}

export interface AnalyticsData {
  range: { start: Date; end: Date };
  prevRange: { start: Date; end: Date };
  tasks: Task[];
  prevTasks: Task[];
  tagBreakdown: TagBreakdown[];
  dayBreakdown: DayBreakdown[];
  heatmap: HeatmapCell[];
  totals: {
    scheduledMinutes: number;
    completedMinutes: number;
    taskCount: number;
    completedCount: number;
    completionRate: number;
  };
  prevTotals: {
    scheduledMinutes: number;
    completedMinutes: number;
    taskCount: number;
    completedCount: number;
    completionRate: number;
  };
  allTags: string[];
}

export function useAnalyticsData(filters: AnalyticsFilters): AnalyticsData {
  const allTasks = useTaskStore(s => s.tasks);
  const categories = useLibraryStore(s => s.categories);
  const calendarEvents = useCalendarStore(s => s.events);
  const completedEventIds = useCalendarStore(s => s.completedEventIds);
  const eventCategories = useCalendarStore(s => s.eventCategories);

  return useMemo(() => {
    const range = getDateRange(filters);
    const prevRange = getPreviousPeriodRange(range.start, range.end);

    const tasks = filterTasks(allTasks, filters, range.start, range.end);
    const prevTasks = filterTasks(allTasks, filters, prevRange.start, prevRange.end);

    // All unique tags from all tasks
    const allTags = [...new Set(allTasks.map(t => t.category || '').filter(Boolean))];

    // Tag breakdown
    const tagMap = new Map<string, TagBreakdown>();
    tasks.forEach(t => {
      const tag = t.category || 'untagged';
      const existing = tagMap.get(tag) || {
        tag,
        label: categories.find(c => c.value === tag)?.label || tag,
        scheduledMinutes: 0, completedMinutes: 0, taskCount: 0, completedCount: 0,
      };
      existing.scheduledMinutes += t.duration || 30;
      if (t.completed) {
        existing.completedMinutes += t.duration || 30;
        existing.completedCount++;
      }
      existing.taskCount++;
      tagMap.set(tag, existing);
    });
    const tagBreakdown = [...tagMap.values()].sort((a, b) => b.scheduledMinutes - a.scheduledMinutes);

    // Day breakdown
    const days = eachDayOfInterval({ start: range.start, end: range.end });
    const dayBreakdown: DayBreakdown[] = days.map(d => {
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayTasks = tasks.filter(t => t.date === dateStr);
      return {
        date: dateStr,
        label: format(d, 'EEE dd'),
        scheduledMinutes: dayTasks.reduce((sum, t) => sum + (t.duration || 30), 0),
        completedMinutes: dayTasks.filter(t => t.completed).reduce((sum, t) => sum + (t.duration || 30), 0),
        taskCount: dayTasks.length,
        completedCount: dayTasks.filter(t => t.completed).length,
      };
    });

    // Heatmap (last 12 weeks)
    const heatmapStart = subDays(range.end, 83);
    const heatmapDays = eachDayOfInterval({ start: heatmapStart, end: range.end });
    const firstMonday = heatmapDays.find(d => d.getDay() === 1) || heatmapStart;
    const heatmap: HeatmapCell[] = heatmapDays
      .filter(d => d >= firstMonday)
      .map(d => {
        const dateStr = format(d, 'yyyy-MM-dd');
        const dayTasks = allTasks.filter(t => t.date === dateStr && t.archiveReason !== 'deleted');
        return {
          date: dateStr,
          value: dayTasks.reduce((sum, t) => sum + (t.duration || 30), 0),
          dayOfWeek: d.getDay() === 0 ? 6 : d.getDay() - 1, // Mon=0
          weekIndex: Math.floor(differenceInDays(d, firstMonday) / 7),
        };
      });

    const calcTotals = (ts: Task[]) => {
      const scheduledMinutes = ts.reduce((s, t) => s + (t.duration || 30), 0);
      const completedMinutes = ts.filter(t => t.completed).reduce((s, t) => s + (t.duration || 30), 0);
      const taskCount = ts.length;
      const completedCount = ts.filter(t => t.completed).length;
      return {
        scheduledMinutes,
        completedMinutes,
        taskCount,
        completedCount,
        completionRate: taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0,
      };
    };

    return {
      range,
      prevRange,
      tasks,
      prevTasks,
      tagBreakdown,
      dayBreakdown,
      heatmap,
      totals: calcTotals(tasks),
      prevTotals: calcTotals(prevTasks),
      allTags,
    };
  }, [allTasks, categories, filters]);
}
