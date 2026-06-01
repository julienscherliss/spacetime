/**
 * Collision detection utilities for preventing task overlap in the timeline.
 *
 * Core rule: two tasks on the same date must never occupy the same time range.
 * Touching edges (one ends exactly when another begins) are allowed.
 */

import { timeToMinutes, minutesToTime, snapTo15 } from '@/hooks/useCurrentTime';

export interface TimeSlot {
  id: string;
  startMin: number;
  endMin: number;
}

/** Convert a task-like object to a TimeSlot */
export function taskToSlot(task: { id: string; time?: string; duration?: number }): TimeSlot | null {
  if (!task.time) return null;
  const startMin = timeToMinutes(task.time);
  const endMin = startMin + (task.duration || 30);
  return { id: task.id, startMin, endMin };
}

/** Check if two time ranges overlap (touching edges are OK) */
export function slotsOverlap(a: { startMin: number; endMin: number }, b: { startMin: number; endMin: number }): boolean {
  return a.startMin < b.endMin && a.endMin > b.startMin;
}

/**
 * Get all occupied slots for a given date, excluding a specific task ID.
 * When routinesEnabled is false, routine tasks are excluded from collision detection.
 */
export function getOccupiedSlots(
  tasks: Array<{ id: string; time?: string; duration?: number; date: string; completed: boolean; archivedAt?: string; inWaitingRoom?: boolean; isRoutine?: boolean; type?: string; groupId?: string }>,
  date: string,
  excludeId?: string,
  routinesEnabled: boolean = true
): TimeSlot[] {
  return tasks
    .filter(t =>
      t.date === date &&
      !t.completed &&
      !t.archivedAt &&
      !t.inWaitingRoom &&
      !t.groupId &&
      t.time &&
      t.id !== excludeId &&
      // Skip routines when they are disabled
      (routinesEnabled || !(t.isRoutine !== false && t.type === 'recurring'))
    )
    .map(t => taskToSlot(t))
    .filter((s): s is TimeSlot => s !== null)
    .sort((a, b) => a.startMin - b.startMin);
}

/**
 * Find the nearest valid position for a task being dragged.
 * Returns the clamped start minute, or null if no valid position exists nearby.
 *
 * Strategy: try the requested position first. If blocked, try sliding up/down
 * to find the nearest gap that fits the task duration.
 */
export function findValidPosition(
  requestedStart: number,
  duration: number,
  occupiedSlots: TimeSlot[],
  dayStartMin: number = 6 * 60,
  dayEndMin: number = 23 * 60
): { startMin: number; blocked: boolean } {
  const snappedStart = snapTo15(requestedStart);
  const candidate = { startMin: snappedStart, endMin: snappedStart + duration };

  // Check if requested position is valid
  const hasOverlap = occupiedSlots.some(s => slotsOverlap(candidate, s));
  if (!hasOverlap) {
    return { startMin: snappedStart, blocked: false };
  }

  // Find nearest valid gap — search both directions
  let bestStart: number | null = null;
  let bestDistance = Infinity;

  // Try gaps between occupied slots and at edges
  const gaps = findGaps(occupiedSlots, dayStartMin, dayEndMin);
  for (const gap of gaps) {
    const gapSize = gap.endMin - gap.startMin;
    if (gapSize < duration) continue;

    // Clamp to gap boundaries
    let fitStart = Math.max(gap.startMin, Math.min(snappedStart, gap.endMin - duration));
    fitStart = snapTo15(fitStart);
    // Ensure it still fits after snapping
    if (fitStart < gap.startMin) fitStart = snapTo15(gap.startMin + 7); // round up
    if (fitStart + duration > gap.endMin) continue;

    const dist = Math.abs(fitStart - snappedStart);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestStart = fitStart;
    }
  }

  if (bestStart !== null) {
    return { startMin: bestStart, blocked: false };
  }

  // No valid position found — return requested but mark as blocked
  return { startMin: snappedStart, blocked: true };
}

/** Find all free gaps between occupied slots */
function findGaps(slots: TimeSlot[], dayStart: number, dayEnd: number): Array<{ startMin: number; endMin: number }> {
  const gaps: Array<{ startMin: number; endMin: number }> = [];
  let cursor = dayStart;

  for (const slot of slots) {
    if (slot.startMin > cursor) {
      gaps.push({ startMin: cursor, endMin: slot.startMin });
    }
    cursor = Math.max(cursor, slot.endMin);
  }

  if (cursor < dayEnd) {
    gaps.push({ startMin: cursor, endMin: dayEnd });
  }

  return gaps;
}

/**
 * Clamp a resize operation so it doesn't cross neighboring tasks.
 *
 * For bottom resize: returns max allowed endMin
 * For top resize: returns min allowed startMin
 */
export function clampResize(
  taskId: string,
  edge: 'top' | 'bottom',
  currentStart: number,
  currentEnd: number,
  occupiedSlots: TimeSlot[],
  dayStartMin: number = 6 * 60,
  dayEndMin: number = 23 * 60
): { minStart: number; maxEnd: number } {
  let minStart = dayStartMin;
  let maxEnd = dayEndMin;

  for (const slot of occupiedSlots) {
    if (slot.id === taskId) continue;

    // Slot is above: constrains how far up we can resize
    if (slot.endMin <= currentEnd && slot.endMin > minStart) {
      if (edge === 'top' || slot.endMin <= currentStart) {
        minStart = Math.max(minStart, slot.endMin);
      }
    }

    // Slot is below: constrains how far down we can resize
    if (slot.startMin >= currentStart && slot.startMin < maxEnd) {
      if (edge === 'bottom' || slot.startMin >= currentEnd) {
        maxEnd = Math.min(maxEnd, slot.startMin);
      }
    }
  }

  return { minStart, maxEnd };
}

/**
 * Check if placing a new task at the given time would overlap existing tasks.
 */
export function wouldOverlap(
  startMin: number,
  duration: number,
  occupiedSlots: TimeSlot[]
): boolean {
  const candidate = { startMin, endMin: startMin + duration };
  return occupiedSlots.some(s => slotsOverlap(candidate, s));
}

/**
 * Detect which non-routine tasks conflict with active routine tasks on a given date.
 * Returns a Set of task IDs that have routine conflicts.
 */
export function getRoutineConflicts(
  tasks: Array<{ id: string; time?: string; duration?: number; date: string; completed: boolean; archivedAt?: string; inWaitingRoom?: boolean; isRoutine?: boolean; type?: string }>,
  date: string
): Set<string> {
  const conflictIds = new Set<string>();

  // Get routine slots (only active routines with time)
  const routineSlots = tasks
    .filter(t =>
      t.date === date &&
      !t.completed &&
      !t.archivedAt &&
      !t.inWaitingRoom &&
      t.time &&
      t.isRoutine !== false &&
      t.type === 'recurring'
    )
    .map(t => taskToSlot(t))
    .filter((s): s is TimeSlot => s !== null);

  if (routineSlots.length === 0) return conflictIds;

  // Get non-routine tasks
  const nonRoutineTasks = tasks.filter(t =>
    t.date === date &&
    !t.completed &&
    !t.archivedAt &&
    !t.inWaitingRoom &&
    t.time &&
    !(t.isRoutine !== false && t.type === 'recurring')
  );

  for (const task of nonRoutineTasks) {
    const slot = taskToSlot(task);
    if (!slot) continue;
    for (const routine of routineSlots) {
      if (slotsOverlap(slot, routine)) {
        conflictIds.add(task.id);
        break;
      }
    }
  }

  return conflictIds;
}

/**
 * Detect non-completed tasks that overlap timed (non-all-day) calendar events on a given date.
 * Calendar events are treated like locked blocks — tasks overlapping them are flagged as conflicts.
 */
export function getCalendarConflicts(
  tasks: Array<{ id: string; time?: string; duration?: number; date: string; completed: boolean; archivedAt?: string; inWaitingRoom?: boolean }>,
  calendarEvents: Array<{ id: string; time: string | null; duration: number; isAllDay: boolean; date: string; endDate?: string | null }>,
  date: string
): Set<string> {
  const conflictIds = new Set<string>();

  const eventSpans = (event: { date: string; endDate?: string | null }, d: string): boolean => {
    if (event.date === d) return true;
    if (!event.endDate) return false;
    return d >= event.date && d <= event.endDate;
  };

  const eventSlots = calendarEvents
    .filter(e => !e.isAllDay && e.time && eventSpans(e, date))
    .map(e => {
      const startMin = timeToMinutes(e.time!);
      return { startMin, endMin: startMin + (e.duration || 30) };
    });

  if (eventSlots.length === 0) return conflictIds;

  const dayTasks = tasks.filter(t =>
    t.date === date &&
    !t.completed &&
    !t.archivedAt &&
    !t.inWaitingRoom &&
    t.time
  );

  for (const task of dayTasks) {
    const slot = taskToSlot(task);
    if (!slot) continue;
    for (const ev of eventSlots) {
      if (slotsOverlap(slot, ev)) {
        conflictIds.add(task.id);
        break;
      }
    }
  }

  return conflictIds;
}
