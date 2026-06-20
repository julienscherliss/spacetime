import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLibraryStore, type LibraryTask } from "@/store/libraryStore";

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
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const itemStatus = (it: LibraryTask) => {
    if (!it.dueDate) return { label: "no due date", color: "text-foreground/40" };
    const d = new Date(it.dueDate);
    if (d < today) return { label: "overdue", color: "text-[hsl(12_76%_50%)]" };
    if (d < tomorrow) return { label: "due today", color: "text-foreground" };
    return { label: d.toLocaleDateString(), color: "text-foreground/60" };
  };
  const sorted = [...planet.items].sort((a, b) => {
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return 0;
  });
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-foreground/20 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full bg-background border-l border-foreground/15 overflow-y-auto p-6 text-foreground animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] uppercase text-foreground/50">
              Planet
            </div>
            <h2
              className="text-2xl font-semibold mt-1"
              style={{ fontFamily: "Space Grotesk, sans-serif" }}
            >
              {planet.label}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-foreground/60 hover:text-foreground text-xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-6">
          <Stat label="Items" value={planet.items.length} />
          <Stat
            label="Overdue"
            value={planet.overdue}
            color={planet.overdue > 0 ? ACCENT : undefined}
          />
          <Stat
            label="Today"
            value={planet.dueToday}
            color={planet.dueToday > 0 ? INK : undefined}
          />
          <Stat label="Upcoming" value={planet.upcoming} />
        </div>

        <Link
          to={`/app?tag=${encodeURIComponent(planet.value)}`}
          className="block w-full text-center text-[11px] font-mono uppercase tracking-[0.25em] py-3 mb-6 border border-foreground/30 hover:bg-foreground hover:text-background transition-colors"
        >
          View Tasks
        </Link>

        <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-foreground/50 mb-3">
          Library Items
        </div>
        {sorted.length === 0 ? (
          <div className="text-sm text-foreground/40 font-mono">No items.</div>
        ) : (
          <ul className="space-y-2">
            {sorted.map((it) => {
              const s = itemStatus(it);
              return (
                <li
                  key={it.id}
                  className="border border-foreground/15 px-3 py-2 flex items-center justify-between gap-3"
                >
                  <span className="text-sm truncate">{it.title}</span>
                  <span
                    className={`text-[10px] font-mono uppercase tracking-wider whitespace-nowrap ${s.color}`}
                  >
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
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