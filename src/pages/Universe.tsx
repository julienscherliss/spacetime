import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLibraryStore, type LibraryTask } from "@/store/libraryStore";
import { useTaskStore, type Task } from "@/store/taskStore";
import {
  generateWorld,
  computeInvestment,
  TIER_LABEL,
  type WorldScene,
  type InvestmentMetrics,
  type Feature,
  type Tile,
} from "@/utils/planetWorld";
import { buildLandscape, type LandscapeData } from "@/utils/planetWorld3D";
import { World3D, STAGE_LABELS, planetStage } from "@/components/universe/World3D";

type PlanetStatus = "healthy" | "due-soon" | "overdue";

interface Planet {
  value: string;
  label: string;
  items: LibraryTask[];
  overdue: number;
  dueToday: number;
  upcoming: number;
  status: PlanetStatus;
  size: number; // px radius
  orbitRadius: number;
  angle: number; // degrees
  duration: number; // orbit period seconds
}

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function computePlanets(
  categories: { value: string; label: string; archived?: boolean }[],
  items: LibraryTask[]
): Planet[] {
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const soonCutoff = new Date(today);
  soonCutoff.setDate(soonCutoff.getDate() + 3);

  // Only top-level tags become planets
  const topLevel = categories.filter(
    (c) => !c.archived && !c.value.includes("/")
  );

  const active = items.filter((i) => !i.completed && !i.deletedAt);

  const planets = topLevel.map((cat) => {
    const own = active.filter(
      (i) =>
        i.category === cat.value ||
        (i.category && i.category.startsWith(cat.value + "/"))
    );
    let overdue = 0;
    let dueToday = 0;
    let upcoming = 0;
    for (const it of own) {
      if (!it.dueDate) continue;
      const d = new Date(it.dueDate);
      if (d < today) overdue++;
      else if (d >= today && d < tomorrow) dueToday++;
      else if (d < soonCutoff) upcoming++;
    }
    const status: PlanetStatus =
      overdue > 0 ? "overdue" : dueToday + upcoming > 0 ? "due-soon" : "healthy";
    return {
      value: cat.value,
      label: cat.label,
      items: own,
      overdue,
      dueToday,
      upcoming,
      status,
      count: own.length,
    };
  });

  const counts = planets.map((p) => p.count);
  const maxCount = Math.max(1, ...counts);

  // Layout: distribute across 2 orbit rings if many planets
  const ringConfigs = [
    { r: 180, dur: 120 },
    { r: 280, dur: 180 },
    { r: 380, dur: 240 },
  ];
  // Sort largest first so big planets get inner ring (visual hierarchy)
  const sorted = [...planets].sort((a, b) => b.count - a.count);

  const perRing = Math.max(3, Math.ceil(sorted.length / ringConfigs.length));
  return sorted.map((p, idx) => {
    const ringIdx = Math.min(ringConfigs.length - 1, Math.floor(idx / perRing));
    const ring = ringConfigs[ringIdx];
    const inRing = sorted.filter(
      (_, i) => Math.min(ringConfigs.length - 1, Math.floor(i / perRing)) === ringIdx
    );
    const positionInRing = inRing.findIndex((q) => q.value === p.value);
    const angle = (360 / inRing.length) * positionInRing;
    const size = 22 + (p.count / maxCount) * 38; // 22..60 px radius
    return {
      value: p.value,
      label: p.label,
      items: p.items,
      overdue: p.overdue,
      dueToday: p.dueToday,
      upcoming: p.upcoming,
      status: p.status,
      size,
      orbitRadius: ring.r,
      angle,
      duration: ring.dur + ringIdx * 30,
    };
  });
}

const INK = "hsl(0 0% 12%)";
const PAPER = "hsl(0 0% 96%)";
const ACCENT = "hsl(12 76% 50%)";
const MUTED = "hsl(0 0% 65%)";

function statusInk(s: PlanetStatus) {
  if (s === "overdue") return ACCENT;
  return INK;
}

function statusLabel(p: Planet) {
  if (p.overdue > 0) return `${p.overdue} overdue`;
  if (p.dueToday > 0) return `${p.dueToday} due today`;
  if (p.upcoming > 0) return `${p.upcoming} upcoming`;
  return "All good";
}

function PlanetNode({
  planet,
  onClick,
}: {
  planet: Planet;
  onClick: () => void;
}) {
  const ink = statusInk(planet.status);
  const size = planet.size * 2;
  const pulse = planet.status === "overdue";
  // Fill style by status — flat, monochrome, no glow.
  // healthy = outline only; due-soon = dotted/hatched grey; overdue = solid ink.
  let fill = "transparent";
  let stroke = INK;
  let strokeWidth = 1.25;
  if (planet.status === "due-soon") {
    fill = "transparent";
    stroke = INK;
  } else if (planet.status === "overdue") {
    fill = ACCENT;
    stroke = ACCENT;
  }
  return (
    <div
      className="absolute top-1/2 left-1/2"
      style={{
        width: 0,
        height: 0,
        animation: `universe-orbit ${planet.duration}s linear infinite`,
        animationDelay: `-${(planet.angle / 360) * planet.duration}s`,
      }}
    >
      <div
        style={{
          transform: `translateX(${planet.orbitRadius}px)`,
        }}
      >
        <button
          onClick={onClick}
          className="group relative -translate-x-1/2 -translate-y-1/2 flex items-center justify-center focus:outline-none"
          style={{
            width: size,
            height: size,
            // Counter-rotate label so it doesn't spin with orbit
            animation: `universe-counter-rotate ${planet.duration}s linear infinite`,
            animationDelay: `-${(planet.angle / 360) * planet.duration}s`,
          }}
          aria-label={`${planet.label}: ${statusLabel(planet)}`}
        >
          <span className="sr-only">{planet.label}</span>
          <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            className="overflow-visible transition-transform group-hover:scale-110"
            style={{ transitionDuration: "200ms" }}
          >
            {/* faint outer ring for overdue pulse */}
            {pulse && (
              <circle
                cx="50"
                cy="50"
                r="48"
                fill="none"
                stroke={ACCENT}
                strokeWidth="0.75"
                style={{
                  transformOrigin: "50% 50%",
                  animation: "universe-ring-pulse 2.6s ease-in-out infinite",
                }}
              />
            )}
            <circle
              cx="50"
              cy="50"
              r="42"
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={
                planet.status === "due-soon" ? "2 3" : undefined
              }
            />
            {/* tiny moon dot — only present on healthy/due-soon to echo reference */}
            {planet.status !== "overdue" && (
              <circle
                cx={50 + Math.cos((planet.angle * Math.PI) / 180) * 38}
                cy={50 + Math.sin((planet.angle * Math.PI) / 180) * 38}
                r="2"
                fill={INK}
              />
            )}
          </svg>
          <div
            className="absolute left-1/2 -translate-x-1/2 text-center pointer-events-none"
            style={{ top: `calc(100% + 10px)` }}
          >
            <div
              className="text-[11px] tracking-widest uppercase whitespace-nowrap"
              style={{ color: INK, fontFamily: "'JetBrains Mono', monospace" }}
            >
              {planet.label}
            </div>
            <div
              className="text-[10px] tracking-wider whitespace-nowrap mt-0.5"
              style={{
                color: planet.status === "overdue" ? ACCENT : MUTED,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {statusLabel(planet)}
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

function OrbitRing({ radius }: { radius: number }) {
  return (
    <div
      className="absolute top-1/2 left-1/2 rounded-full pointer-events-none"
      style={{
        width: radius * 2,
        height: radius * 2,
        transform: "translate(-50%, -50%)",
        border: "1px solid hsl(0 0% 12% / 0.12)",
      }}
    />
  );
}

function GrainField() {
  // Sparse ink-dot field — the cassette-era "registration grain"
  const dots = useMemo(() => {
    const arr: { x: number; y: number; s: number; o: number }[] = [];
    for (let i = 0; i < 80; i++) {
      arr.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        s: Math.random() < 0.85 ? 1 : 1.5,
        o: Math.random() * 0.18 + 0.05,
      });
    }
    return arr;
  }, []);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {dots.map((d, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: d.s,
            height: d.s,
            background: INK,
            opacity: d.o,
          }}
        />
      ))}
    </div>
  );
}

function PlanetDetail({
  planet,
  onClose,
}: {
  planet: Planet;
  onClose: () => void;
}) {
  return <PlanetWorldView planet={planet} onClose={onClose} />;
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="border border-foreground/15 p-2 text-center">
      <div
        className="text-xl font-semibold"
        style={{ color: color || INK, fontFamily: "Space Grotesk, sans-serif" }}
      >
        {value}
      </div>
      <div className="text-[9px] font-mono uppercase tracking-widest text-foreground/50 mt-0.5">
        {label}
      </div>
    </div>
  );
}

// =====================================================================
// Planet World View — zoom into a tag's living world
// =====================================================================

function tagMatches(category: string | undefined, tag: string): boolean {
  if (!category) return false;
  return category === tag || category.startsWith(tag + "/");
}

function useTagInvestment(tagValue: string): {
  metrics: InvestmentMetrics;
  scene: WorldScene;
  tasks: {
    overdue: Task[];
    today: Task[];
    upcoming: Task[];
    recentlyCompleted: Task[];
  };
  completedAllTime: Task[];
  firstCompletedAt: string | null;
  minutesThisMonth: number;
} {
  const allTasks = useTaskStore((s) => s.tasks);
  return useMemo(() => {
    const today = startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const soonCut = new Date(today);
    soonCut.setDate(soonCut.getDate() + 7);
    const monthStart = new Date(today);
    monthStart.setDate(1);

    const inTag = allTasks.filter((t) => tagMatches(t.category, tagValue));
    const completed = inTag.filter((t) => t.completed);
    const active = inTag.filter((t) => !t.completed && !t.archivedAt);

    const completedMinutes = completed.reduce(
      (sum, t) => sum + (t.duration || 0),
      0
    );
    const minutesThisMonth = completed
      .filter(
        (t) =>
          t.archivedAt && new Date(t.archivedAt).getTime() >= monthStart.getTime()
      )
      .reduce((sum, t) => sum + (t.duration || 0), 0);

    // First completion timestamp
    const completionDates = completed
      .map((t) => t.archivedAt || t.createdAt)
      .filter(Boolean)
      .sort();
    const firstCompletedAt = completionDates[0] || null;
    const createdDates = inTag
      .map((t) => t.createdAt)
      .filter(Boolean)
      .sort();
    const firstActivity =
      completionDates[0] || createdDates[0] || new Date().toISOString();
    const ageDays = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(firstActivity).getTime()) / (1000 * 60 * 60 * 24)
      )
    );

    // Consistency: fraction of weeks since first activity that had ≥1 completion
    const weeks = Math.max(1, Math.ceil(ageDays / 7));
    const weeksWithActivity = new Set<number>();
    for (const t of completed) {
      const ts = t.archivedAt ? new Date(t.archivedAt).getTime() : 0;
      if (!ts) continue;
      const w = Math.floor(
        (ts - new Date(firstActivity).getTime()) / (1000 * 60 * 60 * 24 * 7)
      );
      weeksWithActivity.add(w);
    }
    const consistency = Math.min(1, weeksWithActivity.size / weeks);

    // Bucket active tasks
    const overdue: Task[] = [];
    const todayList: Task[] = [];
    const upcoming: Task[] = [];
    for (const t of active) {
      const due = t.dueDate ? new Date(t.dueDate) : null;
      const scheduled = t.date ? new Date(t.date) : null;
      const ref = due || scheduled;
      if (!ref) {
        upcoming.push(t);
        continue;
      }
      if (ref < today) overdue.push(t);
      else if (ref < tomorrow) todayList.push(t);
      else upcoming.push(t);
    }

    const recentlyCompleted = [...completed]
      .filter((t) => t.archivedAt)
      .sort((a, b) => (b.archivedAt || "").localeCompare(a.archivedAt || ""))
      .slice(0, 10);

    const dueSoonCount = todayList.length + upcoming.filter((t) => {
      const d = t.dueDate ? new Date(t.dueDate) : null;
      return d && d < soonCut;
    }).length;

    const metrics: InvestmentMetrics = {
      completedTasks: completed.length,
      completedMinutes,
      ageDays,
      activeTasks: active.length,
      overdueTasks: overdue.length,
      dueSoonTasks: dueSoonCount,
      consistency,
    };
    const scene = generateWorld(tagValue, metrics);

    return {
      metrics,
      scene,
      tasks: { overdue, today: todayList, upcoming, recentlyCompleted },
      completedAllTime: completed,
      firstCompletedAt,
      minutesThisMonth,
    };
  }, [allTasks, tagValue]);
}

// --- Isometric world renderer -----------------------------------------

const TW = 26; // tile width
const TH = 13; // tile height

function isoProject(col: number, row: number, size: number) {
  const offsetX = (size * TW) / 2;
  const x = (col - row) * (TW / 2) + offsetX;
  const y = (col + row) * (TH / 2);
  return { x, y };
}

function tileFill(t: Tile): string {
  if (t.water) return "hsl(0 0% 88%)";
  // grayscale based on elevation
  const lum = 92 - t.elevation * 28; // 64..92
  return `hsl(0 0% ${lum}%)`;
}
function tileStroke(t: Tile): string {
  if (t.water) return "hsl(0 0% 75%)";
  return "hsl(0 0% 35% / 0.35)";
}

function TilePolygon({ tile, size }: { tile: Tile; size: number }) {
  const lift = tile.elevation * 14; // elevation lift in px
  const { x, y } = isoProject(tile.col, tile.row, size);
  const top = { x, y: y - lift };
  const right = { x: x + TW / 2, y: y + TH / 2 - lift };
  const bottom = { x, y: y + TH - lift };
  const left = { x: x - TW / 2, y: y + TH / 2 - lift };
  const topPoints = `${top.x},${top.y} ${right.x},${right.y} ${bottom.x},${bottom.y} ${left.x},${left.y}`;

  // Side faces for elevation
  const groundY = y + TH;
  return (
    <g>
      {lift > 0.5 && !tile.water && (
        <>
          <polygon
            points={`${left.x},${left.y} ${bottom.x},${bottom.y} ${bottom.x},${groundY} ${left.x},${left.y + lift}`}
            fill="hsl(0 0% 55%)"
            stroke="hsl(0 0% 30% / 0.4)"
            strokeWidth="0.5"
          />
          <polygon
            points={`${bottom.x},${bottom.y} ${right.x},${right.y} ${right.x},${right.y + lift} ${bottom.x},${groundY}`}
            fill="hsl(0 0% 65%)"
            stroke="hsl(0 0% 30% / 0.4)"
            strokeWidth="0.5"
          />
        </>
      )}
      <polygon
        points={topPoints}
        fill={tileFill(tile)}
        stroke={tileStroke(tile)}
        strokeWidth="0.6"
      />
    </g>
  );
}

function FeatureGlyph({
  feature,
  tile,
  size,
  onClick,
}: {
  feature: Feature;
  tile: Tile;
  size: number;
  onClick?: () => void;
}) {
  const { x, y } = isoProject(feature.col, feature.row, size);
  const lift = tile.elevation * 14;
  const cx = x;
  const cy = y + TH / 2 - lift;
  const s = feature.scale;

  switch (feature.kind) {
    case "tree":
      return (
        <g transform={`translate(${cx},${cy})`}>
          <line x1="0" y1="0" x2="0" y2={-2 * s} stroke={INK} strokeWidth="0.8" />
          <polygon
            points={`0,${-12 * s} ${4 * s},${-2 * s} ${-4 * s},${-2 * s}`}
            fill="hsl(0 0% 28%)"
            stroke={INK}
            strokeWidth="0.6"
          />
        </g>
      );
    case "building": {
      const w = 7 * s;
      const h = 10 * s;
      const d = 5 * s;
      return (
        <g transform={`translate(${cx},${cy})`}>
          {/* left face */}
          <polygon
            points={`${-w},${-h} ${0},${-h - d / 2} ${0},${-d / 2} ${-w},${0}`}
            fill="hsl(0 0% 80%)"
            stroke={INK}
            strokeWidth="0.7"
          />
          {/* right face */}
          <polygon
            points={`${0},${-h - d / 2} ${w},${-h} ${w},${0} ${0},${-d / 2}`}
            fill="hsl(0 0% 70%)"
            stroke={INK}
            strokeWidth="0.7"
          />
          {/* roof */}
          <polygon
            points={`${-w},${-h} ${0},${-h - d} ${w},${-h} ${0},${-h + d / 4}`}
            fill="hsl(0 0% 92%)"
            stroke={INK}
            strokeWidth="0.7"
          />
        </g>
      );
    }
    case "landmark": {
      const h = 22 * s;
      const w = 4 * s;
      return (
        <g transform={`translate(${cx},${cy})`}>
          <polygon
            points={`${-w},0 ${w},0 ${w * 0.4},${-h} ${-w * 0.4},${-h}`}
            fill="hsl(0 0% 85%)"
            stroke={INK}
            strokeWidth="0.8"
          />
          <circle cx="0" cy={-h - 2} r={1.6 * s} fill={INK} />
        </g>
      );
    }
    case "path":
      return (
        <circle cx={cx} cy={cy} r="1.6" fill="hsl(0 0% 55%)" opacity="0.7" />
      );
    case "beacon-overdue":
    case "beacon-soon": {
      const isOverdue = feature.kind === "beacon-overdue";
      const color = isOverdue ? ACCENT : "hsl(45 90% 50%)";
      const h = 16;
      return (
        <g
          transform={`translate(${cx},${cy})`}
          style={{ cursor: onClick ? "pointer" : "default" }}
          onClick={onClick}
        >
          <line x1="0" y1="0" x2="0" y2={-h} stroke={INK} strokeWidth="0.8" />
          <circle cx="0" cy={-h - 2} r="2.6" fill={color} stroke={INK} strokeWidth="0.6">
            <animate
              attributeName="opacity"
              values="0.4;1;0.4"
              dur={isOverdue ? "1.6s" : "2.4s"}
              repeatCount="indefinite"
            />
          </circle>
          <circle
            cx="0"
            cy={-h - 2}
            r="5"
            fill="none"
            stroke={color}
            strokeWidth="0.5"
            opacity="0.4"
          >
            <animate
              attributeName="r"
              values="3;7;3"
              dur={isOverdue ? "1.6s" : "2.4s"}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.6;0;0.6"
              dur={isOverdue ? "1.6s" : "2.4s"}
              repeatCount="indefinite"
            />
          </circle>
        </g>
      );
    }
  }
}

function IsoWorld({ scene }: { scene: WorldScene }) {
  const { tiles, features, size } = scene;
  const sortedFeatures = useMemo(
    () => [...features].sort((a, b) => a.col + a.row - (b.col + b.row)),
    [features]
  );
  const tileMap = useMemo(() => {
    const m = new Map<string, Tile>();
    tiles.forEach((t) => m.set(`${t.col},${t.row}`, t));
    return m;
  }, [tiles]);

  const w = size * TW + TW;
  const h = size * TH + 60;
  const viewBox = `${-TW} ${-30} ${w} ${h}`;

  // Sort tiles back-to-front
  const sortedTiles = useMemo(
    () => [...tiles].sort((a, b) => a.col + a.row - (b.col + b.row)),
    [tiles]
  );

  return (
    <svg
      viewBox={viewBox}
      className="w-full h-full"
      style={{ maxHeight: "100%" }}
      preserveAspectRatio="xMidYMid meet"
    >
      {sortedTiles.map((t) => (
        <TilePolygon key={`t-${t.col}-${t.row}`} tile={t} size={size} />
      ))}
      {sortedFeatures.map((f, i) => {
        const tile = tileMap.get(`${f.col},${f.row}`);
        if (!tile) return null;
        return (
          <FeatureGlyph
            key={`f-${i}`}
            feature={f}
            tile={tile}
            size={size}
          />
        );
      })}
    </svg>
  );
}

// --- Dashboard panel + Planet World View ------------------------------

function formatHours(min: number): string {
  const h = min / 60;
  if (h < 1) return `${Math.round(min)}m`;
  if (h < 10) return `${h.toFixed(1)}h`;
  return `${Math.round(h)}h`;
}

function TaskRow({ task }: { task: Task }) {
  const isOverdue =
    task.dueDate &&
    new Date(task.dueDate) < startOfDay(new Date()) &&
    !task.completed;
  return (
    <li className="border border-foreground/15 px-3 py-2 flex items-center justify-between gap-3">
      <span className="text-sm truncate">{task.title}</span>
      <span
        className="text-[10px] font-mono uppercase tracking-wider whitespace-nowrap"
        style={{ color: isOverdue ? ACCENT : "hsl(0 0% 45%)" }}
      >
        {task.dueDate
          ? new Date(task.dueDate).toLocaleDateString()
          : task.date || ""}
      </span>
    </li>
  );
}

function TaskGroup({
  label,
  tasks,
  accent,
}: {
  label: string;
  tasks: Task[];
  accent?: boolean;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="mb-4">
      <div
        className="text-[10px] font-mono uppercase tracking-[0.25em] mb-2"
        style={{ color: accent ? ACCENT : "hsl(0 0% 45%)" }}
      >
        {label} · {tasks.length}
      </div>
      <ul className="space-y-1.5">
        {tasks.slice(0, 8).map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </ul>
    </div>
  );
}

function PlanetWorldView({
  planet,
  onClose,
}: {
  planet: Planet;
  onClose: () => void;
}) {
  const data = useTagInvestment(planet.value);
  const { scene, metrics, tasks, firstCompletedAt, minutesThisMonth } = data;
  const allTasks = useTaskStore((s) => s.tasks);
  const world3d: LandscapeData = useMemo(
    () => buildLandscape(planet.value, allTasks),
    [planet.value, allTasks]
  );
  const stage = planetStage(world3d);
  const stageLabel = STAGE_LABELS[stage];
  const completionPct =
    metrics.activeTasks + metrics.completedTasks === 0
      ? 0
      : Math.round(
          (metrics.completedTasks /
            (metrics.activeTasks + metrics.completedTasks)) *
            100
        );

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in"
      style={{ background: PAPER }}
    >
      <style>{`
        @keyframes universe-zoom-in {
          from { transform: scale(0.4); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* World canvas */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-5 left-5 z-10 text-[11px] font-mono uppercase tracking-[0.25em] px-3 py-2 border border-foreground/30 hover:bg-foreground hover:text-background transition-colors"
        >
          ← Universe
        </button>
        <div
          className="absolute top-5 right-5 z-10 text-right"
        >
          <div className="text-[10px] font-mono tracking-[0.3em] uppercase text-foreground/50">
            Stage {stage} · {stageLabel}
          </div>
        </div>
        <div
          className="absolute inset-0"
          style={{
            animation: "universe-zoom-in 700ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <World3D
            world={world3d}
            overdueCount={metrics.overdueTasks}
            dueSoonCount={metrics.dueSoonTasks}
            activeCount={metrics.activeTasks}
          />
        </div>

        {/* Legend */}
        <div className="absolute bottom-20 left-6 z-10 text-[10px] font-mono uppercase tracking-[0.2em] text-foreground/60 space-y-1 pointer-events-none max-w-xs">
          <div>· a living world shaped by accumulated effort</div>
          <div>· evolves through 7 ecological stages</div>
          <div>· red marker = overdue · amber = due soon</div>
          <div>· drag to orbit · scroll to zoom</div>
        </div>

        {/* Investment progress bar */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[min(560px,80%)]">
          <div className="flex justify-between text-[10px] font-mono uppercase tracking-[0.25em] text-foreground/50 mb-1.5">
            <span>Investment</span>
            <span>
              {world3d.totalCompleted} completions · {Math.round(world3d.totalMinutes / 60)}h
            </span>
          </div>
          <div className="h-1 bg-foreground/10 relative overflow-hidden">
            <div
              className="h-full bg-foreground transition-all duration-700"
              style={{ width: `${scene.investment * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Dashboard */}
      <aside
        className="w-full max-w-sm h-full overflow-y-auto p-6 border-l border-foreground/15 text-foreground bg-background animate-slide-in-right"
      >
        <div className="text-[10px] font-mono tracking-[0.3em] uppercase text-foreground/50">
          Planet
        </div>
        <h2
          className="text-2xl font-semibold mt-1 mb-4"
          style={{ fontFamily: "Space Grotesk, sans-serif" }}
        >
          {planet.label}
        </h2>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <Stat label="Completed" value={metrics.completedTasks} />
          <Stat label="Hours" value={Math.round(metrics.completedMinutes / 60)} />
          <Stat label="Active" value={metrics.activeTasks} />
        </div>
        <div className="grid grid-cols-3 gap-2 mb-6">
          <Stat
            label="Overdue"
            value={metrics.overdueTasks}
            color={metrics.overdueTasks > 0 ? ACCENT : undefined}
          />
          <Stat label="Due soon" value={metrics.dueSoonTasks} />
          <Stat label="Done %" value={completionPct} />
        </div>

        <div className="mb-6 border border-foreground/15 p-3">
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-foreground/50 mb-2">
            Historical
          </div>
          <div className="flex justify-between text-sm font-mono mb-1">
            <span className="text-foreground/60">First completed</span>
            <span>
              {firstCompletedAt
                ? new Date(firstCompletedAt).toLocaleDateString()
                : "—"}
            </span>
          </div>
          <div className="flex justify-between text-sm font-mono mb-1">
            <span className="text-foreground/60">This month</span>
            <span>{formatHours(minutesThisMonth)}</span>
          </div>
          <div className="flex justify-between text-sm font-mono mb-1">
            <span className="text-foreground/60">Lifetime</span>
            <span>{formatHours(metrics.completedMinutes)}</span>
          </div>
          <div className="flex justify-between text-sm font-mono">
            <span className="text-foreground/60">Consistency</span>
            <span>{Math.round(metrics.consistency * 100)}%</span>
          </div>
        </div>

        <Link
          to={`/app?tag=${encodeURIComponent(planet.value)}`}
          className="block w-full text-center text-[11px] font-mono uppercase tracking-[0.25em] py-3 mb-6 border border-foreground/30 hover:bg-foreground hover:text-background transition-colors"
        >
          Open in App
        </Link>

        <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-foreground/50 mb-3">
          Needs Attention
        </div>
        <TaskGroup label="Overdue" tasks={tasks.overdue} accent />
        <TaskGroup label="Due Today" tasks={tasks.today} />

        <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-foreground/50 mb-3 mt-2">
          Upcoming
        </div>
        <TaskGroup label="Scheduled" tasks={tasks.upcoming} />

        <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-foreground/50 mb-3 mt-2">
          Completed
        </div>
        <TaskGroup label="Recently" tasks={tasks.recentlyCompleted} />
      </aside>
    </div>
  );
}

export default function UniversePage() {
  const categories = useLibraryStore((s) => s.categories);
  const items = useLibraryStore((s) => s.items);
  const [selected, setSelected] = useState<Planet | null>(null);

  const planets = useMemo(
    () => computePlanets(categories, items),
    [categories, items]
  );

  const rings = useMemo(() => {
    const set = new Set(planets.map((p) => p.orbitRadius));
    return Array.from(set).sort((a, b) => a - b);
  }, [planets]);

  return (
    <>
      <style>{`
        @keyframes universe-orbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes universe-counter-rotate {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(-360deg); }
        }
        @keyframes universe-ring-pulse {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.08); }
        }
        @keyframes universe-you-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.04); }
        }
      `}</style>
      <div
        className="min-h-screen w-full overflow-hidden relative bg-background text-foreground"
      >
        <GrainField />

        {/* Header */}
        <header className="relative z-10 flex items-center justify-between px-6 py-5 border-b border-foreground/10">
          <div>
            <div className="text-[10px] font-mono tracking-[0.4em] uppercase text-foreground/50">
              Spacetime · Experimental
            </div>
            <h1
              className="text-2xl font-semibold mt-1"
              style={{ fontFamily: "Space Grotesk, sans-serif" }}
            >
              Universe
            </h1>
          </div>
          <Link
            to="/app"
            className="text-[11px] font-mono uppercase tracking-[0.25em] px-4 py-2 border border-foreground/30 hover:bg-foreground hover:text-background transition-colors"
          >
            Back to App
          </Link>
        </header>

        {/* Universe */}
        <div className="relative w-full" style={{ height: "calc(100vh - 100px)" }}>
          {planets.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center max-w-md px-6">
                <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-foreground/50 mb-3">
                  Empty Universe
                </div>
                <p className="text-foreground/70">
                  Add tags to your Library to see your universe come to life.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Orbit rings */}
              {rings.map((r) => (
                <OrbitRing key={r} radius={r} />
              ))}

              {/* Center: You */}
              <div
                className="absolute top-1/2 left-1/2 rounded-full flex items-center justify-center"
                style={{
                  width: 88,
                  height: 88,
                  background: INK,
                  border: `1px solid ${INK}`,
                  animation: "universe-you-pulse 4s ease-in-out infinite",
                }}
              >
                <span
                  className="text-[11px] uppercase tracking-[0.3em]"
                  style={{
                    color: PAPER,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  You
                </span>
              </div>

              {/* Planets */}
              {planets.map((p) => (
                <PlanetNode
                  key={p.value}
                  planet={p}
                  onClick={() => setSelected(p)}
                />
              ))}
            </>
          )}
        </div>

        {selected && (
          <PlanetDetail planet={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </>
  );
}