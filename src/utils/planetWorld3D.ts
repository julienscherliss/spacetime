// Aggregate landscape generation for Universe View.
// The world is shaped by the *history* of a tag — peaks of activity become
// mountains, dry spells become valleys, streaks carve rivers, milestones
// become landmarks. Active tasks live in the panel, not the world.

import type { Task } from "@/store/taskStore";

export const WORLD_RADIUS = 8;
export const HISTOGRAM_BINS = 64;
export const PEAK_HEIGHT = 2.2;

export interface LandscapeData {
  seed: number;
  totalCompleted: number;
  totalMinutes: number;
  ageDays: number;
  consistency: number;
  longTaskRatio: number;

  histogram: number[];       // completions normalized 0..1
  hoursHistogram: number[];  // minutes-normalized 0..1
  binStart: Date;
  binEnd: Date;

  bestStreakDays: number;
  bestStreakSpanT: { startT: number; endT: number } | null;

  // settlements clustered around sustained-effort regions
  settlements: SettlementSite[];
  // landmark sites for milestone thresholds
  landmarks: LandmarkSite[];
  // forest scatter points, sized by hours in their region
  forest: ForestPoint[];
  // first-completion marker
  firstT: number | null;
}

export interface SettlementSite {
  x: number;
  z: number;
  buildings: number; // 1..6
  band: number;      // histogram bin index
  hours: number;     // hours represented
}

export interface LandmarkSite {
  x: number;
  z: number;
  threshold: number; // 50, 100, 250, 500, 1000
  label: string;
}

export interface ForestPoint {
  x: number;
  z: number;
  scale: number;
  variant: number; // 0..2
}

// ---------- helpers ----------

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// 2D value noise — deterministic per seed
export function makeFBM(seed: number) {
  const rng = mulberry32(seed);
  const size = 128;
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = rng() * 2 - 1;
  const at = (xi: number, yi: number) =>
    grid[((yi % size) + size) % size * size + ((xi % size) + size) % size];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf;
  };
  return (x: number, y: number) => {
    let total = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < 4; i++) {
      total += noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return total / norm;
  };
}

// sample histogram with smooth interpolation
export function sampleHistogram(hist: number[], t: number): number {
  const n = hist.length;
  const idx = Math.max(0, Math.min(n - 1, t * (n - 1)));
  const i0 = Math.floor(idx);
  const i1 = Math.min(n - 1, i0 + 1);
  const f = idx - i0;
  return lerp(hist[i0], hist[i1], f);
}

// ---------- terrain function (used by both renderer and feature scatter) ----------

export interface TerrainCtx {
  fbm: (x: number, y: number) => number;
  histogram: number[];
  hoursHistogram: number[];
  consistency: number;
  riverFn?: (x: number) => number; // z position of river at given x
  riverStrength: number;
  totalCompleted: number;
}

export function terrainHeight(x: number, z: number, ctx: TerrainCtx): number {
  const R = WORLD_RADIUS;
  const dist = Math.sqrt(x * x + z * z) / R;
  if (dist > 1.05) return 0;

  // Island falloff — soft cosine edge
  const island = smoothstep(1, 0.55, dist);

  const chronoT = Math.max(0, Math.min(1, (x + R) / (2 * R)));
  const activity = sampleHistogram(ctx.histogram, chronoT);
  const hours = sampleHistogram(ctx.hoursHistogram, chronoT);

  // Lateral noise to break time-bands into organic hills
  const lateral = ctx.fbm(x * 0.18, z * 0.28) * 0.5 + 0.5;
  const detail = ctx.fbm(x * 0.55 + 11, z * 0.55 + 7) * 0.5 + 0.5;

  // Combine: time-band drives main elevation, lateral noise creates variation
  // along the perpendicular axis so it doesn't look like ridges.
  const blend =
    activity * 0.55 + hours * 0.35 + (activity * 0.5 + 0.5) * lateral * 0.25;
  let h = island * (blend * PEAK_HEIGHT + detail * 0.35);

  // Empty terrain still has a soft baseline
  if (ctx.totalCompleted < 3) {
    h = island * (0.25 + detail * 0.25);
  }

  // Carve river along streak path
  if (ctx.riverFn && ctx.riverStrength > 0) {
    const rZ = ctx.riverFn(x);
    const dz = Math.abs(z - rZ);
    const width = 0.55;
    const carve = Math.max(0, 1 - dz / width);
    h -= carve * carve * 0.7 * ctx.riverStrength;
  }

  return Math.max(0, h);
}

// ---------- data builder ----------

function tagMatches(category: string | undefined, tag: string): boolean {
  if (!category) return false;
  return category === tag || category.startsWith(tag + "/");
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function buildLandscape(
  tagValue: string,
  allTasks: Task[],
  now: Date = new Date()
): LandscapeData {
  const seed = hashString(tagValue || "untagged");
  const inTag = allTasks.filter((t) => tagMatches(t.category, tagValue));
  const completed = inTag
    .filter((t) => t.completed && t.archivedAt)
    .sort((a, b) => (a.archivedAt || "").localeCompare(b.archivedAt || ""));

  const totalCompleted = completed.length;
  const totalMinutes = completed.reduce((s, t) => s + (t.duration || 0), 0);

  // Time window — from first completion (or 60d ago) to today
  const today = startOfDay(now);
  const firstDate = completed.length
    ? new Date(completed[0].archivedAt!)
    : new Date(today.getTime() - 1000 * 60 * 60 * 24 * 60);
  const binStart = startOfDay(firstDate);
  const binEnd = new Date(today);
  binEnd.setDate(binEnd.getDate() + 1);
  const totalSpan = Math.max(
    1,
    binEnd.getTime() - binStart.getTime()
  );
  const ageDays = Math.floor(totalSpan / (1000 * 60 * 60 * 24));

  // Build histograms across HISTOGRAM_BINS chronological bins
  const counts = new Array(HISTOGRAM_BINS).fill(0);
  const mins = new Array(HISTOGRAM_BINS).fill(0);
  for (const t of completed) {
    const ts = new Date(t.archivedAt!).getTime();
    const tt = (ts - binStart.getTime()) / totalSpan;
    const idx = Math.max(0, Math.min(HISTOGRAM_BINS - 1, Math.floor(tt * HISTOGRAM_BINS)));
    counts[idx]++;
    mins[idx] += t.duration || 0;
  }

  // Smooth histograms (1-2-1 kernel x2) for organic hills
  const smoothArr = (a: number[]) => {
    const out = a.slice();
    for (let pass = 0; pass < 2; pass++) {
      const prev = out.slice();
      for (let i = 0; i < out.length; i++) {
        const l = prev[Math.max(0, i - 1)];
        const r = prev[Math.min(out.length - 1, i + 1)];
        out[i] = (l + 2 * prev[i] + r) / 4;
      }
    }
    return out;
  };
  const smoothCounts = smoothArr(counts);
  const smoothMins = smoothArr(mins);
  const maxC = Math.max(1, ...smoothCounts);
  const maxM = Math.max(1, ...smoothMins);
  const histogram = smoothCounts.map((v) => v / maxC);
  const hoursHistogram = smoothMins.map((v) => v / maxM);

  // Consistency: fraction of weeks with at least one completion
  const dayKeys = new Set<string>();
  for (const t of completed) {
    const d = new Date(t.archivedAt!);
    d.setHours(0, 0, 0, 0);
    dayKeys.add(d.toISOString().slice(0, 10));
  }
  const weeksSpan = Math.max(1, Math.ceil(ageDays / 7));
  const consistency = Math.min(1, dayKeys.size / 7 / weeksSpan);

  // Long vs short task ratio
  const longCount = completed.filter((t) => (t.duration || 0) >= 60).length;
  const longTaskRatio = totalCompleted ? longCount / totalCompleted : 0;

  // Longest daily streak + its time span
  let bestStreak = 0;
  let curStreak = 0;
  let curStart: string | null = null;
  let bestStart: string | null = null;
  let bestEnd: string | null = null;
  let prev: Date | null = null;
  const sortedDays = [...dayKeys].sort();
  for (const k of sortedDays) {
    const d = new Date(k);
    if (prev) {
      const diff = Math.round((d.getTime() - prev.getTime()) / 86400000);
      if (diff === 1) curStreak++;
      else {
        curStreak = 1;
        curStart = k;
      }
    } else {
      curStreak = 1;
      curStart = k;
    }
    if (curStreak > bestStreak) {
      bestStreak = curStreak;
      bestStart = curStart;
      bestEnd = k;
    }
    prev = d;
  }
  let bestStreakSpanT: { startT: number; endT: number } | null = null;
  if (bestStreak > 1 && bestStart && bestEnd) {
    bestStreakSpanT = {
      startT: (new Date(bestStart).getTime() - binStart.getTime()) / totalSpan,
      endT: (new Date(bestEnd).getTime() - binStart.getTime()) / totalSpan,
    };
  }

  // ---------- settlements ----------
  // Peak detection across histogram (local maxima where hours > threshold)
  const fbm = makeFBM(seed);
  const settlements: SettlementSite[] = [];
  const usedBins = new Set<number>();
  const peakThreshold = 0.35;
  const indexed = hoursHistogram
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v);

  for (const { v, i } of indexed) {
    if (v < peakThreshold) break;
    // dedupe nearby peaks
    let near = false;
    for (const u of usedBins) {
      if (Math.abs(u - i) < 4) {
        near = true;
        break;
      }
    }
    if (near) continue;
    usedBins.add(i);
    const chronoT = i / (HISTOGRAM_BINS - 1);
    const x = lerp(-WORLD_RADIUS * 0.85, WORLD_RADIUS * 0.85, chronoT);
    // Z offset from lateral noise so settlements scatter naturally
    const z = fbm(x * 0.4, 3.1 + i * 0.1) * WORLD_RADIUS * 0.55;
    const hoursAtBin = smoothMins[i];
    // 1..6 buildings based on hours invested in that band
    const buildings = Math.max(1, Math.min(6, Math.round(1 + Math.log(1 + hoursAtBin / 60) * 1.6)));
    settlements.push({ x, z, buildings, band: i, hours: hoursAtBin });
    if (settlements.length >= 8) break;
  }

  // ---------- landmarks (milestone obelisks) ----------
  const thresholds = [50, 100, 250, 500, 1000, 2000];
  const landmarks: LandmarkSite[] = [];
  for (const th of thresholds) {
    if (totalCompleted < th) break;
    const ts = new Date(completed[th - 1].archivedAt!).getTime();
    const tt = (ts - binStart.getTime()) / totalSpan;
    const x = lerp(-WORLD_RADIUS * 0.8, WORLD_RADIUS * 0.8, tt);
    const z = fbm(x * 0.5 + 99, 5.7 + th * 0.001) * WORLD_RADIUS * 0.6;
    landmarks.push({ x, z, threshold: th, label: `${th} completions` });
  }

  // ---------- forest scatter ----------
  // Place trees with density proportional to local completion count.
  // Reject points outside island, on river, or on settlements.
  const rng = mulberry32(seed ^ 0x77c0a5);
  const forest: ForestPoint[] = [];
  const targetTrees = Math.min(420, Math.floor(80 + totalCompleted * 1.4));
  let attempts = 0;
  while (forest.length < targetTrees && attempts < targetTrees * 12) {
    attempts++;
    const x = (rng() * 2 - 1) * WORLD_RADIUS * 0.95;
    const z = (rng() * 2 - 1) * WORLD_RADIUS * 0.95;
    const r = Math.sqrt(x * x + z * z) / WORLD_RADIUS;
    if (r > 0.95) continue;
    const chronoT = (x + WORLD_RADIUS) / (2 * WORLD_RADIUS);
    const activity = sampleHistogram(histogram, chronoT);
    // Density gate
    const density = activity * 0.85 + 0.05;
    if (rng() > density) continue;
    // Avoid settlements
    let blocked = false;
    for (const s of settlements) {
      if (Math.hypot(s.x - x, s.z - z) < 0.7 + s.buildings * 0.15) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    forest.push({
      x,
      z,
      scale: 0.7 + rng() * 0.6 + activity * 0.4,
      variant: Math.floor(rng() * 3),
    });
  }

  const firstT =
    completed.length > 0
      ? (new Date(completed[0].archivedAt!).getTime() - binStart.getTime()) /
        totalSpan
      : null;

  return {
    seed,
    totalCompleted,
    totalMinutes,
    ageDays,
    consistency,
    longTaskRatio,
    histogram,
    hoursHistogram,
    binStart,
    binEnd,
    bestStreakDays: bestStreak,
    bestStreakSpanT,
    settlements,
    landmarks,
    forest,
    firstT,
  };
}

// Pre-built TerrainCtx from landscape data
export function makeTerrainCtx(land: LandscapeData): TerrainCtx {
  const fbm = makeFBM(land.seed);
  let riverFn: ((x: number) => number) | undefined;
  let riverStrength = 0;
  if (land.bestStreakSpanT && land.bestStreakDays >= 3) {
    // River follows a meandering curve across the streak's x range
    const xs =
      lerp(-WORLD_RADIUS * 0.95, WORLD_RADIUS * 0.95, land.bestStreakSpanT.startT);
    const xe =
      lerp(-WORLD_RADIUS * 0.95, WORLD_RADIUS * 0.95, land.bestStreakSpanT.endT);
    const lo = Math.min(xs, xe);
    const hi = Math.max(xs, xe);
    riverFn = (x: number) => {
      // outside streak window the river fades (no carve)
      const inRange = x >= lo - 0.5 && x <= hi + 0.5;
      if (!inRange) return 999;
      // gentle meander
      return fbm(x * 0.35, 9.3) * 2.4;
    };
    riverStrength = Math.min(1, land.bestStreakDays / 14);
  }
  return {
    fbm,
    histogram: land.histogram,
    hoursHistogram: land.hoursHistogram,
    consistency: land.consistency,
    riverFn,
    riverStrength,
    totalCompleted: land.totalCompleted,
  };
}

export type WorldData = LandscapeData;