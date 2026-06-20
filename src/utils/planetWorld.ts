// Deterministic procedural world generation for Universe View.
// Given a tag seed + investment metrics, returns a scene description
// that can be rendered as a minimal isometric diorama.

export interface InvestmentMetrics {
  completedTasks: number;
  completedMinutes: number;
  ageDays: number;          // days since first activity in this tag
  activeTasks: number;
  overdueTasks: number;
  dueSoonTasks: number;
  // 0..1 — fraction of weeks since first activity with at least one completion
  consistency: number;
}

export interface Tile {
  col: number;
  row: number;
  elevation: number; // 0..1
  water: boolean;
}

export type FeatureKind =
  | "tree"
  | "building"
  | "landmark"
  | "path"
  | "beacon-overdue"
  | "beacon-soon";

export interface Feature {
  kind: FeatureKind;
  col: number;
  row: number;
  scale: number; // 0.6..1.4
  rotation?: number;
}

export interface WorldScene {
  tier: number;            // 0..5
  investment: number;      // 0..1
  size: number;            // grid edge length
  tiles: Tile[];
  features: Feature[];
  hasRiver: boolean;
  hasLake: boolean;
}

// --- Seeded RNG ----------------------------------------------------
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

// 2D value noise from a seeded rng
function makeNoise2D(rng: () => number, size: number) {
  const grid: number[] = [];
  const N = size + 2;
  for (let i = 0; i < N * N; i++) grid.push(rng());
  const at = (x: number, y: number) => {
    const xi = Math.max(0, Math.min(N - 1, Math.floor(x)));
    const yi = Math.max(0, Math.min(N - 1, Math.floor(y)));
    return grid[yi * N + xi];
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
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
}

// Investment score → tier 0..5
export function computeInvestment(m: InvestmentMetrics): {
  score: number;
  tier: number;
} {
  // log-scaled hours + tasks + age + consistency
  const hours = m.completedMinutes / 60;
  const taskScore = Math.log(1 + m.completedTasks) / Math.log(80); // ~1 at 80 tasks
  const hourScore = Math.log(1 + hours) / Math.log(200);           // ~1 at 200h
  const ageScore = Math.min(1, m.ageDays / 365);
  const consistencyScore = m.consistency;
  const activeBonus = Math.min(0.15, m.activeTasks / 40);
  const raw =
    0.4 * taskScore +
    0.35 * hourScore +
    0.1 * ageScore +
    0.15 * consistencyScore +
    activeBonus;
  const score = Math.max(0, Math.min(1, raw));
  const tier = Math.min(5, Math.floor(score * 6));
  return { score, tier };
}

export function generateWorld(
  seedKey: string,
  metrics: InvestmentMetrics
): WorldScene {
  const rng = mulberry32(hashString(seedKey || "untagged"));
  const { score, tier } = computeInvestment(metrics);

  // World grows with investment
  const size = 8 + tier * 2; // 8..18
  const noise = makeNoise2D(rng, size);

  // Tile elevation
  const tiles: Tile[] = [];
  const center = (size - 1) / 2;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const n =
        0.6 * noise(c * 0.45, r * 0.45) +
        0.3 * noise(c * 0.9 + 11, r * 0.9 + 7) +
        0.1 * noise(c * 1.8 + 31, r * 1.8 + 17);
      // Falloff toward edge so the island reads as a contained world
      const dx = (c - center) / center;
      const dy = (r - center) / center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const falloff = Math.max(0, 1 - dist * 0.95);
      const elevation = Math.max(0, Math.min(1, n * 0.9 * falloff + 0.05));
      tiles.push({ col: c, row: r, elevation, water: false });
    }
  }

  // Water appears at tier ≥ 3
  const hasLake = tier >= 3 && rng() > 0.25;
  const hasRiver = tier >= 3 && rng() > 0.4;
  if (hasLake) {
    const lx = Math.floor(rng() * size);
    const ly = Math.floor(rng() * size);
    const radius = 1 + Math.floor(rng() * (tier - 1));
    for (const t of tiles) {
      const d = Math.hypot(t.col - lx, t.row - ly);
      if (d <= radius && t.elevation < 0.55) {
        t.water = true;
        t.elevation = Math.min(t.elevation, 0.08);
      }
    }
  }
  if (hasRiver) {
    // Carve a meandering river across the map
    let rrow = Math.floor(rng() * size);
    for (let c = 0; c < size; c++) {
      const t = tiles.find((x) => x.col === c && x.row === rrow);
      if (t && !t.water && t.elevation < 0.6) {
        t.water = true;
        t.elevation = Math.min(t.elevation, 0.08);
      }
      rrow += rng() > 0.5 ? 1 : -1;
      rrow = Math.max(0, Math.min(size - 1, rrow));
    }
  }

  // Features by tier
  const features: Feature[] = [];
  const dryTiles = tiles.filter((t) => !t.water && t.elevation > 0.15);
  const shuffled = dryTiles.slice().sort(() => rng() - 0.5);

  let cursor = 0;
  const pick = (n: number): Tile[] => {
    const out: Tile[] = [];
    while (out.length < n && cursor < shuffled.length) {
      out.push(shuffled[cursor++]);
    }
    return out;
  };

  // Trees — appear from tier 1, scale with investment
  const treeCount = Math.floor(2 + tier * 4 + score * 6);
  pick(treeCount).forEach((t) =>
    features.push({
      kind: "tree",
      col: t.col,
      row: t.row,
      scale: 0.7 + rng() * 0.6,
    })
  );

  // Buildings — tier ≥ 2
  if (tier >= 2) {
    const bCount = Math.floor(1 + (tier - 1) * 2 + score * 3);
    pick(bCount).forEach((t) =>
      features.push({
        kind: "building",
        col: t.col,
        row: t.row,
        scale: 0.8 + rng() * 0.5,
      })
    );
  }

  // Landmark — tier ≥ 4
  if (tier >= 4) {
    const landmarks = pick(tier >= 5 ? 2 : 1);
    landmarks.forEach((t) =>
      features.push({
        kind: "landmark",
        col: t.col,
        row: t.row,
        scale: 1 + rng() * 0.3,
      })
    );
  }

  // Paths — tier ≥ 3, small line segments from noise
  if (tier >= 3) {
    const pathCount = Math.floor(2 + tier);
    pick(pathCount).forEach((t) =>
      features.push({
        kind: "path",
        col: t.col,
        row: t.row,
        scale: 1,
      })
    );
  }

  // Beacons — placed deterministically on dry tiles
  const beaconTiles = dryTiles.slice().sort((a, b) => {
    // sort by hashed position so same metrics → same placements
    const ha = (a.col * 73856093) ^ (a.row * 19349663);
    const hb = (b.col * 73856093) ^ (b.row * 19349663);
    return (ha >>> 0) - (hb >>> 0);
  });
  const usedBeacon = new Set<string>();
  const placeBeacon = (kind: FeatureKind, count: number) => {
    let placed = 0;
    for (const t of beaconTiles) {
      if (placed >= count) break;
      const key = `${t.col},${t.row}`;
      if (usedBeacon.has(key)) continue;
      usedBeacon.add(key);
      features.push({ kind, col: t.col, row: t.row, scale: 1 });
      placed++;
    }
  };
  placeBeacon("beacon-overdue", Math.min(metrics.overdueTasks, 6));
  placeBeacon("beacon-soon", Math.min(metrics.dueSoonTasks, 4));

  return {
    tier,
    investment: score,
    size,
    tiles,
    features,
    hasRiver,
    hasLake,
  };
}

export const TIER_LABEL = [
  "Seedling",
  "Sprout",
  "Grove",
  "Settlement",
  "Township",
  "Metropolis",
];