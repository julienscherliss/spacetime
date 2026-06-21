import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  WORLD_RADIUS,
  PEAK_HEIGHT,
  makeTerrainCtx,
  terrainHeight,
  type LandscapeData,
  type TerrainCtx,
} from "@/utils/planetWorld3D";

const PAPER = "#f3f0ea";
const PAPER_DARK = "#dcd6cc";
const INK = "#1c1b18";
const STONE = "#9a958b";
const ACCENT = "#c4663b";
const WATER = "#b6bcc4";

const TERRAIN_SIZE = WORLD_RADIUS * 2.2;
const TERRAIN_SEGMENTS = 200;

// ---------- Terrain mesh with vertex displacement + vertex colours ----------

function Terrain({ ctx }: { ctx: TerrainCtx }) {
  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(
      TERRAIN_SIZE,
      TERRAIN_SIZE,
      TERRAIN_SEGMENTS,
      TERRAIN_SEGMENTS
    );
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colorArr = new Float32Array(pos.count * 3);
    const tmp = new THREE.Color();
    const lowColor = new THREE.Color("#cfc8bb");
    const midColor = new THREE.Color("#efe9dd");
    const highColor = new THREE.Color("#fbf7ee");
    const waterColor = new THREE.Color(WATER);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrainHeight(x, z, ctx);
      pos.setY(i, h);
      // vertex colour: contour-style gradient
      let n = Math.min(1, h / (PEAK_HEIGHT * 0.9));
      if (h <= 0.001) {
        const dist = Math.sqrt(x * x + z * z) / WORLD_RADIUS;
        // river / sea
        if (dist < 1) tmp.copy(waterColor);
        else tmp.copy(lowColor);
      } else if (n < 0.5) {
        tmp.copy(lowColor).lerp(midColor, n / 0.5);
      } else {
        tmp.copy(midColor).lerp(highColor, (n - 0.5) / 0.5);
      }
      colorArr[i * 3] = tmp.r;
      colorArr[i * 3 + 1] = tmp.g;
      colorArr[i * 3 + 2] = tmp.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colorArr, 3));
    g.computeVertexNormals();
    return g;
  }, [ctx]);

  return (
    <mesh geometry={geom} receiveShadow castShadow>
      <meshStandardMaterial
        vertexColors
        roughness={0.95}
        metalness={0}
        flatShading={false}
      />
    </mesh>
  );
}

// ---------- Contour lines: thin rings at fixed elevations ----------

function ContourLines({ ctx }: { ctx: TerrainCtx }) {
  const lines = useMemo(() => {
    const levels = [0.25, 0.6, 1.0, 1.4, 1.8].filter((l) => l < PEAK_HEIGHT);
    const segs = 220;
    const groups: THREE.BufferGeometry[] = [];
    for (const level of levels) {
      const points: number[] = [];
      // March a grid and emit short segments where neighbours cross the level.
      const N = 120;
      const step = TERRAIN_SIZE / N;
      const start = -TERRAIN_SIZE / 2;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const x = start + i * step;
          const z = start + j * step;
          const h00 = terrainHeight(x, z, ctx);
          const h10 = terrainHeight(x + step, z, ctx);
          const h01 = terrainHeight(x, z + step, ctx);
          if ((h00 - level) * (h10 - level) < 0) {
            const t = (level - h00) / (h10 - h00);
            const px = x + t * step;
            points.push(px, level + 0.005, z, px, level + 0.005, z + 0.0001);
          }
          if ((h00 - level) * (h01 - level) < 0) {
            const t = (level - h00) / (h01 - h00);
            const pz = z + t * step;
            points.push(x, level + 0.005, pz, x + 0.0001, level + 0.005, pz);
          }
        }
      }
      if (points.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
        groups.push(g);
      }
    }
    return groups;
  }, [ctx]);

  return (
    <group>
      {lines.map((g, i) => (
        <lineSegments key={i} geometry={g}>
          <lineBasicMaterial color={INK} transparent opacity={0.12} />
        </lineSegments>
      ))}
    </group>
  );
}

// ---------- Water plane (slightly below sea level) ----------

function Water() {
  return (
    <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[WORLD_RADIUS * 1.02, 96]} />
      <meshStandardMaterial
        color={WATER}
        roughness={0.35}
        metalness={0.1}
        transparent
        opacity={0.85}
      />
    </mesh>
  );
}

// ---------- Instanced forests ----------

function Forests({
  points,
  ctx,
}: {
  points: { x: number; z: number; scale: number; variant: number }[];
  ctx: TerrainCtx;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    points.forEach((p, i) => {
      const y = terrainHeight(p.x, p.z, ctx);
      dummy.position.set(p.x, y, p.z);
      const s = 0.22 + p.scale * 0.18;
      dummy.scale.set(s, s + p.variant * 0.05, s);
      dummy.rotation.y = (p.x + p.z) * 1.3;
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [points, ctx]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, points.length]}
      castShadow
      receiveShadow
    >
      <coneGeometry args={[0.9, 2.4, 7]} />
      <meshStandardMaterial color="#2c2a26" roughness={1} />
    </instancedMesh>
  );
}

// ---------- Settlements ----------

function Settlement({
  site,
  ctx,
}: {
  site: { x: number; z: number; buildings: number; hours: number };
  ctx: TerrainCtx;
}) {
  const ground = terrainHeight(site.x, site.z, ctx);
  const buildings = useMemo(() => {
    const arr: { dx: number; dz: number; w: number; h: number; d: number; r: number }[] =
      [];
    const n = site.buildings;
    const seed = Math.floor(site.x * 73856093) ^ Math.floor(site.z * 19349663);
    let s = seed >>> 0;
    const rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.6;
      const r = 0.2 + rng() * 0.5;
      arr.push({
        dx: Math.cos(a) * r,
        dz: Math.sin(a) * r,
        w: 0.28 + rng() * 0.2,
        h: 0.45 + rng() * 0.7 + Math.log(1 + site.hours / 60) * 0.15,
        d: 0.28 + rng() * 0.2,
        r: rng() * Math.PI,
      });
    }
    return arr;
  }, [site]);
  return (
    <group position={[site.x, ground, site.z]}>
      {buildings.map((b, i) => (
        <group key={i} position={[b.dx, 0, b.dz]} rotation={[0, b.r, 0]}>
          <mesh position={[0, b.h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[b.w, b.h, b.d]} />
            <meshStandardMaterial color="#d2cabb" roughness={0.85} />
          </mesh>
          {/* gable roof */}
          <mesh position={[0, b.h + 0.08, 0]} castShadow>
            <coneGeometry args={[b.w * 0.78, 0.22, 4]} />
            <meshStandardMaterial color={INK} roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------- Landmarks (milestones) ----------

function Landmark({
  site,
  ctx,
}: {
  site: { x: number; z: number; threshold: number; label: string };
  ctx: TerrainCtx;
}) {
  const ground = terrainHeight(site.x, site.z, ctx);
  const h = 1.4 + Math.log10(site.threshold) * 0.7;
  return (
    <group position={[site.x, ground, site.z]}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.14, h, 4]} />
        <meshStandardMaterial color={INK} roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, h + 0.12, 0]}>
        <octahedronGeometry args={[0.12, 0]} />
        <meshStandardMaterial color={ACCENT} roughness={0.4} />
      </mesh>
      <Html
        position={[0, h + 0.35, 0]}
        center
        distanceFactor={12}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 9,
            letterSpacing: 1.5,
            color: INK,
            background: PAPER,
            padding: "2px 5px",
            border: `1px solid ${INK}`,
            whiteSpace: "nowrap",
            textTransform: "uppercase",
          }}
        >
          {site.threshold}
        </div>
      </Html>
    </group>
  );
}

// ---------- First-completion marker ----------

function FirstMarker({ x, z, ctx }: { x: number; z: number; ctx: TerrainCtx }) {
  const y = terrainHeight(x, z, ctx);
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.6, 6]} />
        <meshStandardMaterial color={INK} />
      </mesh>
      <mesh position={[0.08, 0.5, 0]}>
        <boxGeometry args={[0.16, 0.09, 0.005]} />
        <meshStandardMaterial color={ACCENT} />
      </mesh>
    </group>
  );
}

// ---------- Smooth camera intro ----------

function CameraIntro() {
  const { camera } = useThree();
  const start = useRef(performance.now());
  useFrame(() => {
    const t = Math.min(1, (performance.now() - start.current) / 1400);
    const e = 1 - Math.pow(1 - t, 3);
    const radius = 30 - e * 14;
    const y = 22 - e * 10;
    camera.position.set(radius * 0.7, y, radius * 0.85);
    camera.lookAt(0, 0.5, 0);
  });
  return null;
}

// ---------- Main Scene ----------

function Scene({ land }: { land: LandscapeData }) {
  const ctx = useMemo(() => makeTerrainCtx(land), [land]);
  const introDone = useRef(false);
  return (
    <>
      <color attach="background" args={[PAPER]} />
      <fog attach="fog" args={[PAPER, 28, 60]} />

      <ambientLight intensity={0.55} />
      <hemisphereLight args={[PAPER, "#a89e8c", 0.5]} />
      <directionalLight
        position={[10, 16, 8]}
        intensity={1.4}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.0005}
      />

      <Water />
      <Terrain ctx={ctx} />
      <ContourLines ctx={ctx} />
      <Forests points={land.forest} ctx={ctx} />
      {land.settlements.map((s, i) => (
        <Settlement key={i} site={s} ctx={ctx} />
      ))}
      {land.landmarks.map((l, i) => (
        <Landmark key={i} site={l} ctx={ctx} />
      ))}
      {land.firstT !== null && (
        <FirstMarker
          x={-WORLD_RADIUS * 0.85 + land.firstT * WORLD_RADIUS * 1.7}
          z={0}
          ctx={ctx}
        />
      )}

      {!introDone.current && <CameraIntro />}
      <OrbitControls
        enablePan={false}
        minDistance={10}
        maxDistance={32}
        maxPolarAngle={Math.PI / 2.2}
        minPolarAngle={Math.PI / 5}
        target={[0, 0.4, 0]}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}

export function World3D({ world }: { world: LandscapeData }) {
  return (
    <Canvas
      shadows
      camera={{ position: [22, 18, 24], fov: 32 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
    >
      <Scene land={world} />
    </Canvas>
  );
}