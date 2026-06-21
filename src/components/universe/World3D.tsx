import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { LandscapeData } from "@/utils/planetWorld3D";

// Light industrial palette — natural tones stay within the project's
// monochrome-with-accent system: ink near-black, paper background, accent
// burnt orange. Biome tints are *desaturated* shifts of ink so the planet
// reads as a single material that grows richer, never as bright fantasy.
const PAPER = "#f3f0ea";
const INK = "#1c1b18";
const ACCENT = "#c4663b";

// ------------------------------------------------------------------
// Deterministic RNG + value-noise FBM (3D)
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

function make3DNoise(seed: number) {
  const size = 32;
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
  return (x: number, y: number, z: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const zf = smooth(z - zi);
    const c000 = at(xi, yi, zi);
    const c100 = at(xi + 1, yi, zi);
    const c010 = at(xi, yi + 1, zi);
    const c110 = at(xi + 1, yi + 1, zi);
    const c001 = at(xi, yi, zi + 1);
    const c101 = at(xi + 1, yi, zi + 1);
    const c011 = at(xi, yi + 1, zi + 1);
    const c111 = at(xi + 1, yi + 1, zi + 1);
    const a = c000 * (1 - xf) + c100 * xf;
    const b = c010 * (1 - xf) + c110 * xf;
    const c = c001 * (1 - xf) + c101 * xf;
    const d = c011 * (1 - xf) + c111 * xf;
    const ab = a * (1 - yf) + b * yf;
    const cd = c * (1 - yf) + d * yf;
    return ab * (1 - zf) + cd * zf;
  };
}

function makeFBM3D(seed: number, octaves = 4) {
  const n = make3DNoise(seed);
  return (x: number, y: number, z: number) => {
    let total = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      total += n(x * freq, y * freq, z * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return total / norm;
  };
}

// ------------------------------------------------------------------
// Evolution stage — derived from accumulated effort, age, consistency.
// Stages map to ecological complexity, never civilization.
// ------------------------------------------------------------------
//  0 primordial rock
//  1 geological formation (mountains, valleys)
//  2 water systems (rivers, lakes, seas)
//  3 organic emergence (microbial patches)
//  4 plant colonization (moss, lichen)
//  5 ecosystem formation (forests, wetlands)
//  6 complex life (biodiverse mosaic)
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
  // Sustained engagement can advance one stage early
  if (consistencyBonus && stage < 6 && c >= 6) stage = Math.min(6, stage + 1);
  return stage;
}

// ------------------------------------------------------------------
// Planet identity — each tag gets a deterministic ecological "fingerprint"
// drawn from its seed. Same tag always evolves into the same planet.
// ------------------------------------------------------------------
interface PlanetIdentity {
  axialTilt: number;          // -0.5..0.5 rad
  mountainScale: number;      // 0.7..1.4 — how dramatic the relief is
  ruggedness: number;         // 0.4..1.0 — high-freq detail amount
  waterLevel: number;         // 0.95..1.02 — radius threshold for water
  biomeHue: number;           // 0..1 — tag's signature tint
  biomeFreq: number;          // 0.6..1.4 — biome patch size
  craterDensity: number;      // 0..1 — how many primordial craters
  rotationSpeed: number;      // 0.01..0.05
}

function buildIdentity(seed: number): PlanetIdentity {
  const rng = mulberry32(seed ^ 0xc0ffee);
  return {
    axialTilt: (rng() - 0.5) * 0.8,
    mountainScale: 0.7 + rng() * 0.7,
    ruggedness: 0.4 + rng() * 0.6,
    waterLevel: 0.95 + rng() * 0.07,
    biomeHue: rng(),
    biomeFreq: 0.6 + rng() * 0.8,
    craterDensity: rng(),
    rotationSpeed: 0.012 + rng() * 0.035,
  };
}

// ------------------------------------------------------------------
// Biome tint — given (height, latitude, biomeNoise, stage, identity)
// return a desaturated, ink-leaning color. No saturated greens or blues.
// ------------------------------------------------------------------
const ROCK = new THREE.Color("#2a2724");        // dark rock
const STONE = new THREE.Color("#5a544c");       // mid stone
const SAND = new THREE.Color("#a89c87");        // dust / dry
const SNOW = new THREE.Color("#e8e3d8");        // polar / peak
const WATER_DEEP = new THREE.Color("#1d2a30");  // deep water (near-ink)
const WATER_SHALLOW = new THREE.Color("#3a4a52");
const MOSS = new THREE.Color("#4a5340");        // muted green
const LICHEN = new THREE.Color("#6b6d54");
const FOREST = new THREE.Color("#2f3a2c");
const WETLAND = new THREE.Color("#3d4438");
const HEATH = new THREE.Color("#5b4a3a");       // brown heath

function biomeColor(
  height: number,        // 0..1 (0=lowest land, 1=highest peak)
  isWater: boolean,
  waterDepth: number,    // 0 (shore) ..1 (deep), only if isWater
  lat: number,           // 0 (equator) ..1 (pole)
  biome: number,         // -1..1 noise
  diversity: number,     // -1..1 secondary noise
  stage: number,
  id: PlanetIdentity
): THREE.Color {
  if (isWater && stage >= 2) {
    const c = WATER_SHALLOW.clone().lerp(WATER_DEEP, Math.min(1, waterDepth));
    return c;
  }

  // Base rock gradient — present at every stage
  let c = ROCK.clone().lerp(STONE, Math.min(1, height * 1.3));
  // High peaks: dusty/dry, then polar snow at extremes
  if (height > 0.65) c = c.lerp(SAND, Math.min(1, (height - 0.65) * 2));
  const polar = Math.pow(lat, 4);
  if (polar > 0.2 || height > 0.85) {
    c = c.lerp(SNOW, Math.max(polar, Math.max(0, height - 0.85) * 3) * 0.8);
  }

  if (stage <= 1) return c; // primordial / geological — bare

  // Stage 3+: organic emergence — dark mottled patches in low/mid lands
  if (stage >= 3 && height < 0.55 && lat < 0.85) {
    const organic = Math.max(0, biome);
    c = c.lerp(WETLAND, organic * 0.35);
  }

  // Stage 4: plant colonization — moss & lichen spread
  if (stage >= 4 && lat < 0.8) {
    const plant = Math.max(0, biome * 0.6 + diversity * 0.4);
    // Lichen prefers mid heights & cool latitudes
    const lichenMix = plant * (1 - height) * 0.6;
    c = c.lerp(LICHEN, Math.min(0.5, lichenMix));
    if (height < 0.45) {
      c = c.lerp(MOSS, Math.min(0.55, plant * 0.5));
    }
  }

  // Stage 5: ecosystem formation — forests in fertile bands
  if (stage >= 5 && height < 0.5 && lat < 0.7) {
    const forest = Math.max(0, biome * 0.5 + diversity * 0.5);
    c = c.lerp(FOREST, Math.min(0.6, forest * 0.7));
    // Wetlands near water
    if (height < 0.12) c = c.lerp(WETLAND, 0.4);
  }

  // Stage 6: biodiversity — heath/grassland mosaic on slopes
  if (stage >= 6) {
    const mosaic = (biome * 0.4 + diversity * 0.6 + 1) * 0.5;
    if (height > 0.3 && height < 0.7 && lat < 0.75) {
      c = c.lerp(HEATH, mosaic * 0.35);
    }
  }

  // Identity tint — gentle hue shift per planet so each tag feels unique.
  // Stays inside HSL within ~12° of ink so it never looks fantasy.
  const tint = new THREE.Color().setHSL(
    (id.biomeHue * 0.18 + 0.05) % 1,
    0.08,
    c.getHSL({ h: 0, s: 0, l: 0 } as THREE.HSL).l
  );
  c.lerp(tint, 0.08 * Math.min(1, stage / 4));

  return c;
}

// ------------------------------------------------------------------
// Planet — icosphere displaced by FBM, vertex-colored by biome rules.
// ------------------------------------------------------------------
function PlanetMesh({
  land,
  stage,
  identity,
}: {
  land: LandscapeData;
  stage: number;
  identity: PlanetIdentity;
}) {
  const groupRef = useRef<THREE.Group>(null);

  // Subdivision level scales with stage so early planets stay simple
  // (low-poly primordial rock) and mature planets are richly detailed.
  const detail = stage <= 0 ? 4 : stage <= 1 ? 5 : stage <= 3 ? 6 : 6;

  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, detail);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const baseNoise = makeFBM3D(land.seed ^ 0x1a1, 5);
    const detailNoise = makeFBM3D(land.seed ^ 0x4b7, 3);
    const biomeNoise = makeFBM3D(land.seed ^ 0x9c2, 4);
    const diversityNoise = makeFBM3D(land.seed ^ 0xde8, 3);
    const erosion = makeFBM3D(land.seed ^ 0x2ef, 3);

    // Displacement magnitude grows with stage but never exceeds a calm range
    const reliefByStage = [0.04, 0.10, 0.13, 0.14, 0.15, 0.16, 0.17];
    const relief = reliefByStage[stage] * identity.mountainScale;

    // Water level only meaningful from stage 2 onward
    const waterR = stage >= 2 ? identity.waterLevel : -1;

    const v = new THREE.Vector3();
    const tmpColor = new THREE.Color();
    let minR = Infinity;
    let maxR = -Infinity;

    // Pre-pass: compute displaced radii so we can normalize height for color.
    const radii = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const nx = v.x;
      const ny = v.y;
      const nz = v.z;
      // Continents: low-freq noise
      const continent = baseNoise(nx * 1.1, ny * 1.1, nz * 1.1);
      // Mountains: mid-freq, ridged
      const ridge = 1 - Math.abs(detailNoise(nx * 3.2, ny * 3.2, nz * 3.2));
      // Erosion channels: high-freq carving (rivers at stage>=2)
      const carve = stage >= 2 ? Math.pow(Math.max(0, erosion(nx * 5, ny * 5, nz * 5)), 4) * 0.35 : 0;

      let h = continent * 0.6 + (ridge - 0.5) * 0.5 * identity.ruggedness;
      // Stage 0 also gets craters: subtract circular depressions from
      // sparse high-freq peaks of a secondary noise.
      if (stage === 0) {
        const crater = Math.pow(Math.max(0, detailNoise(nx * 6 + 11, ny * 6 + 11, nz * 6 + 11)), 8);
        h -= crater * 0.6 * identity.craterDensity;
      }

      const r = 1 + h * relief - carve * relief;
      radii[i] = r;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }

    // Apply displacement + coloring
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const nx = v.x;
      const ny = v.y;
      const nz = v.z;
      const r = radii[i];

      // Latitude based on Y axis (apply identity tilt after, on the group)
      const lat = Math.abs(ny); // 0 at equator, 1 at pole

      const isWater = r < waterR;
      const landR = isWater ? waterR : r;
      const heightNorm = Math.max(
        0,
        Math.min(1, (landR - (waterR > 0 ? waterR : minR)) / Math.max(0.001, maxR - (waterR > 0 ? waterR : minR)))
      );
      const waterDepth = isWater ? Math.min(1, (waterR - r) / Math.max(0.001, waterR - minR)) : 0;

      const biome = biomeNoise(nx * identity.biomeFreq * 1.6, ny * identity.biomeFreq * 1.6, nz * identity.biomeFreq * 1.6);
      const diversity = diversityNoise(nx * 2.4, ny * 2.4, nz * 2.4);

      const c = biomeColor(heightNorm, isWater, waterDepth, lat, biome, diversity, stage, identity);

      // Final radius: water sits at the water plane, land at its displaced radius.
      const finalR = isWater ? waterR : r;
      pos.setXYZ(i, nx * finalR, ny * finalR, nz * finalR);

      tmpColor.copy(c);
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [land.seed, stage, identity, detail]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = clock.getElapsedTime() * identity.rotationSpeed;
  });

  return (
    <group ref={groupRef} rotation={[identity.axialTilt, 0, identity.axialTilt * 0.3]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          vertexColors
          flatShading={stage <= 1}
          roughness={0.95}
          metalness={0.0}
        />
      </mesh>
      {/* Subtle atmospheric halo — appears only once water + life exist */}
      {stage >= 2 && (
        <mesh scale={1.04 + stage * 0.005}>
          <sphereGeometry args={[1, 48, 32]} />
          <meshBasicMaterial
            color={PAPER}
            transparent
            opacity={0.04 + stage * 0.012}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

// ------------------------------------------------------------------
// Active-task markers — temporary overlays floating above the surface.
// They don't alter the planet itself; they hover like atmospheric signals.
// ------------------------------------------------------------------
interface ActiveMarker {
  kind: "overdue" | "due-soon" | "focus";
  // deterministic surface position so the same task appears in the same spot
  seed: number;
}

function markerPosition(seed: number): THREE.Vector3 {
  const rng = mulberry32(seed);
  const u = rng();
  const v = rng();
  const theta = u * Math.PI * 2;
  const phi = Math.acos(2 * v - 1);
  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );
}

function Marker({ marker, radius }: { marker: ActiveMarker; radius: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const dir = useMemo(() => markerPosition(marker.seed), [marker.seed]);
  const pos = useMemo(() => dir.clone().multiplyScalar(radius * 1.18), [dir, radius]);
  const color =
    marker.kind === "overdue" ? ACCENT
    : marker.kind === "due-soon" ? "#d4a24a"
    : "#5a7d8f";
  const pulseSpeed = marker.kind === "overdue" ? 1.4 : marker.kind === "due-soon" ? 0.9 : 0.6;

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const s = 1 + Math.sin(t * pulseSpeed + marker.seed * 0.1) * 0.25;
    ref.current.scale.setScalar(s);
  });

  return (
    <group position={pos.toArray()}>
      <mesh ref={ref}>
        <sphereGeometry args={[0.025, 12, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* tether line down to surface */}
      <line>
        <bufferGeometry
          attach="geometry"
          onUpdate={(g) => {
            const a = dir.clone().multiplyScalar(radius * 1.0);
            const b = dir.clone().multiplyScalar(radius * 1.18);
            g.setAttribute(
              "position",
              new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z], 3)
            );
          }}
        />
        <lineBasicMaterial color={color} transparent opacity={0.6} attach="material" />
      </line>
    </group>
  );
}

// ------------------------------------------------------------------
// Camera intro — gentle dolly-in to give a sense of discovery.
// ------------------------------------------------------------------
function CameraIntro() {
  const { camera } = useThree();
  const start = useRef(performance.now());
  useFrame(() => {
    const t = Math.min(1, (performance.now() - start.current) / 1800);
    const e = 1 - Math.pow(1 - t, 3);
    const r = 5.5 - e * 2.2;
    camera.position.set(r * 0.6, r * 0.35, r * 0.85);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

// ------------------------------------------------------------------
// Scene
// ------------------------------------------------------------------
function Scene({
  land,
  overdueCount,
  dueSoonCount,
  activeCount,
}: {
  land: LandscapeData;
  overdueCount: number;
  dueSoonCount: number;
  activeCount: number;
}) {
  const identity = useMemo(() => buildIdentity(land.seed), [land.seed]);
  const stage = useMemo(() => computeStage(land), [land]);

  const markers = useMemo<ActiveMarker[]>(() => {
    const out: ActiveMarker[] = [];
    for (let i = 0; i < Math.min(8, overdueCount); i++) {
      out.push({ kind: "overdue", seed: land.seed ^ (0xa11 + i * 17) });
    }
    for (let i = 0; i < Math.min(10, dueSoonCount); i++) {
      out.push({ kind: "due-soon", seed: land.seed ^ (0xb22 + i * 23) });
    }
    const focusN = Math.max(0, activeCount - overdueCount - dueSoonCount);
    for (let i = 0; i < Math.min(6, focusN); i++) {
      out.push({ kind: "focus", seed: land.seed ^ (0xc33 + i * 29) });
    }
    return out;
  }, [land.seed, overdueCount, dueSoonCount, activeCount]);

  return (
    <>
      <color attach="background" args={[PAPER]} />
      <fog attach="fog" args={[PAPER, 8, 18]} />
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[4, 3, 5]}
        intensity={1.1}
        color={"#fff7e8"}
      />
      <directionalLight
        position={[-3, -1, -4]}
        intensity={0.25}
        color={"#aab4c2"}
      />

      <PlanetMesh land={land} stage={stage} identity={identity} />
      {markers.map((m, i) => (
        <Marker key={i} marker={m} radius={1.05} />
      ))}

      <CameraIntro />
      <OrbitControls
        enablePan={false}
        minDistance={2.2}
        maxDistance={7}
        enableDamping
        dampingFactor={0.08}
        target={[0, 0, 0]}
        autoRotate={false}
      />
    </>
  );
}

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
    <Canvas
      camera={{ position: [3, 1.8, 3.5], fov: 35 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
    >
      <Scene
        land={world}
        overdueCount={overdueCount}
        dueSoonCount={dueSoonCount}
        activeCount={activeCount}
      />
    </Canvas>
  );
}

// Exported for use by callers that want to label the planet's evolution stage.
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

