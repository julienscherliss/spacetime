// Painterly 2D planet — a hand-stippled specimen rendered on canvas.
// Each tag's seed produces a unique chromatic identity. As completion
// history grows, the palette gains stages and the surface gains density,
// the way a long-worked painting accrues marks.
//
// No 3D. Inspired by topographic strata illustrations, pointillist
// landscapes, and impressionist gardens — meticulous, layered, painted.

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
// 2D value-noise FBM
// ------------------------------------------------------------------
function makeFBM2D(seed: number, octaves = 4) {
  const size = 128;
  const rng = mulberry32(seed);
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = rng() * 2 - 1;
  const at = (xi: number, yi: number) =>
    grid[(((yi % size) + size) % size) * size + (((xi % size) + size) % size)];
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
    for (let i = 0; i < octaves; i++) {
      total += noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return total / norm;
  };
}

// ------------------------------------------------------------------
// Evolution stage — same logic as before, governs palette + density
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
// Stage palettes. Each is ordered from deepest/lowest to highest/peak.
// Designed to evoke the reference paintings — vivid but cohesive.
// ------------------------------------------------------------------
const STAGE_PALETTES: string[][] = [
  // 0 — Primordial. Dusty rock, ash, ochre.
  ["#2a2521", "#3d362e", "#5a4d3f", "#7a6a55", "#9c8a6f", "#b8a585", "#d4c3a4"],
  // 1 — Geological. Stratified strata: deep plum, terracotta, ochre, bone.
  ["#2a1f3a", "#5b2a4a", "#9c3a3a", "#c45c2e", "#e08a3a", "#f0bb6a", "#e8d4a8", "#bca87c"],
  // 2 — Water systems. Cool depths join the strata.
  ["#1a2a3a", "#2d4a5e", "#4a7088", "#7a98ad", "#a8a094", "#c97a5a", "#e0a85a", "#f0d49a"],
  // 3 — Organic emergence. Microbial darks, mineral teals.
  ["#1a2630", "#284048", "#3d5a52", "#5a7058", "#7e8868", "#a8956e", "#cba874", "#e3c89a"],
  // 4 — Plant colonization. Moss & lichen layered over mineral.
  ["#1c2a26", "#2e4a3a", "#4f6f48", "#7a9058", "#a8b078", "#c4b58a", "#9c8a6e", "#6b5d4a"],
  // 5 — Ecosystem. Forests, wetlands, dappled light.
  ["#162a28", "#1f4a3a", "#3a6e4a", "#6a955a", "#a2bd72", "#d4c98a", "#a8704a", "#5a3a2e"],
  // 6 — Complex life. Pointillist mosaic — full chromatic breath.
  [
    "#1a2a4a", "#3a4a7a", "#5a78a8", "#88a8c4", "#a8c4b8",
    "#7eb098", "#a8c878", "#dcc46a", "#e89a5a", "#c45a6a", "#7a3a6a",
  ],
];

// ------------------------------------------------------------------
// Per-tag identity — drives unique appearance per planet
// ------------------------------------------------------------------
interface Identity {
  hueShift: number;       // -0.08 .. 0.08 (slight global rotation)
  rotation: number;       // 0..2π (orientation of underlying noise)
  mountainScale: number;  // 0.6..1.4
  waterLevel: number;     // 0.32..0.5
  biomeFreq: number;      // 0.6..1.6
  ruggedness: number;     // 0.4..1.0
  dabRatio: number;       // 0.85..1.15 — overall density
  brushSize: number;      // 0.85..1.2 — base brush scale
}

function buildIdentity(seed: number): Identity {
  const rng = mulberry32(seed ^ 0xc0ffee);
  return {
    hueShift: (rng() - 0.5) * 0.16,
    rotation: rng() * Math.PI * 2,
    mountainScale: 0.6 + rng() * 0.8,
    waterLevel: 0.32 + rng() * 0.18,
    biomeFreq: 0.6 + rng() * 1.0,
    ruggedness: 0.4 + rng() * 0.6,
    dabRatio: 0.85 + rng() * 0.3,
    brushSize: 0.85 + rng() * 0.35,
  };
}

// ------------------------------------------------------------------
// HSL helpers
// ------------------------------------------------------------------
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 1) + 1) % 1;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const conv = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(conv(h + 1 / 3) * 255),
    Math.round(conv(h) * 255),
    Math.round(conv(h - 1 / 3) * 255),
  ];
}
function shiftHex(hex: string, hueShift: number, lightFactor = 1, satFactor = 1): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [nr, ng, nb] = hslToRgb(
    h + hueShift,
    Math.max(0, Math.min(1, s * satFactor)),
    Math.max(0, Math.min(1, l * lightFactor))
  );
  return `rgb(${nr},${ng},${nb})`;
}

function shiftPalette(palette: string[], hueShift: number): string[] {
  return palette.map((c) => shiftHex(c, hueShift));
}

// ------------------------------------------------------------------
// Pick a color from a sorted palette by t (0 deep .. 1 high)
// ------------------------------------------------------------------
function paletteSample(palette: string[], t: number): string {
  const idx = Math.max(0, Math.min(palette.length - 1, Math.floor(t * palette.length)));
  return palette[idx];
}

// ------------------------------------------------------------------
// Main renderer — paints the planet onto a static canvas.
// An overlay canvas above hosts shimmer + active task markers.
// ------------------------------------------------------------------
function PlanetCanvas({
  world,
  overdueCount,
  dueSoonCount,
  activeCount,
}: {
  world: LandscapeData;
  overdueCount: number;
  dueSoonCount: number;
  activeCount: number;
}) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const stage = useMemo(() => computeStage(world), [world]);
  const identity = useMemo(() => buildIdentity(world.seed), [world.seed]);

  // ---- Base painting ---------------------------------------------------
  useEffect(() => {
    const canvas = baseRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Background — paper
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.4;

    // Soft cast shadow under the planet
    const shadow = ctx.createRadialGradient(cx, cy + R * 0.95, R * 0.1, cx, cy + R * 0.95, R * 1.05);
    shadow.addColorStop(0, "rgba(28,27,24,0.22)");
    shadow.addColorStop(1, "rgba(28,27,24,0)");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(cx, cy + R * 0.92, R * 1.05, R * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Paper tooth — faint speckle inside the disc
    const palette = shiftPalette(STAGE_PALETTES[stage], identity.hueShift);
    const waterPaletteLen = Math.max(2, Math.floor(palette.length * 0.35));
    const landPalette = palette.slice(waterPaletteLen);
    const waterPalette = palette.slice(0, waterPaletteLen);

    const elev = makeFBM2D(world.seed ^ 0x1a1, 5);
    const biome = makeFBM2D(world.seed ^ 0x4b7, 4);
    const detail = makeFBM2D(world.seed ^ 0x9c2, 3);
    const dabs = makeFBM2D(world.seed ^ 0xde8, 2);

    // Light direction (upper-left)
    const lx = -0.45;
    const ly = -0.55;

    // Number of dabs — scales with stage + completions, capped for perf
    const completionBoost = Math.min(28000, world.totalCompleted * 80);
    const base = 6000 + stage * 2200;
    const dabCount = Math.floor((base + completionBoost) * identity.dabRatio);

    const rng = mulberry32(world.seed ^ 0xdab1);

    // Stratified strata sliver at the bottom edge — a quiet nod to the
    // cross-section reference. Appears only once the planet has formed.
    if (stage >= 1) {
      const bandCount = Math.min(palette.length, 6 + stage);
      for (let i = 0; i < bandCount; i++) {
        const tBand = i / (bandCount - 1);
        const yBand = cy + R * (0.62 + 0.32 * tBand);
        const sliverW = R * (0.95 - tBand * 0.55);
        const color = paletteSample(palette, 1 - tBand);
        ctx.save();
        ctx.globalAlpha = 0.18 + tBand * 0.15;
        // hand-stippled band — many tiny dabs
        const stippleN = Math.floor(sliverW * 1.3);
        for (let s = 0; s < stippleN; s++) {
          const px = cx + (rng() * 2 - 1) * sliverW;
          const py = yBand + (rng() * 2 - 1) * R * 0.022;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.ellipse(px, py, 1.2 + rng() * 1.4, 0.6 + rng() * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // Main disc — pointillist stippling
    const cosR = Math.cos(identity.rotation);
    const sinR = Math.sin(identity.rotation);

    ctx.save();
    // Soft clip with feathered edge: draw inside a circle, but allow
    // dabs to bleed at the rim for a hand-painted feel.
    for (let i = 0; i < dabCount; i++) {
      // Importance-sample inside unit disc
      const r = Math.sqrt(rng()) * 1.02;       // 1.02 lets edge dabs bleed
      const a = rng() * Math.PI * 2;
      const dx = Math.cos(a) * r;
      const dy = Math.sin(a) * r;

      // Rotate sampling for identity orientation
      const nx = dx * cosR - dy * sinR;
      const ny = dx * sinR + dy * cosR;

      // Field samples
      const e0 = (elev(nx * 1.6, ny * 1.6) + 1) * 0.5;
      const d0 = (detail(nx * 4.2 + 11, ny * 4.2 + 11) + 1) * 0.5;
      const b0 = (biome(nx * identity.biomeFreq * 2.4, ny * identity.biomeFreq * 2.4) + 1) * 0.5;

      // Height field
      let height =
        e0 * 0.65 + d0 * 0.25 * identity.ruggedness + (b0 - 0.5) * 0.1;
      // Mountain scale exaggerates peaks
      height = Math.pow(height, 1 / Math.max(0.4, identity.mountainScale));
      height = Math.max(0, Math.min(1, height));

      const isWater = stage >= 2 && height < identity.waterLevel;

      // Pick base color
      let color: string;
      if (isWater) {
        // deeper water -> later (deeper) end of water palette
        const wt = (identity.waterLevel - height) / identity.waterLevel;
        color = paletteSample(waterPalette, wt);
      } else {
        const lt = isWater
          ? 0
          : (height - (stage >= 2 ? identity.waterLevel : 0)) /
            Math.max(0.001, 1 - (stage >= 2 ? identity.waterLevel : 0));
        // biome jitter mixes a neighbouring palette swatch in
        const biomeJitter = (b0 - 0.5) * 0.35;
        color = paletteSample(landPalette, Math.max(0, Math.min(1, lt + biomeJitter)));
      }

      // Lighting — distance from light dir, plus rim darkening
      const lit = Math.max(0.35, 1 - Math.hypot(dx - lx, dy - ly) * 0.55);
      const rim = Math.pow(1 - Math.min(1, r), 0.35); // 1 center -> 0 edge
      const lightFactor = 0.55 + lit * 0.65 * (0.55 + rim * 0.45);

      // Apply lighting via hsl shift
      const [rr, gg, bb] = color.startsWith("#") ? hexToRgb(color) : (() => {
        const m = color.match(/\d+/g)!.map(Number);
        return [m[0], m[1], m[2]] as [number, number, number];
      })();
      const [hh, ss, ll] = rgbToHsl(rr, gg, bb);
      const [fr, fg, fb] = hslToRgb(hh, ss, Math.max(0.04, Math.min(0.95, ll * lightFactor)));

      // Dab geometry
      const px = cx + dx * R;
      const py = cy + dy * R;
      const dabBase = 1.1 + (stage >= 5 ? 0.5 : 0);
      const size = (dabBase + rng() * 1.8) * identity.brushSize *
        (1 + (dabs(nx * 8, ny * 8)) * 0.25);
      const angle = rng() * Math.PI;
      const oval = isWater ? 0.45 : 0.58 + rng() * 0.25;

      ctx.globalAlpha = 0.62 + rng() * 0.32;
      ctx.fillStyle = `rgb(${fr},${fg},${fb})`;
      ctx.beginPath();
      ctx.ellipse(px, py, size, size * oval, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Crisp ink rim — a thin sketched outline
    ctx.save();
    ctx.strokeStyle = "rgba(28,27,24,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    // Inner highlight crescent — paper showing through
    ctx.strokeStyle = "rgba(243,240,234,0.5)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.985, Math.PI * 1.1, Math.PI * 1.5);
    ctx.stroke();
    ctx.restore();
  }, [world, stage, identity]);

  // ---- Overlay shimmer + active markers --------------------------------
  useEffect(() => {
    const canvas = overlayRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = wrapper.clientWidth;
    let h = wrapper.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Build markers: deterministic positions on the disc
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.4;
    interface M { x: number; y: number; color: string; speed: number; size: number; phase: number; }
    const markers: M[] = [];
    const addMarkers = (count: number, max: number, color: string, speed: number, sizeBase: number) => {
      const n = Math.min(max, count);
      for (let i = 0; i < n; i++) {
        const rng = mulberry32(world.seed ^ (color.charCodeAt(1) * 131 + i * 17));
        const r = Math.sqrt(rng()) * 0.86;
        const a = rng() * Math.PI * 2;
        markers.push({
          x: cx + Math.cos(a) * r * R,
          y: cy + Math.sin(a) * r * R,
          color,
          speed,
          size: sizeBase + rng() * 1.5,
          phase: rng() * Math.PI * 2,
        });
      }
    };
    addMarkers(overdueCount, 8, ACCENT, 1.6, 4);
    addMarkers(dueSoonCount, 10, "#d4a24a", 1.0, 3.2);
    const focus = Math.max(0, activeCount - overdueCount - dueSoonCount);
    addMarkers(focus, 6, "#5a7d8f", 0.6, 2.4);

    // Shimmer dabs — paper-colored sparkles drifting across surface
    interface S { ox: number; oy: number; size: number; phase: number; speed: number; }
    const shimmer: S[] = [];
    const shimmerN = 60 + stage * 12;
    const srng = mulberry32(world.seed ^ 0x5111);
    for (let i = 0; i < shimmerN; i++) {
      const r = Math.sqrt(srng()) * 0.95;
      const a = srng() * Math.PI * 2;
      shimmer.push({
        ox: Math.cos(a) * r,
        oy: Math.sin(a) * r,
        size: 0.6 + srng() * 1.4,
        phase: srng() * Math.PI * 2,
        speed: 0.3 + srng() * 0.6,
      });
    }

    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      ctx.clearRect(0, 0, w, h);

      // shimmer
      for (const s of shimmer) {
        const a = Math.max(0, Math.sin(t * s.speed + s.phase));
        if (a < 0.05) continue;
        ctx.globalAlpha = a * 0.35;
        ctx.fillStyle = PAPER;
        ctx.beginPath();
        ctx.ellipse(cx + s.ox * R, cy + s.oy * R, s.size, s.size * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // markers — soft halo + bright core, pulsing
      for (const m of markers) {
        const pulse = 0.5 + 0.5 * Math.sin(t * m.speed + m.phase);
        // halo
        const haloR = m.size * (3 + pulse * 2);
        const grad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, haloR);
        grad.addColorStop(0, m.color);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.globalAlpha = 0.35 + pulse * 0.25;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(m.x, m.y, haloR, 0, Math.PI * 2);
        ctx.fill();
        // core
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size * (0.85 + pulse * 0.25), 0, Math.PI * 2);
        ctx.fill();
        // tiny ink center
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [world, overdueCount, dueSoonCount, activeCount, stage]);

  return (
    <div ref={wrapperRef} className="absolute inset-0">
      <canvas ref={baseRef} className="absolute inset-0" />
      <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" />
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
  return (
    <PlanetCanvas
      world={world}
      overdueCount={overdueCount}
      dueSoonCount={dueSoonCount}
      activeCount={activeCount}
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
