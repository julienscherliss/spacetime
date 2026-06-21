import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { LandscapeData } from "@/utils/planetWorld3D";

const PAPER = "#f3f0ea";
const INK = "#1c1b18";
const ACCENT = "#c4663b";
const SOFT = "#8a847a";

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
// Cell — a single nucleus in the organism. One per "chunk" of effort.
// ------------------------------------------------------------------
interface Cell {
  pos: THREE.Vector3;
  radius: number;
  age: number;      // 0 = oldest, 1 = newest
  hours: number;    // hours of effort represented
  isAccent: boolean;
  phase: number;    // breathing phase offset
}

function buildOrganism(land: LandscapeData): Cell[] {
  const rng = mulberry32(land.seed || 1);
  const cells: Cell[] = [];

  // Number of cells: every ~3 completions = 1 cell, capped at 80.
  // Empty tags still get 1 small seed cell.
  const n = Math.max(1, Math.min(80, Math.ceil(land.totalCompleted / 3)));

  // First cell at origin
  cells.push({
    pos: new THREE.Vector3(0, 0, 0),
    radius: 0.9,
    age: 0,
    hours: 0,
    isAccent: false,
    phase: rng() * Math.PI * 2,
  });

  // Sample hours per cell from the hours-histogram so denser-effort bins
  // produce larger nuclei.
  const hist = land.hoursHistogram;
  const hoursTotal = Math.max(1, land.totalMinutes / 60);

  for (let i = 1; i < n; i++) {
    // pick a parent — biased toward recent cells so growth happens at the
    // tips, not the core
    const parentBias = Math.pow(rng(), 0.4);
    const parentIdx = Math.min(cells.length - 1, Math.floor(parentBias * cells.length));
    const parent = cells[parentIdx];

    // sample bin to set hours / radius
    const ageT = i / Math.max(1, n - 1);
    const binIdx = Math.floor(ageT * (hist.length - 1));
    const binWeight = hist[binIdx] ?? 0.3;
    const hours = (hoursTotal / n) * (0.5 + binWeight * 1.8);
    const radius = 0.55 + Math.min(1.2, Math.log(1 + hours) * 0.45);

    // place adjacent to parent, on a random direction, distance = sum of radii
    let dir: THREE.Vector3;
    let pos: THREE.Vector3;
    let tries = 0;
    do {
      dir = new THREE.Vector3(
        rng() * 2 - 1,
        (rng() * 2 - 1) * 0.6,    // flatter on Y for a more horizontal sprawl
        rng() * 2 - 1
      ).normalize();
      const dist = parent.radius + radius * 0.78;
      pos = parent.pos.clone().add(dir.multiplyScalar(dist));
      tries++;
      // avoid overlap with non-parent cells
      let ok = true;
      for (const c of cells) {
        if (c === parent) continue;
        if (c.pos.distanceTo(pos) < (c.radius + radius) * 0.75) {
          ok = false;
          break;
        }
      }
      if (ok || tries > 8) break;
    } while (true);

    cells.push({
      pos,
      radius,
      age: ageT,
      hours,
      isAccent: false,
      phase: rng() * Math.PI * 2,
    });
  }

  // Mark the newest few cells as accent (recent activity)
  const accentCount = Math.min(
    cells.length,
    Math.max(0, Math.min(8, Math.ceil(land.totalCompleted / 20)))
  );
  for (let i = cells.length - accentCount; i < cells.length; i++) {
    cells[i].isAccent = true;
  }

  // Recenter cluster on origin
  const centroid = new THREE.Vector3();
  cells.forEach((c) => centroid.add(c.pos));
  centroid.divideScalar(cells.length);
  cells.forEach((c) => c.pos.sub(centroid));

  return cells;
}

// ------------------------------------------------------------------
// Latitude rings geometry — concentric horizontal rings around a sphere,
// gives the topographic / contour-map look from the reference.
// ------------------------------------------------------------------
function makeRingsGeometry(rings = 14, segments = 64) {
  const positions: number[] = [];
  for (let i = 1; i < rings; i++) {
    const phi = (i / rings) * Math.PI; // 0..PI
    const y = Math.cos(phi);
    const r = Math.sin(phi);
    for (let s = 0; s < segments; s++) {
      const a0 = (s / segments) * Math.PI * 2;
      const a1 = ((s + 1) / segments) * Math.PI * 2;
      positions.push(Math.cos(a0) * r, y, Math.sin(a0) * r);
      positions.push(Math.cos(a1) * r, y, Math.sin(a1) * r);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return g;
}

// ------------------------------------------------------------------
// One cell — rings + a faint inner fill orb
// ------------------------------------------------------------------
function CellMesh({
  cell,
  ringsGeom,
}: {
  cell: Cell;
  ringsGeom: THREE.BufferGeometry;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const lineColor = cell.isAccent ? ACCENT : INK;

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    // gentle breathing — recent cells breathe more
    const amp = cell.isAccent ? 0.06 : 0.025;
    const s = 1 + Math.sin(t * 0.6 + cell.phase) * amp;
    groupRef.current.scale.setScalar(s);
    // soft drift — each cell wobbles slightly around its position
    groupRef.current.rotation.y = t * 0.05 + cell.phase;
    groupRef.current.rotation.x = Math.sin(t * 0.2 + cell.phase) * 0.05;
  });

  return (
    <group ref={groupRef} position={cell.pos.toArray()}>
      {/* faint inner shell to give it body */}
      <mesh>
        <sphereGeometry args={[cell.radius * 0.985, 24, 18]} />
        <meshBasicMaterial
          color={PAPER}
          transparent
          opacity={cell.isAccent ? 0.55 : 0.7}
        />
      </mesh>
      {/* contour rings */}
      <lineSegments geometry={ringsGeom} scale={cell.radius}>
        <lineBasicMaterial
          color={lineColor}
          transparent
          opacity={cell.isAccent ? 0.85 : 0.55}
        />
      </lineSegments>
    </group>
  );
}

// ------------------------------------------------------------------
// Connective filaments — thin lines between neighbour cells to show
// the organism is one body, not a pile of beads.
// ------------------------------------------------------------------
function Filaments({ cells }: { cells: Cell[] }) {
  const geom = useMemo(() => {
    const pts: number[] = [];
    // connect each cell to its 2 nearest neighbours, no duplicates
    const seen = new Set<string>();
    cells.forEach((a, i) => {
      const sorted = cells
        .map((b, j) => ({ d: a.pos.distanceTo(b.pos), j }))
        .filter((x) => x.j !== i)
        .sort((x, y) => x.d - y.d)
        .slice(0, 2);
      for (const { j } of sorted) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const b = cells[j];
        pts.push(a.pos.x, a.pos.y, a.pos.z, b.pos.x, b.pos.y, b.pos.z);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [cells]);
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial color={INK} transparent opacity={0.12} />
    </lineSegments>
  );
}

// ------------------------------------------------------------------
// Slowly rotating cluster
// ------------------------------------------------------------------
function Organism({ land }: { land: LandscapeData }) {
  const cells = useMemo(() => buildOrganism(land), [land]);
  const ringsGeom = useMemo(() => makeRingsGeometry(14, 64), []);
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = clock.getElapsedTime() * 0.035;
  });

  // Fit camera-friendly bounds: scale whole organism so the cluster spans ~10u
  const fitScale = useMemo(() => {
    let maxR = 0;
    for (const c of cells) {
      maxR = Math.max(maxR, c.pos.length() + c.radius);
    }
    if (maxR < 0.001) return 1;
    return 5 / maxR;
  }, [cells]);

  return (
    <group ref={groupRef} scale={fitScale}>
      <Filaments cells={cells} />
      {cells.map((c, i) => (
        <CellMesh key={i} cell={c} ringsGeom={ringsGeom} />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------
// Camera intro — gentle dolly-in
// ------------------------------------------------------------------
function CameraIntro() {
  const { camera } = useThree();
  const start = useRef(performance.now());
  useFrame(() => {
    const t = Math.min(1, (performance.now() - start.current) / 1600);
    const e = 1 - Math.pow(1 - t, 3);
    const r = 22 - e * 8;
    camera.position.set(r * 0.5, r * 0.35, r * 0.85);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

// ------------------------------------------------------------------
// Scene
// ------------------------------------------------------------------
function Scene({ land }: { land: LandscapeData }) {
  return (
    <>
      <color attach="background" args={[PAPER]} />
      <fog attach="fog" args={[PAPER, 22, 50]} />
      <ambientLight intensity={1} />

      <Organism land={land} />

      <CameraIntro />
      <OrbitControls
        enablePan={false}
        minDistance={8}
        maxDistance={28}
        enableDamping
        dampingFactor={0.08}
        target={[0, 0, 0]}
      />
    </>
  );
}

export function World3D({ world }: { world: LandscapeData }) {
  return (
    <Canvas camera={{ position: [12, 8, 14], fov: 35 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <Scene land={world} />
    </Canvas>
  );
}
