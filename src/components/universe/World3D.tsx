import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  GRID_SIZE,
  TILE,
  type WorldData,
  type WorldObject,
} from "@/utils/planetWorld3D";

const INK = "#1f1f1f";
const PAPER = "#f5f5f3";
const ACCENT = "#dc6b3a";
const AMBER = "#e9b949";

// Convert grid coords → world space, centered on origin
function gridToWorld(col: number, row: number) {
  const half = (GRID_SIZE - 1) / 2;
  return { x: (col - half) * TILE, z: (row - half) * TILE };
}

function TerrainTile({
  col,
  row,
  height,
}: {
  col: number;
  row: number;
  height: number;
}) {
  const { x, z } = gridToWorld(col, row);
  const h = Math.max(0.04, height * 1.4);
  // grayscale → higher week = darker top, like a contour map
  const shade = 0.95 - height * 0.4;
  const color = new THREE.Color(shade, shade, shade);
  return (
    <mesh position={[x, h / 2, z]} castShadow receiveShadow>
      <boxGeometry args={[TILE * 0.96, h, TILE * 0.96]} />
      <meshStandardMaterial color={color} roughness={0.95} metalness={0} />
    </mesh>
  );
}

function TileEdges({ heightMap }: { heightMap: number[] }) {
  // Single instanced wireframe overlay for subtle topo-line feel
  const segs = useMemo(() => {
    const lines: [THREE.Vector3, THREE.Vector3][] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const i = r * GRID_SIZE + c;
        const h = Math.max(0.04, heightMap[i] * 1.4);
        const { x, z } = gridToWorld(c, r);
        const s = TILE * 0.48;
        const y = h + 0.001;
        const corners = [
          new THREE.Vector3(x - s, y, z - s),
          new THREE.Vector3(x + s, y, z - s),
          new THREE.Vector3(x + s, y, z + s),
          new THREE.Vector3(x - s, y, z + s),
        ];
        for (let k = 0; k < 4; k++) {
          lines.push([corners[k], corners[(k + 1) % 4]]);
        }
      }
    }
    return lines;
  }, [heightMap]);

  return (
    <group>
      {segs.map(([a, b], i) => (
        <Line
          key={i}
          points={[a, b]}
          color={INK}
          opacity={0.18}
          transparent
          lineWidth={0.6}
        />
      ))}
    </group>
  );
}

function Tree({
  obj,
  groundY,
  onHover,
}: {
  obj: WorldObject;
  groundY: number;
  onHover: (o: WorldObject | null) => void;
}) {
  const { x, z } = gridToWorld(obj.col, obj.row);
  const px = x + obj.jitterX;
  const pz = z + obj.jitterZ;
  const h = obj.height;
  return (
    <group
      position={[px, groundY, pz]}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(obj);
      }}
      onPointerOut={() => onHover(null)}
    >
      <mesh position={[0, 0.06, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 0.12, 5]} />
        <meshStandardMaterial color={"#3a2f28"} roughness={1} />
      </mesh>
      <mesh position={[0, 0.12 + h / 2, 0]} castShadow>
        <coneGeometry args={[0.18 * obj.scale, h, 6]} />
        <meshStandardMaterial color={"#222"} roughness={1} />
      </mesh>
    </group>
  );
}

function Building({
  obj,
  groundY,
  onHover,
}: {
  obj: WorldObject;
  groundY: number;
  onHover: (o: WorldObject | null) => void;
}) {
  const { x, z } = gridToWorld(obj.col, obj.row);
  const px = x + obj.jitterX;
  const pz = z + obj.jitterZ;
  const w = 0.32 * obj.scale;
  const d = 0.32 * obj.scale;
  const h = obj.height;
  return (
    <group
      position={[px, groundY, pz]}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(obj);
      }}
      onPointerOut={() => onHover(null)}
    >
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={"#c8c5c0"} roughness={0.85} />
      </mesh>
      {/* roof cap, darker */}
      <mesh position={[0, h + 0.02, 0]} castShadow>
        <boxGeometry args={[w * 1.05, 0.04, d * 1.05]} />
        <meshStandardMaterial color={"#2c2c2c"} roughness={1} />
      </mesh>
    </group>
  );
}

function Obelisk({
  obj,
  groundY,
  onHover,
}: {
  obj: WorldObject;
  groundY: number;
  onHover: (o: WorldObject | null) => void;
}) {
  const { x, z } = gridToWorld(obj.col, obj.row);
  const h = obj.height;
  return (
    <group
      position={[x, groundY, z]}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(obj);
      }}
      onPointerOut={() => onHover(null)}
    >
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.1, h, 4]} />
        <meshStandardMaterial color={INK} roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh position={[0, h + 0.06, 0]}>
        <octahedronGeometry args={[0.08, 0]} />
        <meshStandardMaterial color={INK} />
      </mesh>
    </group>
  );
}

function Marker({
  obj,
  groundY,
  onHover,
}: {
  obj: WorldObject;
  groundY: number;
  onHover: (o: WorldObject | null) => void;
}) {
  const { x, z } = gridToWorld(obj.col, obj.row);
  const px = x + obj.jitterX;
  const pz = z + obj.jitterZ;
  return (
    <group
      position={[px, groundY, pz]}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(obj);
      }}
      onPointerOut={() => onHover(null)}
    >
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.6, 6]} />
        <meshStandardMaterial color={INK} />
      </mesh>
      <mesh position={[0.08, 0.5, 0]}>
        <boxGeometry args={[0.18, 0.1, 0.005]} />
        <meshStandardMaterial color={ACCENT} />
      </mesh>
    </group>
  );
}

function Beacon({
  obj,
  groundY,
  onHover,
}: {
  obj: WorldObject;
  groundY: number;
  onHover: (o: WorldObject | null) => void;
}) {
  const { x, z } = gridToWorld(obj.col, obj.row);
  const px = x + obj.jitterX;
  const pz = z + obj.jitterZ;
  const color = obj.kind === "beacon-red" ? ACCENT : AMBER;
  const h = obj.height;
  const lightRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (lightRef.current) {
      const t = state.clock.getElapsedTime();
      const s = 0.85 + Math.sin(t * (obj.kind === "beacon-red" ? 4 : 2.6)) * 0.25;
      lightRef.current.scale.setScalar(s);
    }
  });
  return (
    <group
      position={[px, groundY, pz]}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(obj);
      }}
      onPointerOut={() => onHover(null)}
    >
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.015, 0.025, h, 6]} />
        <meshStandardMaterial color={INK} />
      </mesh>
      <mesh ref={lightRef} position={[0, h + 0.05, 0]}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.2}
        />
      </mesh>
    </group>
  );
}

function StreakPath({
  path,
  heightMap,
}: {
  path: { col: number; row: number }[];
  heightMap: number[];
}) {
  if (path.length < 2) return null;
  const points = path.map((p) => {
    const { x, z } = gridToWorld(p.col, p.row);
    const i = p.row * GRID_SIZE + p.col;
    const h = Math.max(0.04, (heightMap[i] || 0) * 1.4) + 0.02;
    return new THREE.Vector3(x, h, z);
  });
  return <Line points={points} color={ACCENT} lineWidth={1.4} opacity={0.85} transparent />;
}

function HoverLabel({ obj }: { obj: WorldObject }) {
  const { x, z } = gridToWorld(obj.col, obj.row);
  let text = "";
  if (obj.task) {
    text = obj.task.title;
  } else if (obj.label) {
    text = obj.label;
  } else {
    text = obj.kind;
  }
  return (
    <Html
      position={[x + obj.jitterX, obj.height + 0.3, z + obj.jitterZ]}
      center
      style={{ pointerEvents: "none" }}
    >
      <div
        style={{
          background: PAPER,
          color: INK,
          border: `1px solid ${INK}`,
          padding: "4px 8px",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
          letterSpacing: 1,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    </Html>
  );
}

function Scene({ world }: { world: WorldData }) {
  const [hover, setHover] = useState<WorldObject | null>(null);

  // Ground plane to anchor empty world
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight
        position={[8, 12, 5]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-6, 4, -3]} intensity={0.3} />

      {/* Base plate */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        receiveShadow
      >
        <planeGeometry args={[GRID_SIZE * TILE * 1.3, GRID_SIZE * TILE * 1.3]} />
        <meshStandardMaterial color={PAPER} />
      </mesh>

      {/* Terrain tiles */}
      {world.cells.map((c, i) => (
        <TerrainTile
          key={c.index}
          col={c.col}
          row={c.row}
          height={world.heightMap[i]}
        />
      ))}

      <TileEdges heightMap={world.heightMap} />

      {/* Streak path overlay */}
      <StreakPath path={world.streakPath} heightMap={world.heightMap} />

      {/* Objects */}
      {world.objects.map((o) => {
        const i = o.row * GRID_SIZE + o.col;
        const groundY = Math.max(0.04, world.heightMap[i] * 1.4);
        switch (o.kind) {
          case "tree":
            return <Tree key={o.id} obj={o} groundY={groundY} onHover={setHover} />;
          case "building":
            return <Building key={o.id} obj={o} groundY={groundY} onHover={setHover} />;
          case "obelisk":
            return <Obelisk key={o.id} obj={o} groundY={groundY} onHover={setHover} />;
          case "marker":
            return <Marker key={o.id} obj={o} groundY={groundY} onHover={setHover} />;
          case "beacon-red":
          case "beacon-amber":
            return <Beacon key={o.id} obj={o} groundY={groundY} onHover={setHover} />;
          default:
            return null;
        }
      })}

      {hover && <HoverLabel obj={hover} />}

      <OrbitControls
        enablePan={false}
        minDistance={8}
        maxDistance={28}
        maxPolarAngle={Math.PI / 2.15}
        minPolarAngle={Math.PI / 6}
        target={[0, 0.5, 0]}
      />
    </>
  );
}

export function World3D({ world }: { world: WorldData }) {
  return (
    <Canvas
      shadows
      camera={{ position: [12, 11, 14], fov: 35 }}
      style={{ background: PAPER }}
      dpr={[1, 2]}
    >
      <Scene world={world} />
    </Canvas>
  );
}