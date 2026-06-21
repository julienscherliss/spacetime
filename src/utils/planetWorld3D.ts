// Data-driven 3D world for Universe View.
// Every object in the scene corresponds to a real piece of user data —
// the world is a physical manifestation of the user's history with a tag.

import type { Task } from "@/store/taskStore";

export const GRID_SIZE = 12;              // 12x12 = 144 weekly tiles
export const WEEKS_TOTAL = GRID_SIZE * GRID_SIZE;
export const TILE = 1;                    // world units per tile

export interface WeekCell {
  index: number;                          // 0..143, 0 = oldest
  col: number;
  row: number;
  weekStart: Date;
  completedMinutes: number;
  completedCount: number;
  // contributions used for terrain
  contributing: Task[];
}

export type ObjectKind =
  | "tree"        // small completed task
  | "building"    // long completed task
  | "obelisk"     // milestone (every 25 completions)
  | "beacon-red"  // overdue task
  | "beacon-amber"// due-soon task
  | "marker";     // first-completion marker

export interface WorldObject {
  id: string;
  kind: ObjectKind;
  // world position (x = col, z = row, y = on top of terrain)
  col: number;
  row: number;
  jitterX: number;
  jitterZ: number;
  height: number;        // visual height
  scale: number;
  task?: Task;           // source task if applicable
  label?: string;        // for milestones/markers
}

export interface WorldData {
  cells: WeekCell[];
  heightMap: number[];   // length WEEKS_TOTAL, normalized 0..1
  maxMinutesPerWeek: number;
  objects: WorldObject[];
  firstCompletion?: Date;
  longestStreakDays: number;
  streakPath: { col: number; row: number }[]; // tile path of best streak
  totalCompleted: number;
  totalMinutes: number;
  weekStart0: Date;      // start of oldest tile (week index 0)
}

function startOfWeek(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  c.setDate(c.getDate() - c.getDay()); // Sun
  return c;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

// Deterministic per-task jitter within a tile (so each object has a
// stable position from its own id, not from RNG).
function taskJitter(id: string): { x: number; z: number; rot: number } {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = (h & 0xffff) / 0xffff;
  const b = ((h >>> 16) & 0xffff) / 0xffff;
  const c = ((h * 1103515245 + 12345) >>> 16) & 0xffff;
  return {
    x: (a - 0.5) * 0.7,
    z: (b - 0.5) * 0.7,
    rot: (c / 0xffff) * Math.PI * 2,
  };
}

function tagMatches(category: string | undefined, tag: string): boolean {
  if (!category) return false;
  return category === tag || category.startsWith(tag + "/");
}

export function buildWorldData(
  tagValue: string,
  allTasks: Task[],
  now: Date = new Date()
): WorldData {
  const inTag = allTasks.filter((t) => tagMatches(t.category, tagValue));
  const completed = inTag
    .filter((t) => t.completed && t.archivedAt)
    .sort((a, b) => (a.archivedAt || "").localeCompare(b.archivedAt || ""));

  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const soonCut = new Date(today);
  soonCut.setDate(soonCut.getDate() + 7);

  // The most recent tile (index WEEKS_TOTAL-1) is the current week.
  const currentWeekStart = startOfWeek(now);
  const week0Start = new Date(currentWeekStart);
  week0Start.setDate(week0Start.getDate() - 7 * (WEEKS_TOTAL - 1));

  // Build cells
  const cells: WeekCell[] = [];
  for (let i = 0; i < WEEKS_TOTAL; i++) {
    const ws = new Date(week0Start);
    ws.setDate(ws.getDate() + 7 * i);
    cells.push({
      index: i,
      col: i % GRID_SIZE,
      row: Math.floor(i / GRID_SIZE),
      weekStart: ws,
      completedMinutes: 0,
      completedCount: 0,
      contributing: [],
    });
  }

  // Assign completed tasks to week tiles
  for (const t of completed) {
    const ts = new Date(t.archivedAt!);
    const diffWeeks = Math.floor(
      (startOfWeek(ts).getTime() - week0Start.getTime()) /
        (1000 * 60 * 60 * 24 * 7)
    );
    if (diffWeeks < 0 || diffWeeks >= WEEKS_TOTAL) continue;
    const cell = cells[diffWeeks];
    cell.completedMinutes += t.duration || 0;
    cell.completedCount += 1;
    cell.contributing.push(t);
  }

  // Heightmap normalization
  const maxMinutesPerWeek = Math.max(
    1,
    ...cells.map((c) => c.completedMinutes)
  );
  const heightMap = cells.map((c) =>
    c.completedMinutes === 0
      ? 0
      : 0.15 + 0.85 * Math.pow(c.completedMinutes / maxMinutesPerWeek, 0.6)
  );

  // Build world objects
  const objects: WorldObject[] = [];

  // Trees + buildings per completed task, placed on its week tile
  let completedCounter = 0;
  for (const t of completed) {
    const ts = new Date(t.archivedAt!);
    const diffWeeks = Math.floor(
      (startOfWeek(ts).getTime() - week0Start.getTime()) /
        (1000 * 60 * 60 * 24 * 7)
    );
    if (diffWeeks < 0 || diffWeeks >= WEEKS_TOTAL) continue;
    const cell = cells[diffWeeks];
    const j = taskJitter(t.id);
    const dur = t.duration || 30;
    completedCounter++;

    if (dur >= 60) {
      objects.push({
        id: `b-${t.id}`,
        kind: "building",
        col: cell.col,
        row: cell.row,
        jitterX: j.x,
        jitterZ: j.z,
        height: Math.min(2.4, 0.4 + dur / 90),
        scale: 0.45 + Math.min(0.5, dur / 240),
        task: t,
      });
    } else {
      objects.push({
        id: `tr-${t.id}`,
        kind: "tree",
        col: cell.col,
        row: cell.row,
        jitterX: j.x,
        jitterZ: j.z,
        height: 0.35 + Math.min(0.4, dur / 90),
        scale: 0.8 + Math.min(0.4, dur / 120),
        task: t,
      });
    }

    // Milestone obelisk on the tile where each 25th completion landed
    if (completedCounter % 25 === 0) {
      objects.push({
        id: `ob-${completedCounter}`,
        kind: "obelisk",
        col: cell.col,
        row: cell.row,
        jitterX: 0,
        jitterZ: 0,
        height: 1.4 + Math.log10(completedCounter) * 0.6,
        scale: 1,
        label: `${completedCounter} tasks`,
      });
    }
  }

  // First-completion marker on its tile
  if (completed.length > 0) {
    const first = completed[0];
    const ts = new Date(first.archivedAt!);
    const diffWeeks = Math.floor(
      (startOfWeek(ts).getTime() - week0Start.getTime()) /
        (1000 * 60 * 60 * 24 * 7)
    );
    if (diffWeeks >= 0 && diffWeeks < WEEKS_TOTAL) {
      const cell = cells[diffWeeks];
      objects.push({
        id: "marker-first",
        kind: "marker",
        col: cell.col,
        row: cell.row,
        jitterX: 0.25,
        jitterZ: -0.25,
        height: 0.6,
        scale: 1,
        label: "First completion",
      });
    }
  }

  // Beacons for overdue / due-soon active tasks
  const active = inTag.filter((t) => !t.completed && !t.archivedAt);
  const overdue = active.filter(
    (t) => t.dueDate && new Date(t.dueDate) < today
  );
  const dueSoon = active.filter((t) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    return d >= today && d < soonCut;
  });

  // Place beacons on the current-week tile so they read as "present concerns"
  const currentCell = cells[WEEKS_TOTAL - 1];
  overdue.forEach((t, i) => {
    const j = taskJitter(t.id);
    objects.push({
      id: `br-${t.id}`,
      kind: "beacon-red",
      col: currentCell.col,
      row: currentCell.row,
      jitterX: j.x,
      jitterZ: j.z,
      height: 1.6,
      scale: 1,
      task: t,
    });
  });
  dueSoon.forEach((t, i) => {
    const j = taskJitter(t.id);
    objects.push({
      id: `ba-${t.id}`,
      kind: "beacon-amber",
      col: currentCell.col,
      row: currentCell.row,
      jitterX: j.x,
      jitterZ: j.z,
      height: 1.3,
      scale: 1,
      task: t,
    });
  });

  // Longest daily streak — derived from completion timestamps
  const dayKeys = new Set<string>();
  for (const t of completed) {
    const d = new Date(t.archivedAt!);
    d.setHours(0, 0, 0, 0);
    dayKeys.add(d.toISOString().slice(0, 10));
  }
  let bestStreak = 0;
  let streakStart: string | null = null;
  let bestStart: string | null = null;
  const sortedDays = [...dayKeys].sort();
  let cur = 0;
  let prev: Date | null = null;
  let curStart: string | null = null;
  for (const k of sortedDays) {
    const d = new Date(k);
    if (prev) {
      const diff = Math.round((d.getTime() - prev.getTime()) / 86400000);
      if (diff === 1) cur++;
      else {
        cur = 1;
        curStart = k;
      }
    } else {
      cur = 1;
      curStart = k;
    }
    if (cur > bestStreak) {
      bestStreak = cur;
      bestStart = curStart;
      streakStart = curStart;
    }
    prev = d;
  }

  // streakPath: trace path across week tiles spanned by the best streak
  const streakPath: { col: number; row: number }[] = [];
  if (bestStart && bestStreak > 1) {
    const s = new Date(bestStart);
    for (let i = 0; i < bestStreak; i++) {
      const d = new Date(s);
      d.setDate(d.getDate() + i);
      const dw = Math.floor(
        (startOfWeek(d).getTime() - week0Start.getTime()) /
          (1000 * 60 * 60 * 24 * 7)
      );
      if (dw < 0 || dw >= WEEKS_TOTAL) continue;
      const cell = cells[dw];
      const point = { col: cell.col, row: cell.row };
      const last = streakPath[streakPath.length - 1];
      if (!last || last.col !== point.col || last.row !== point.row) {
        streakPath.push(point);
      }
    }
  }

  const firstCompletion =
    completed.length > 0 ? new Date(completed[0].archivedAt!) : undefined;

  return {
    cells,
    heightMap,
    maxMinutesPerWeek,
    objects,
    firstCompletion,
    longestStreakDays: bestStreak,
    streakPath,
    totalCompleted: completed.length,
    totalMinutes: completed.reduce((s, t) => s + (t.duration || 0), 0),
    weekStart0: week0Start,
  };
}