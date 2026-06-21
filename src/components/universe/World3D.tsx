// Procedural particle planet — a living orb of drifting particles whose
// density, color, and complexity are shaped by the tag's task history.
// Evolves across 7 stages: from a sparse dust cloud (Primordial) to a
// richly layered ecosystem of orbiting and surface particles (Complex Life).

import { useEffect, useMemo, useRef } from "react";
import type { LandscapeData } from "@/utils/planetWorld3D";

const PAPER = "#f3f0ea";
const INK = "#1c1b18";
const ACCENT = "#c4663b";

// ------------------------------------------------------------------
// Deterministic RNG
// ------------------------------------------------------------------
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

// ------------------------------------------------------------------
// Stage logic — same thresholds as before so the rest of the app
// (labels, progress bar) keeps working.
// ------------------------------------------------------------------
function computeStage(land: LandscapeData): number {
  const c = land.totalCompleted;
  const consistencyBonus = land.consistency >= 0.4 ? 1 : 0;
  let stage = 0;
  if (c >= 1) stage = 1;
  if (c >= 12) stage = 2;
  if (c >= 40) stage = 3;
  if (c >= 90) stage = 4;
  if (c >= 180) stage = 5;
  if (c >= 360) stage = 6;
  if (consistencyBonus && stage < 6 && c >= 6) stage = Math.min(6, stage + 1);
  return stage;
}

// ------------------------------------------------------------------
// Stage palettes — surface tones evolve from bare mineral to layered life.
// Kept restrained / cassette-futurism: warm ochre, ink, the orange accent.
// ------------------------------------------------------------------
const STAGE_PALETTES: string[][] = [
  // 0 Primordial — bare dust
  ["#2a2622", "#3a342d", "#4a4238"],
  // 1 Geological — rock + mineral
  ["#2a2622", "#4a4238", "#6a5a48", "#8a7558"],
  // 2 Water — adds a cool slate
  ["#2a2622", "#4a4238", "#6a5a48", "#5b6770", "#8a96a0"],
  // 3 Organic emergence — first ochre/umber warmth
  ["#2a2622", "#4a4238", "#7a6248", "#9a7a4a", "#5b6770", "#a89a78"],
  // 4 Plant colonization — muted greens enter
  ["#2a2622", "#4a4238", "#6a6840", "#8a8a4a", "#5b6770", "#9a7a4a", "#c8b884"],
  // 5 Ecosystem — fuller spectrum
  ["#2a2622", "#4a4238", "#6a6840", "#8a8a4a", "#48685a", "#9a7a4a", "#c8b884", "#d8c898"],
  // 6 Complex life — richest, includes accent-warm highlight
  ["#2a2622", "#4a4238", "#6a6840", "#8a8a4a", "#48685a", "#9a7a4a", "#c8b884", "#d8c898", "#c4663b"],
];

// ------------------------------------------------------------------
// 3D FBM on the unit sphere — drives surface biomes.
// ------------------------------------------------------------------
function makeNoise3D(seed: number) {
  const size = 64;
  const rng = mulberry32(seed);
  const grid = new Float32Array(size * size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = rng() * 2 - 1;
  const at = (xi: number, yi: number, zi: number) => {
    const x = ((xi % size) + size) % size;
    const y = ((yi % size) + size) % size;
    const z = ((zi % size) + size) % size;
    return grid[z * size * size + y * size + x];
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
    const c000 = at(xi, yi, zi), c100 = at(xi + 1, yi, zi);
    const c010 = at(xi, yi + 1, zi), c110 = at(xi + 1, yi + 1, zi);
    const c001 = at(xi, yi, zi + 1), c101 = at(xi + 1, yi, zi + 1);
    const c011 = at(xi, yi + 1, zi + 1), c111 = at(xi + 1, yi + 1, zi + 1);
    const x00 = c000 * (1 - xf) + c100 * xf;
    const x10 = c010 * (1 - xf) + c110 * xf;
    const x01 = c001 * (1 - xf) + c101 * xf;
    const x11 = c011 * (1 - xf) + c111 * xf;
    const y0 = x00 * (1 - yf) + x10 * yf;
    const y1 = x01 * (1 - yf) + x11 * yf;
    return y0 * (1 - zf) + y1 * zf;
  };
  return (x: number, y: number, z: number) => {
    let total = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < 4; i++) {
      total += noise(x * freq, y * freq, z * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return total / norm;
  };
}

// ------------------------------------------------------------------
// Particle system
// ------------------------------------------------------------------
interface SurfaceParticle {
  // position on unit sphere
  x: number; y: number; z: number;
  // tangent drift direction (small great-circle step per frame)
  tx: number; ty: number; tz: number;
  color: string;
  size: number;
  baseAlpha: number;
  phase: number; // for subtle twinkle
}

interface OrbitParticle {
  // orbit defined by two orthonormal vectors u,v + radius + angle
  ux: number; uy: number; uz: number;
  vx: number; vy: number; vz: number;
  radius: number;
  angle: number;
  speed: number;
  color: string;
  size: number;
  alpha: number;
}

interface MarkerPoint {
  kind: "overdue" | "soon" | "active";
  x: number; y: number; z: number;
  phase: number;
}

function sampleSphere(rng: () => number): [number, number, number] {
  const u = rng() * 2 - 1;
  const t = rng() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - u * u));
  return [r * Math.cos(t), u, r * Math.sin(t)];
}

function buildSystem(
  world: LandscapeData,
  stage: number,
  overdueCount: number,
  dueSoonCount: number,
  activeCount: number
) {
  const rng = mulberry32(world.seed);
  const noise = makeNoise3D(world.seed ^ 0x9e3779b9);
  const palette = STAGE_PALETTES[Math.max(0, Math.min(6, stage))];

  // Density scales with completions + stage. Stays performant.
  const baseCount = 1400 + stage * 700;
  const completionBoost = Math.min(2400, world.totalCompleted * 6);
  const surfaceCount = Math.min(5200, baseCount + completionBoost);

  // ---- surface particles --------------------------------------------
  const surface: SurfaceParticle[] = [];
  for (let i = 0; i < surfaceCount; i++) {
    const [x, y, z] = sampleSphere(rng);
    // biome via FBM — selects palette index
    const n = noise(x * 1.6, y * 1.6, z * 1.6); // -1..1
    const t = (n + 1) * 0.5; // 0..1
    // gating: at lower stages, only "high elevation" (high n) areas show life
    const stageGate = Math.max(0, Math.min(1, t + (stage - 2) * 0.15));
    let paletteIdx = Math.min(
      palette.length - 1,
      Math.floor(stageGate * palette.length)
    );
    // Stage 0/1 keep almost everything dark
    if (stage <= 1) paletteIdx = Math.min(2, paletteIdx);

    // tangent drift: cross sphere normal with random vector
    const [rx, ry, rz] = sampleSphere(rng);
    let tx = y * rz - z * ry;
    let ty = z * rx - x * rz;
    let tz = x * ry - y * rx;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;

    surface.push({
      x, y, z,
      tx, ty, tz,
      color: palette[paletteIdx],
      size: 0.9 + rng() * 1.3 + (paletteIdx === palette.length - 1 ? 0.4 : 0),
      baseAlpha: 0.45 + rng() * 0.4,
      phase: rng() * Math.PI * 2,
    });
  }

  // ---- orbit particles (atmosphere) ---------------------------------
  // Emerge from stage 2+. Number of rings scales with stage.
  const orbit: OrbitParticle[] = [];
  const ringCount = Math.max(0, stage - 1);
  for (let r = 0; r < ringCount; r++) {
    // Build a random orthonormal pair u,v defining the ring plane.
    const [ax, ay, az] = sampleSphere(rng);
    const [bx, by, bz] = sampleSphere(rng);
    let ux = ax, uy = ay, uz = az;
    // make v orthogonal to u
    let vx = bx, vy = by, vz = bz;
    const dot = ux * vx + uy * vy + uz * vz;
    vx -= ux * dot; vy -= uy * dot; vz -= uz * dot;
    const vl = Math.hypot(vx, vy, vz) || 1;
    vx /= vl; vy /= vl; vz /= vl;

    const radius = 1.15 + 0.12 * r + rng() * 0.06;
    const speed = (0.00018 + rng() * 0.00025) * (rng() < 0.5 ? 1 : -1);
    const ringParticles = 120 + stage * 30 + Math.floor(world.totalCompleted * 0.2);
    const ringPalette = palette.slice(Math.max(1, palette.length - 3));
    for (let i = 0; i < ringParticles; i++) {
      orbit.push({
        ux, uy, uz, vx, vy, vz,
        radius: radius + (rng() - 0.5) * 0.02,
        angle: rng() * Math.PI * 2,
        speed,
        color: ringPalette[Math.floor(rng() * ringPalette.length)],
        size: 0.6 + rng() * 0.9,
        alpha: 0.35 + rng() * 0.4,
      });
    }
  }

  // ---- markers (temporary state) ------------------------------------
  const markers: MarkerPoint[] = [];
  const mrng = mulberry32(world.seed ^ 0xbeef);
  const pushMarkers = (kind: MarkerPoint["kind"], count: number) => {
    for (let i = 0; i < count; i++) {
      const [x, y, z] = sampleSphere(mrng);
      markers.push({ kind, x, y, z, phase: mrng() * Math.PI * 2 });
    }
  };
  pushMarkers("overdue", Math.min(8, overdueCount));
  pushMarkers("soon", Math.min(8, dueSoonCount));
  pushMarkers("active", Math.min(12, activeCount));

  return { surface, orbit, markers, palette };
}

// ------------------------------------------------------------------
// Renderer
// ------------------------------------------------------------------
function ParticleCanvas({
  world,
  overdueCount,
  dueSoonCount,
  activeCount,
  stage,
}: {
  world: LandscapeData;
  overdueCount: number;
  dueSoonCount: number;
  activeCount: number;
  stage: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const system = useMemo(
    () => buildSystem(world, stage, overdueCount, dueSoonCount, activeCount),
    [world, stage, overdueCount, dueSoonCount, activeCount]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0, cx = 0, cy = 0, R = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      W = Math.max(320, rect.width);
      H = Math.max(320, rect.height);
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2;
      cy = H / 2;
      R = Math.min(W, H) * 0.32; // planet radius in px
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // Tilt the world a little so particles read as 3D.
    const tiltX = 0.35; // radians, around X axis
    const sinT = Math.sin(tiltX);
    const cosT = Math.cos(tiltX);

    let yaw = 0;
    const start = performance.now();

    const project = (x: number, y: number, z: number) => {
      // Apply yaw around Y, then tilt around X.
      const sy = Math.sin(yaw), cy_ = Math.cos(yaw);
      const x1 = x * cy_ + z * sy;
      const z1 = -x * sy + z * cy_;
      const y2 = y * cosT - z1 * sinT;
      const z2 = y * sinT + z1 * cosT;
      return { x: x1, y: y2, z: z2 };
    };

    const surfaceDrift = 0.0012; // small per-frame drift
    const draw = (t: number) => {
      const dt = 1; // we use phase * t rather than dt-accurate physics
      const elapsed = (t - start) / 1000;
      yaw = elapsed * 0.06; // slow rotation

      ctx.clearRect(0, 0, W, H);

      // Soft background vignette (matches paper)
      const bg = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, Math.max(W, H));
      bg.addColorStop(0, "rgba(28,27,24,0.06)");
      bg.addColorStop(1, "rgba(28,27,24,0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // ----- Orbit particles BEHIND planet (z<0) -----
      ctx.globalCompositeOperation = "source-over";
      for (const o of system.orbit) {
        o.angle += o.speed * 16; // independent of dt for stability
        // position = u*cos + v*sin scaled by radius
        const c = Math.cos(o.angle), s = Math.sin(o.angle);
        const wx = (o.ux * c + o.vx * s) * o.radius;
        const wy = (o.uy * c + o.vy * s) * o.radius;
        const wz = (o.uz * c + o.vz * s) * o.radius;
        const p = project(wx, wy, wz);
        if (p.z > 0) continue;
        const depth = (p.z + o.radius) / (2 * o.radius); // 0..1, 0=far back
        ctx.globalAlpha = o.alpha * (0.4 + depth * 0.6);
        ctx.fillStyle = o.color;
        ctx.beginPath();
        ctx.arc(cx + p.x * R, cy + p.y * R, o.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // ----- Planet silhouette wash (subtle, so unlit side reads) -----
      const rad = ctx.createRadialGradient(
        cx - R * 0.35, cy - R * 0.35, R * 0.1,
        cx, cy, R
      );
      rad.addColorStop(0, "rgba(28,27,24,0.18)");
      rad.addColorStop(0.7, "rgba(28,27,24,0.35)");
      rad.addColorStop(1, "rgba(28,27,24,0.55)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = rad;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.995, 0, Math.PI * 2);
      ctx.fill();

      // ----- Surface particles (z>=0 visible side) -----
      const lightDir = { x: -0.5, y: -0.55, z: 0.67 };
      for (const sp of system.surface) {
        // drift along tangent — recompute position then renormalize
        const k = surfaceDrift * dt;
        sp.x += sp.tx * k;
        sp.y += sp.ty * k;
        sp.z += sp.tz * k;
        const len = Math.hypot(sp.x, sp.y, sp.z) || 1;
        sp.x /= len; sp.y /= len; sp.z /= len;
        // re-orthogonalize tangent: t = t - (t·n)n then normalize
        const tn = sp.tx * sp.x + sp.ty * sp.y + sp.tz * sp.z;
        sp.tx -= sp.x * tn;
        sp.ty -= sp.y * tn;
        sp.tz -= sp.z * tn;
        const tl = Math.hypot(sp.tx, sp.ty, sp.tz) || 1;
        sp.tx /= tl; sp.ty /= tl; sp.tz /= tl;

        const p = project(sp.x, sp.y, sp.z);
        if (p.z < -0.05) continue;

        // simple lambert shading using projected normal
        const lambert = Math.max(
          0,
          p.x * lightDir.x + p.y * lightDir.y + p.z * lightDir.z
        );
        const shade = 0.35 + lambert * 0.85;
        const twinkle = 0.85 + 0.15 * Math.sin(elapsed * 1.2 + sp.phase);
        ctx.globalAlpha = Math.min(1, sp.baseAlpha * shade * twinkle);
        ctx.fillStyle = sp.color;
        const sz = sp.size * (0.7 + p.z * 0.5);
        ctx.beginPath();
        ctx.arc(cx + p.x * R, cy + p.y * R, sz, 0, Math.PI * 2);
        ctx.fill();
      }

      // ----- Orbit particles IN FRONT of planet (z>=0) -----
      for (const o of system.orbit) {
        const c = Math.cos(o.angle), s = Math.sin(o.angle);
        const wx = (o.ux * c + o.vx * s) * o.radius;
        const wy = (o.uy * c + o.vy * s) * o.radius;
        const wz = (o.uz * c + o.vz * s) * o.radius;
        const p = project(wx, wy, wz);
        if (p.z <= 0) continue;
        const depth = (p.z + o.radius) / (2 * o.radius);
        ctx.globalAlpha = o.alpha * (0.4 + depth * 0.6);
        ctx.fillStyle = o.color;
        ctx.beginPath();
        ctx.arc(cx + p.x * R, cy + p.y * R, o.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // ----- Markers (overdue/soon/active) -----
      for (const m of system.markers) {
        const p = project(m.x, m.y, m.z);
        if (p.z < -0.1) continue;
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.2 + m.phase);
        const color =
          m.kind === "overdue" ? ACCENT :
          m.kind === "soon" ? "#d9a14a" :
          "#3a6d8c";
        const px = cx + p.x * R;
        const py = cy + p.y * R;
        // halo
        ctx.globalAlpha = 0.18 + pulse * 0.22;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, 7 + pulse * 5, 0, Math.PI * 2);
        ctx.fill();
        // ink core
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [system]);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ background: PAPER }}
      />
    </div>
  );
}

// ------------------------------------------------------------------
// Exports
// ------------------------------------------------------------------
export function World3D({
  world,
  overdueCount = 0,
  dueSoonCount = 0,
  activeCount = 0,
}: {
  world: LandscapeData;
  overdueCount?: number;
  dueSoonCount?: number;
  activeCount?: number;
}) {
  const stage = computeStage(world);
  return (
    <ParticleCanvas
      world={world}
      overdueCount={overdueCount}
      dueSoonCount={dueSoonCount}
      activeCount={activeCount}
      stage={stage}
    />
  );
}

export const STAGE_LABELS = [
  "Primordial",
  "Geological Formation",
  "Water Systems",
  "Organic Emergence",
  "Plant Colonization",
  "Ecosystem Formation",
  "Complex Life",
];

export function planetStage(land: LandscapeData): number {
  return computeStage(land);
}
