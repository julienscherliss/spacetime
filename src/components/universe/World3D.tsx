// Painterly landscape vignette — a scene *from* the planet's surface,
// not the whole globe. Composition: sky, distant ridges, mid-ground
// terrain, foreground. Features accumulate with evolution stage:
// barren stone → cliffs → water → organic crust → moss → forest →
// creatures. Hand-stippled, pointillist, deterministic per tag.

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

// 1D FBM for skylines / horizon ridges
function makeFBM1D(seed: number, octaves = 4) {
  const size = 256;
  const rng = mulberry32(seed);
  const grid = new Float32Array(size);
  for (let i = 0; i < grid.length; i++) grid[i] = rng() * 2 - 1;
  const at = (xi: number) => grid[((xi % size) + size) % size];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number) => {
    const xi = Math.floor(x);
    const xf = smooth(x - xi);
    return at(xi) * (1 - xf) + at(xi + 1) * xf;
  };
  return (x: number) => {
    let total = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      total += noise(x * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return total / norm;
  };
}

// 2D FBM for terrain texture / biome blotches
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
// Stage logic
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
// Per-tag identity — every landscape is unique
// ------------------------------------------------------------------
interface Identity {
  hueShift: number;        // global hue rotation
  skyTilt: number;         // sky palette pick
  ridgeAmp: number;        // 0.4..1.0 distant-ridge height
  horizonY: number;        // 0.42..0.62 fraction of canvas height
  rockiness: number;       // 0.5..1 — chance for rock features
  paletteVariant: number;  // 0..2 — swap palette family
  windDir: number;         // -1..1 — biases creatures + clouds direction
  brushSize: number;       // 0.85..1.2
}

function buildIdentity(seed: number): Identity {
  const rng = mulberry32(seed ^ 0xc0ffee);
  return {
    hueShift: (rng() - 0.5) * 0.18,
    skyTilt: rng(),
    ridgeAmp: 0.4 + rng() * 0.6,
    horizonY: 0.42 + rng() * 0.2,
    rockiness: 0.5 + rng() * 0.5,
    paletteVariant: Math.floor(rng() * 3),
    windDir: (rng() - 0.5) * 2,
    brushSize: 0.85 + rng() * 0.35,
  };
}

// ------------------------------------------------------------------
// Stage palettes — sky + land. Each stage has 3 variants for variety.
// ------------------------------------------------------------------
interface StagePalette {
  skyHigh: string;
  skyLow: string;
  ridgeFar: string;
  ridgeMid: string;
  ground: string[];   // ground gradient: closer to viewer = deeper in array
  biome: string[];    // accent biome colors for vegetation / organic
  water?: string[];
}

const STAGE_PALETTES: StagePalette[][] = [
  // Stage 0 — Primordial
  [
    {
      skyHigh: "#c9c0b0", skyLow: "#e8e0cf",
      ridgeFar: "#5a5246", ridgeMid: "#3a3429",
      ground: ["#3a3128", "#4d4136", "#5e5142", "#766550"],
      biome: ["#5e5042"],
    },
    {
      skyHigh: "#a8a294", skyLow: "#d6cdb8",
      ridgeFar: "#4a4438", ridgeMid: "#2e281f",
      ground: ["#2e261d", "#3d3326", "#574a39", "#6e5e49"],
      biome: ["#574a39"],
    },
    {
      skyHigh: "#d4c8b0", skyLow: "#ece1c6",
      ridgeFar: "#6a5a48", ridgeMid: "#42382c",
      ground: ["#3d3024", "#564434", "#6e5942", "#8a7458"],
      biome: ["#6a5538"],
    },
  ],
  // Stage 1 — Geological formation: stratified cliffs, vivid strata
  [
    {
      skyHigh: "#5b8ab0", skyLow: "#e2bda8",
      ridgeFar: "#3a3a5e", ridgeMid: "#5c2a4a",
      ground: ["#5b2a4a", "#9c3a3a", "#c45c2e", "#e08a3a", "#f0bb6a"],
      biome: ["#9c3a3a", "#c45c2e"],
    },
    {
      skyHigh: "#a8546e", skyLow: "#f0c89a",
      ridgeFar: "#4a2e4a", ridgeMid: "#7a2e3a",
      ground: ["#2a1f3a", "#7a2e3a", "#b04a3a", "#d97a3a", "#e8b58a"],
      biome: ["#b04a3a"],
    },
    {
      skyHigh: "#6a7a9a", skyLow: "#dca890",
      ridgeFar: "#3a2e3a", ridgeMid: "#5a3a4e",
      ground: ["#3a2a32", "#6a3a3a", "#a8553a", "#c97a4a", "#dca070"],
      biome: ["#a8553a"],
    },
  ],
  // Stage 2 — Water systems
  [
    {
      skyHigh: "#7aa0b8", skyLow: "#e0c8a8",
      ridgeFar: "#3a4a5e", ridgeMid: "#2e3a4e",
      ground: ["#2e3a44", "#4a5a5e", "#6e6e58", "#9a8a6a"],
      biome: ["#6e6e58"],
      water: ["#1a2a3a", "#2d4a5e", "#4a7088", "#7a98ad"],
    },
    {
      skyHigh: "#a8b8c4", skyLow: "#f0d4a8",
      ridgeFar: "#4a4a5e", ridgeMid: "#3a3a4a",
      ground: ["#3a3328", "#5a4a3a", "#7e6a4e", "#a8956e"],
      biome: ["#7e6a4e"],
      water: ["#22364a", "#3a5a72", "#5a82a0", "#a8c0d0"],
    },
    {
      skyHigh: "#8aa0a0", skyLow: "#dcc88a",
      ridgeFar: "#2e3a3a", ridgeMid: "#1f2e2e",
      ground: ["#2a2e26", "#3d4a36", "#5a6a48", "#8a9a6a"],
      biome: ["#5a6a48"],
      water: ["#162a2e", "#284048", "#3a6e7a", "#7aa0a0"],
    },
  ],
  // Stage 3 — Organic emergence: dark microbial blotches
  [
    {
      skyHigh: "#8a8a9a", skyLow: "#cdc4a8",
      ridgeFar: "#2e3a3a", ridgeMid: "#1f2e2e",
      ground: ["#1a2620", "#2e3a30", "#4a5a3e", "#6e7a52"],
      biome: ["#3d4e3a", "#5a4a3a", "#2e4040"],
      water: ["#162028", "#283a48", "#4a6a7e"],
    },
    {
      skyHigh: "#9a8a8a", skyLow: "#d4b89a",
      ridgeFar: "#3a2e2e", ridgeMid: "#2a1f1f",
      ground: ["#2a1f1a", "#3d2e22", "#5a4a32", "#7a6a4a"],
      biome: ["#4a3a2a", "#5a4a3a", "#3a2a32"],
      water: ["#1a2226", "#324052", "#5a7286"],
    },
    {
      skyHigh: "#7a8a8a", skyLow: "#c0c8a8",
      ridgeFar: "#28342e", ridgeMid: "#1a2620",
      ground: ["#1a2218", "#2a362a", "#3d5236", "#5a704a"],
      biome: ["#2e4030", "#4a6038"],
      water: ["#152220", "#2a3e3a", "#4a6868"],
    },
  ],
  // Stage 4 — Plant colonization: moss & lichen
  [
    {
      skyHigh: "#a8b8a8", skyLow: "#e0d4a8",
      ridgeFar: "#3a4a3a", ridgeMid: "#2e3a2e",
      ground: ["#1f2e22", "#2e4226", "#4a6a3a", "#7a9258"],
      biome: ["#3a5e38", "#6a8a48", "#a8b070", "#c4ba8a"],
      water: ["#1a2a2a", "#2e4a4a", "#4a7878"],
    },
    {
      skyHigh: "#9aa8b8", skyLow: "#dccb9a",
      ridgeFar: "#2e3a32", ridgeMid: "#1f2a22",
      ground: ["#1a2418", "#2e3a26", "#4a5e36", "#7a8e58"],
      biome: ["#4a6a38", "#7a9c5a", "#a8b870"],
    },
    {
      skyHigh: "#a8b09a", skyLow: "#d8cba0",
      ridgeFar: "#3a3a2e", ridgeMid: "#2e2e22",
      ground: ["#22281e", "#36402a", "#5a6a3e", "#8a9c5a"],
      biome: ["#5a6e36", "#8aa44e", "#bcbe78"],
    },
  ],
  // Stage 5 — Ecosystem: forests, wetlands
  [
    {
      skyHigh: "#88a0b8", skyLow: "#e8c8a0",
      ridgeFar: "#26443a", ridgeMid: "#1a3028",
      ground: ["#162a22", "#234032", "#3a5e3e", "#5e8050"],
      biome: ["#1f4030", "#3a6a3e", "#6e9a52", "#d4ba6a", "#a87a4a"],
      water: ["#142028", "#284052", "#4a7088"],
    },
    {
      skyHigh: "#a8b8d4", skyLow: "#f0d2a0",
      ridgeFar: "#2e3a3a", ridgeMid: "#1f2828",
      ground: ["#1a2620", "#2a3a2a", "#42603e", "#6a8a52"],
      biome: ["#2a4a32", "#4a7a48", "#7aa45a", "#cabe72"],
      water: ["#1a2228", "#324a5e", "#5a8090"],
    },
    {
      skyHigh: "#7a90a8", skyLow: "#dcc4a0",
      ridgeFar: "#22342e", ridgeMid: "#162420",
      ground: ["#142018", "#243426", "#3a5a3a", "#5e8048"],
      biome: ["#1f4028", "#3a6a3e", "#6a9450", "#a8b06a"],
      water: ["#101a22", "#243a4a", "#4a6e84"],
    },
  ],
  // Stage 6 — Complex life: biodiversity, creatures, dappled light
  [
    {
      skyHigh: "#7a90c4", skyLow: "#f0c4a8",
      ridgeFar: "#3a4a6a", ridgeMid: "#26344a",
      ground: ["#1a2638", "#2e4a4a", "#4a6e4e", "#7a9c58", "#c0b070"],
      biome: ["#26442e", "#4a7848", "#88b058", "#dcc878", "#e89a5a", "#c45a6a", "#7a3a6a"],
      water: ["#162a4a", "#3a5a82", "#6a98c0", "#b8ccdc"],
    },
    {
      skyHigh: "#a89ac4", skyLow: "#f5d4b0",
      ridgeFar: "#3a3a5e", ridgeMid: "#2a2a4a",
      ground: ["#1a224a", "#2e3a5e", "#4a5a6e", "#7a8a72", "#c4b478"],
      biome: ["#2a4a3a", "#4a7a4a", "#8ab058", "#e0c87a", "#e89a72", "#c4567a", "#6a3a7a"],
      water: ["#1a2a52", "#3a5a8a", "#6e96c8", "#bccfdc"],
    },
    {
      skyHigh: "#6a90a8", skyLow: "#e8cca8",
      ridgeFar: "#2e4a4a", ridgeMid: "#1f3232",
      ground: ["#16282a", "#284a3a", "#4a6e4a", "#7aa058", "#c4b870"],
      biome: ["#1f4030", "#427a4a", "#8ab458", "#dcc878", "#d4805a", "#a85a78", "#5a3a6a"],
      water: ["#122436", "#345878", "#6a96b8"],
    },
  ],
];

// ------------------------------------------------------------------
// Color helpers
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
function shiftHex(hex: string, hueShift: number, lightFactor = 1): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [nr, ng, nb] = hslToRgb(
    h + hueShift,
    s,
    Math.max(0.03, Math.min(0.97, l * lightFactor))
  );
  return `rgb(${nr},${ng},${nb})`;
}

function pickStagePalette(stage: number, variant: number): StagePalette {
  return STAGE_PALETTES[stage][variant % STAGE_PALETTES[stage].length];
}

// ------------------------------------------------------------------
// Stipple helpers
// ------------------------------------------------------------------
function stippleBand(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  count: number,
  jitterY: number,
  size: [number, number],
  alpha: [number, number]
) {
  for (let i = 0; i < count; i++) {
    const t = rng();
    const px = x0 + (x1 - x0) * t;
    const py = y0 + (y1 - y0) * t + (rng() * 2 - 1) * jitterY;
    const sz = size[0] + rng() * (size[1] - size[0]);
    ctx.globalAlpha = alpha[0] + rng() * (alpha[1] - alpha[0]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(px, py, sz, sz * (0.5 + rng() * 0.4), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ------------------------------------------------------------------
// Painter
// ------------------------------------------------------------------
function paintLandscape(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  world: LandscapeData,
  stage: number,
  identity: Identity
) {
  const palette = pickStagePalette(stage, identity.paletteVariant);
  const hs = identity.hueShift;
  const sky1 = shiftHex(palette.skyHigh, hs);
  const sky2 = shiftHex(palette.skyLow, hs);
  const ridgeFar = shiftHex(palette.ridgeFar, hs);
  const ridgeMid = shiftHex(palette.ridgeMid, hs);
  const ground = palette.ground.map((c) => shiftHex(c, hs));
  const biome = palette.biome.map((c) => shiftHex(c, hs));
  const water = palette.water?.map((c) => shiftHex(c, hs));

  const horizonY = h * identity.horizonY;
  const rng = mulberry32(world.seed ^ 0xa5a5);

  // ---------- 1. Sky — vertical gradient with dabs ----------
  const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
  skyGrad.addColorStop(0, sky1);
  skyGrad.addColorStop(1, sky2);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, horizonY);
  // Subtle dab texture in sky
  const skyDabs = 1200 + stage * 100;
  for (let i = 0; i < skyDabs; i++) {
    const x = rng() * w;
    const y = rng() * horizonY;
    const t = y / horizonY;
    const c = t < 0.5 ? sky1 : sky2;
    ctx.globalAlpha = 0.04 + rng() * 0.08;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(x, y, 1.5 + rng() * 2, (1.5 + rng() * 2) * 0.6, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ---------- 2. Distant ridge silhouette ----------
  const ridge1 = makeFBM1D(world.seed ^ 0x111, 4);
  ctx.fillStyle = ridgeFar;
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  const ridgeFarH = h * 0.12 * identity.ridgeAmp;
  for (let x = 0; x <= w; x += 2) {
    const n = (ridge1(x * 0.005) + 1) * 0.5;
    const y = horizonY - n * ridgeFarH - h * 0.01;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, horizonY);
  ctx.closePath();
  ctx.fill();
  // Stipple it
  for (let i = 0; i < 600; i++) {
    const x = rng() * w;
    const n = (ridge1(x * 0.005) + 1) * 0.5;
    const ymax = horizonY - n * ridgeFarH * 0.9;
    const y = ymax + rng() * (horizonY - ymax);
    ctx.globalAlpha = 0.18 + rng() * 0.25;
    ctx.fillStyle = ridgeFar;
    ctx.beginPath();
    ctx.ellipse(x, y, 1 + rng() * 1.4, 0.6 + rng() * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ---------- 3. Mid ridge — taller, more detailed ----------
  if (stage >= 1) {
    const ridge2 = makeFBM1D(world.seed ^ 0x222, 5);
    ctx.fillStyle = ridgeMid;
    ctx.beginPath();
    ctx.moveTo(0, horizonY + h * 0.02);
    const midH = h * 0.22 * identity.ridgeAmp;
    for (let x = 0; x <= w; x += 2) {
      const n = (ridge2(x * 0.008 + 9) + 1) * 0.5;
      const y = horizonY + h * 0.03 - n * midH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, horizonY + h * 0.02);
    ctx.closePath();
    ctx.fill();
    // strata bands on the cliff face (most visible at stage 1)
    if (stage <= 2) {
      const strataAlpha = stage === 1 ? 0.5 : 0.3;
      const strataColors = ground.slice().reverse();
      for (let bi = 0; bi < strataColors.length; bi++) {
        const c = strataColors[bi];
        const tBand = bi / strataColors.length;
        for (let i = 0; i < 350; i++) {
          const x = rng() * w;
          const n = (ridge2(x * 0.008 + 9) + 1) * 0.5;
          const peakY = horizonY + h * 0.03 - n * h * 0.22 * identity.ridgeAmp;
          const baseY = horizonY + h * 0.03;
          const y = peakY + tBand * (baseY - peakY) + (rng() - 0.5) * h * 0.012;
          if (y > horizonY + h * 0.03) continue;
          ctx.globalAlpha = strataAlpha * (0.4 + rng() * 0.6);
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.ellipse(x, y, 1 + rng() * 1.3, 0.5 + rng() * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 4. Foreground terrain — heightfield from horizon to bottom ----------
  const groundElev = makeFBM2D(world.seed ^ 0x333, 5);
  const groundBiome = makeFBM2D(world.seed ^ 0x444, 4);
  // For each column, compute ground top y
  const groundTop = new Float32Array(w);
  const groundBaseY = horizonY + h * 0.04;
  const groundDepth = h - groundBaseY;
  for (let x = 0; x < w; x++) {
    const n = (groundElev(x * 0.012, 17) + 1) * 0.5;
    groundTop[x] = groundBaseY - n * h * 0.04 * identity.ridgeAmp;
  }

  // Decide water region (a lake) for stage>=2
  let waterRegion: { x0: number; x1: number; y: number } | null = null;
  if (stage >= 2 && water) {
    const wRng = mulberry32(world.seed ^ 0xb12);
    const wx0 = 0.18 + wRng() * 0.25;
    const wWidth = 0.32 + wRng() * 0.25;
    const yFrac = 0.18 + wRng() * 0.25; // depth into foreground
    waterRegion = {
      x0: wx0 * w,
      x1: (wx0 + wWidth) * w,
      y: groundBaseY + yFrac * groundDepth,
    };
  }

  // Fill foreground with dabs — color picked by depth + biome noise
  const foreDabs = Math.floor(
    (8000 + Math.min(30000, world.totalCompleted * 80) + stage * 1500) * identity.brushSize
  );
  for (let i = 0; i < foreDabs; i++) {
    const x = rng() * w;
    const top = groundTop[Math.floor(x)] || groundBaseY;
    const span = h - top;
    const py = top + rng() * span;
    // Depth t — 0 at horizon, 1 at bottom
    const depthT = (py - top) / Math.max(1, h - top);
    // Water?
    if (
      waterRegion &&
      x >= waterRegion.x0 &&
      x <= waterRegion.x1 &&
      py >= waterRegion.y &&
      water
    ) {
      const wt = (py - waterRegion.y) / Math.max(1, h - waterRegion.y);
      const wc = water[Math.min(water.length - 1, Math.floor(wt * water.length))];
      ctx.globalAlpha = 0.55 + rng() * 0.35;
      ctx.fillStyle = wc;
      // water dabs more horizontal
      ctx.beginPath();
      ctx.ellipse(x, py, 1.4 + rng() * 1.6, 0.5 + rng() * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    const groundIdx = Math.min(
      ground.length - 1,
      Math.floor(depthT * ground.length)
    );
    let color = ground[groundIdx];

    // biome blotch override (organic patches / moss / forest)
    if (stage >= 3 && biome.length > 0) {
      const bn = (groundBiome(x * 0.018, py * 0.018) + 1) * 0.5;
      const biomeThreshold = stage >= 5 ? 0.45 : stage >= 4 ? 0.55 : 0.65;
      if (bn > biomeThreshold) {
        const bi = Math.floor(bn * biome.length) % biome.length;
        color = biome[bi];
      }
    }

    const size = (1.1 + rng() * 1.6) * identity.brushSize;
    const oval = 0.55 + rng() * 0.3;
    ctx.globalAlpha = 0.62 + rng() * 0.32;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, py, size, size * oval, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ---------- 5. Rocks — small dark silhouettes scattered ----------
  if (stage >= 0) {
    const rockCount = Math.floor(
      (stage === 0 ? 4 : 2 + stage) * identity.rockiness
    );
    for (let i = 0; i < rockCount; i++) {
      const x = w * (0.08 + rng() * 0.84);
      const top = groundTop[Math.floor(x)] || groundBaseY;
      const y = top + h * (0.05 + rng() * 0.35);
      if (waterRegion && x >= waterRegion.x0 && x <= waterRegion.x1 && y >= waterRegion.y)
        continue;
      const rw = h * (0.025 + rng() * 0.06);
      const rh = rw * (0.5 + rng() * 0.4);
      // dark base
      ctx.fillStyle = shiftHex(palette.ridgeMid, hs, 0.7);
      ctx.beginPath();
      ctx.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
      ctx.fill();
      // highlight stipples
      for (let j = 0; j < 18; j++) {
        const ang = rng() * Math.PI * 2;
        const rad = rng() * rw * 0.9;
        const px = x + Math.cos(ang) * rad;
        const py = y + Math.sin(ang) * rad * (rh / rw);
        ctx.globalAlpha = 0.4 + rng() * 0.4;
        ctx.fillStyle = ground[Math.min(ground.length - 1, ground.length - 2)];
        ctx.beginPath();
        ctx.ellipse(px, py - rh * 0.3, 1 + rng() * 1.4, 0.7 + rng() * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---------- 6. Vegetation tufts (stage>=4) ----------
  if (stage >= 4) {
    const tufts = Math.floor(40 + (stage - 3) * 60 + Math.min(120, world.totalCompleted * 0.4));
    for (let i = 0; i < tufts; i++) {
      const x = w * rng();
      const top = groundTop[Math.floor(x)] || groundBaseY;
      const y = top + h * (0.02 + rng() * 0.5);
      if (waterRegion && x >= waterRegion.x0 && x <= waterRegion.x1 && y >= waterRegion.y) continue;
      const tuftColor = biome[Math.floor(rng() * biome.length)];
      const tuftSize = 4 + rng() * 8;
      for (let j = 0; j < 14; j++) {
        const dx = (rng() - 0.5) * tuftSize;
        const dy = (rng() - 0.5) * tuftSize * 0.55;
        ctx.globalAlpha = 0.5 + rng() * 0.4;
        ctx.fillStyle = tuftColor;
        ctx.beginPath();
        ctx.ellipse(x + dx, y + dy, 1.2 + rng() * 1.6, 0.7 + rng() * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 7. Trees / forest clusters (stage>=5) ----------
  if (stage >= 5) {
    const treeCount = Math.floor(
      18 + (stage - 4) * 16 + Math.min(40, world.totalCompleted * 0.15)
    );
    for (let i = 0; i < treeCount; i++) {
      const x = w * (0.04 + rng() * 0.92);
      const top = groundTop[Math.floor(x)] || groundBaseY;
      const baseY = top + h * (0.05 + rng() * 0.45);
      if (waterRegion && x >= waterRegion.x0 && x <= waterRegion.x1 && baseY >= waterRegion.y)
        continue;
      const tH = h * (0.04 + rng() * 0.06);
      const treeColor = biome[Math.floor(rng() * Math.min(3, biome.length))];
      // trunk
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = shiftHex(palette.ridgeMid, hs, 0.9);
      ctx.fillRect(x - 0.8, baseY - tH * 0.55, 1.6, tH * 0.55);
      // canopy — stippled blob
      for (let j = 0; j < 26; j++) {
        const ang = rng() * Math.PI * 2;
        const rad = rng() * tH * 0.5;
        const px = x + Math.cos(ang) * rad;
        const py = baseY - tH * 0.65 + Math.sin(ang) * rad * 0.7;
        ctx.globalAlpha = 0.55 + rng() * 0.4;
        ctx.fillStyle = treeColor;
        ctx.beginPath();
        ctx.ellipse(px, py, 1.4 + rng() * 1.4, 1 + rng() * 1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 8. Creatures (stage>=6) ----------
  if (stage >= 6) {
    // Birds — small V silhouettes in sky
    const birds = 5 + Math.floor(rng() * 6);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1;
    for (let i = 0; i < birds; i++) {
      const x = rng() * w;
      const y = horizonY * (0.15 + rng() * 0.55);
      const sw = 4 + rng() * 5;
      const dir = identity.windDir >= 0 ? 1 : -1;
      ctx.globalAlpha = 0.55 + rng() * 0.3;
      ctx.beginPath();
      ctx.moveTo(x - sw, y + sw * 0.4);
      ctx.quadraticCurveTo(x, y - sw * 0.35, x + sw * dir, y + sw * 0.4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Ground creatures — small painterly silhouettes
    const creatures = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < creatures; i++) {
      const x = w * (0.1 + rng() * 0.8);
      const top = groundTop[Math.floor(x)] || groundBaseY;
      const y = top + h * (0.1 + rng() * 0.45);
      if (waterRegion && x >= waterRegion.x0 && x <= waterRegion.x1 && y >= waterRegion.y)
        continue;
      const cw = 5 + rng() * 6;
      const ch = cw * (0.5 + rng() * 0.3);
      ctx.fillStyle = INK;
      ctx.globalAlpha = 0.78;
      // body
      ctx.beginPath();
      ctx.ellipse(x, y, cw, ch, 0, 0, Math.PI * 2);
      ctx.fill();
      // head
      ctx.beginPath();
      ctx.ellipse(x + cw * 0.85, y - ch * 0.4, cw * 0.45, ch * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // legs
      ctx.fillRect(x - cw * 0.55, y + ch * 0.5, 1.2, ch * 0.7);
      ctx.fillRect(x + cw * 0.45, y + ch * 0.5, 1.2, ch * 0.7);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 9. Water reflection sparkles ----------
  if (waterRegion && water) {
    for (let i = 0; i < 90; i++) {
      const x = waterRegion.x0 + rng() * (waterRegion.x1 - waterRegion.x0);
      const y = waterRegion.y + rng() * (h - waterRegion.y);
      ctx.globalAlpha = 0.4 + rng() * 0.4;
      ctx.fillStyle = shiftHex(palette.skyLow, hs, 1.1);
      ctx.beginPath();
      ctx.ellipse(x, y, 1.5 + rng() * 1.8, 0.4 + rng() * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 10. Vignette ----------
  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.5, w / 2, h / 2, Math.max(w, h) * 0.75);
  vignette.addColorStop(0, "rgba(28,27,24,0)");
  vignette.addColorStop(1, "rgba(28,27,24,0.32)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

// ------------------------------------------------------------------
// React component
// ------------------------------------------------------------------
function LandscapeCanvas({
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

  useEffect(() => {
    const canvas = baseRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      paintLandscape(ctx, w, h, world, stage, identity);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [world, stage, identity]);

  // Active task markers — float across the scene
  useEffect(() => {
    const canvas = overlayRef.current;
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

    interface M { x: number; y: number; color: string; speed: number; size: number; phase: number; }
    const markers: M[] = [];
    const horizonY = h * identity.horizonY;
    const addMarkers = (count: number, max: number, color: string, speed: number, sizeBase: number) => {
      const n = Math.min(max, count);
      for (let i = 0; i < n; i++) {
        const rng = mulberry32(world.seed ^ (color.charCodeAt(1) * 131 + i * 17));
        // distribute through scene — overdue tend to sky, due-soon mid, focus ground
        const yBand =
          color === ACCENT
            ? horizonY * (0.15 + rng() * 0.55)
            : color === "#d4a24a"
            ? horizonY + (h - horizonY) * (0.1 + rng() * 0.4)
            : horizonY + (h - horizonY) * (0.45 + rng() * 0.45);
        markers.push({
          x: w * (0.08 + rng() * 0.84),
          y: yBand,
          color,
          speed,
          size: sizeBase + rng() * 1.5,
          phase: rng() * Math.PI * 2,
        });
      }
    };
    addMarkers(overdueCount, 6, ACCENT, 1.6, 4);
    addMarkers(dueSoonCount, 8, "#d4a24a", 1.0, 3.2);
    const focus = Math.max(0, activeCount - overdueCount - dueSoonCount);
    addMarkers(focus, 5, "#5a7d8f", 0.6, 2.6);

    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const m of markers) {
        const pulse = 0.5 + 0.5 * Math.sin(t * m.speed + m.phase);
        const haloR = m.size * (3 + pulse * 2);
        const grad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, haloR);
        grad.addColorStop(0, m.color);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.globalAlpha = 0.32 + pulse * 0.25;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(m.x, m.y, haloR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.size * (0.85 + pulse * 0.25), 0, Math.PI * 2);
        ctx.fill();
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
  }, [world, overdueCount, dueSoonCount, activeCount, identity, stage]);

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
    <LandscapeCanvas
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
