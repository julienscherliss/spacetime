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

function statusColor(s: PlanetStatus) {
  if (s === "overdue") return "hsl(0 75% 60%)";
  if (s === "due-soon") return "hsl(45 90% 60%)";
  return "hsl(190 70% 65%)";
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
  const color = statusColor(planet.status);
  const pulseDur =
    planet.status === "overdue" ? 2.5 : planet.status === "due-soon" ? 3.5 : 0;
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
          className="group relative -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full transition-transform hover:scale-110 focus:outline-none"
          style={{
            width: planet.size * 2,
            height: planet.size * 2,
            background: `radial-gradient(circle at 30% 30%, ${color}, hsl(230 30% 12%) 75%)`,
            boxShadow: `0 0 ${planet.size}px ${color}55, inset 0 0 ${planet.size / 2}px hsl(230 50% 5% / 0.6)`,
            // Counter-rotate label so it doesn't spin with orbit
            animation: `universe-counter-rotate ${planet.duration}s linear infinite`,
            animationDelay: `${(planet.angle / 360) * planet.duration}s`,
          }}
          aria-label={`${planet.label}: ${statusLabel(planet)}`}
        >
          <span className="sr-only">{planet.label}</span>
          {pulseDur > 0 && (
            <span
              aria-hidden
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                boxShadow: `0 0 ${planet.size * 1.4}px ${color}`,
                animation: `universe-soft-pulse ${pulseDur}s ease-in-out infinite`,
              }}
            />
          )}
          <div
            className="absolute left-1/2 -translate-x-1/2 text-center pointer-events-none"
            style={{ top: `calc(100% + 8px)` }}
          >
            <div className="text-[11px] font-mono tracking-widest uppercase text-white/90 whitespace-nowrap">
              {planet.label}
            </div>
            <div
              className="text-[10px] font-mono tracking-wider whitespace-nowrap"
              style={{ color }}
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
      className="absolute top-1/2 left-1/2 rounded-full border border-white/5 pointer-events-none"
      style={{
        width: radius * 2,
        height: radius * 2,
        transform: "translate(-50%, -50%)",
      }}
    />
  );
}

function Starfield() {
  const stars = useMemo(() => {
    const arr: { x: number; y: number; s: number; o: number; d: number }[] = [];
    for (let i = 0; i < 120; i++) {
      arr.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        s: Math.random() * 1.8 + 0.4,
        o: Math.random() * 0.6 + 0.2,
        d: Math.random() * 6 + 3,
      });
    }
    return arr;
  }, []);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {stars.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.s,
            height: s.s,
            opacity: s.o,
            animation: `universe-twinkle ${s.d}s ease-in-out infinite`,
            animationDelay: `-${Math.random() * s.d}s`,
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
    if (!it.dueDate) return { label: "no due date", color: "text-white/40" };
    const d = new Date(it.dueDate);
    if (d < today) return { label: "overdue", color: "text-[hsl(0_75%_65%)]" };
    if (d < tomorrow) return { label: "due today", color: "text-[hsl(45_90%_65%)]" };
    return { label: d.toLocaleDateString(), color: "text-white/60" };
  };
  const sorted = [...planet.items].sort((a, b) => {
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return 0;
  });
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full bg-[hsl(230_30%_8%)] border-l border-white/10 overflow-y-auto p-6 text-white animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] uppercase text-white/40">
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
            className="text-white/60 hover:text-white text-xl leading-none px-2"
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
            color={planet.overdue > 0 ? "hsl(0 75% 65%)" : undefined}
          />
          <Stat
            label="Today"
            value={planet.dueToday}
            color={planet.dueToday > 0 ? "hsl(45 90% 65%)" : undefined}
          />
          <Stat label="Upcoming" value={planet.upcoming} />
        </div>

        <Link
          to={`/app?tag=${encodeURIComponent(planet.value)}`}
          className="block w-full text-center text-[11px] font-mono uppercase tracking-[0.25em] py-3 mb-6 border border-white/20 hover:bg-white/5 transition-colors"
        >
          View Tasks
        </Link>

        <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/40 mb-3">
          Library Items
        </div>
        {sorted.length === 0 ? (
          <div className="text-sm text-white/40 font-mono">No items.</div>
        ) : (
          <ul className="space-y-2">
            {sorted.map((it) => {
              const s = itemStatus(it);
              return (
                <li
                  key={it.id}
                  className="border border-white/10 px-3 py-2 flex items-center justify-between gap-3"
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
    <div className="border border-white/10 p-2 text-center">
      <div
        className="text-xl font-semibold"
        style={{ color: color || "white", fontFamily: "Space Grotesk, sans-serif" }}
      >
        {value}
      </div>
      <div className="text-[9px] font-mono uppercase tracking-widest text-white/40 mt-0.5">
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
        @keyframes universe-twinkle {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.9; }
        }
        @keyframes universe-pulse-red {
          0%, 100% { filter: drop-shadow(0 0 4px hsl(0 75% 60% / 0.4)); }
          50% { filter: drop-shadow(0 0 14px hsl(0 75% 60% / 0.8)); }
        }
        @keyframes universe-pulse-yellow {
          0%, 100% { filter: drop-shadow(0 0 4px hsl(45 90% 60% / 0.3)); }
          50% { filter: drop-shadow(0 0 12px hsl(45 90% 60% / 0.7)); }
        }
        .universe-pulse-red { animation-name: universe-pulse-red, universe-counter-rotate !important; animation-duration: 3s, var(--orbit-dur, 120s) !important; animation-timing-function: ease-in-out, linear !important; animation-iteration-count: infinite, infinite !important; }
        .universe-pulse-yellow { animation-name: universe-pulse-yellow, universe-counter-rotate !important; animation-duration: 3.5s, var(--orbit-dur, 120s) !important; animation-timing-function: ease-in-out, linear !important; animation-iteration-count: infinite, infinite !important; }
        @keyframes universe-you-pulse {
          0%, 100% { box-shadow: 0 0 40px hsl(190 80% 60% / 0.5), inset 0 0 20px hsl(190 80% 60% / 0.4); }
          50% { box-shadow: 0 0 70px hsl(190 80% 60% / 0.8), inset 0 0 30px hsl(190 80% 60% / 0.6); }
        }
      `}</style>
      <div
        className="min-h-screen w-full overflow-hidden relative text-white"
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(230 40% 10%) 0%, hsl(230 50% 4%) 70%, hsl(230 60% 2%) 100%)",
        }}
      >
        <Starfield />

        {/* Header */}
        <header className="relative z-10 flex items-center justify-between px-6 py-5">
          <div>
            <div className="text-[10px] font-mono tracking-[0.4em] uppercase text-white/40">
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
            className="text-[11px] font-mono uppercase tracking-[0.25em] px-4 py-2 border border-white/20 hover:bg-white/5 transition-colors"
          >
            Back to App
          </Link>
        </header>

        {/* Universe */}
        <div className="relative w-full" style={{ height: "calc(100vh - 100px)" }}>
          {planets.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center max-w-md px-6">
                <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-white/40 mb-3">
                  Empty Universe
                </div>
                <p className="text-white/70">
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
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center"
                style={{
                  width: 90,
                  height: 90,
                  background:
                    "radial-gradient(circle at 35% 35%, hsl(190 90% 75%), hsl(220 70% 30%) 80%)",
                  animation: "universe-you-pulse 4s ease-in-out infinite",
                }}
              >
                <span className="text-[11px] font-mono uppercase tracking-[0.3em] text-white">
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