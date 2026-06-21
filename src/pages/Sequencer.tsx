import { useMemo, useState, useRef, useEffect } from 'react';
import { AppNav } from '@/components/AppNav';
import { useTaskStore, type Task } from '@/store/taskStore';
import { useCurrentTime, timeToMinutes } from '@/hooks/useCurrentTime';
import { TaskEditPanel } from '@/components/TaskEditPanel';
import {
  Footprints, Users, Camera, Film, Dumbbell, BookOpen, PenLine,
  Home, Plane, HeartHandshake, Phone, Sparkles, Coffee, Utensils,
  Code2, Music, Mail, ShoppingCart, Briefcase, Brush, Calendar,
  type LucideIcon,
} from 'lucide-react';

const START_HOUR = 8;
const END_HOUR = 18; // exclusive — 10 rows (8 AM → 5 PM start, ending 6 PM)
const ROWS = END_HOUR - START_HOUR; // 10
const COLS = 4; // :00 :15 :30 :45
const SLOT_MIN = 15;
const SLOTS_PER_DAY = ROWS * COLS;

/** Map a task to a Tabler-style outline icon based on title/category keywords. */
function pickIcon(task: Task): LucideIcon {
  const s = `${task.title} ${task.category ?? ''}`.toLowerCase();
  const rules: Array<[RegExp, LucideIcon]> = [
    [/walk|stroll|step/, Footprints],
    [/meet|standup|sync|1:1|call w|interview/, Users],
    [/call|phone|ring/, Phone],
    [/email|inbox|mail/, Mail],
    [/photo|camera|shoot/, Camera],
    [/film|video|edit|cinema/, Film],
    [/gym|workout|run|train|lift|yoga/, Dumbbell],
    [/read|book|study/, BookOpen],
    [/write|draft|journal|notes/, PenLine],
    [/code|dev|ship|deploy|bug/, Code2],
    [/home|clean|laundry|chore/, Home],
    [/travel|trip|flight|airport/, Plane],
    [/wedding|engage|anniversary/, HeartHandshake],
    [/coffee|tea|break/, Coffee],
    [/lunch|dinner|breakfast|eat|food/, Utensils],
    [/music|practice|guitar|piano/, Music],
    [/shop|errand|buy/, ShoppingCart],
    [/design|sketch|paint/, Brush],
    [/work|client|project|focus/, Briefcase],
    [/create|idea|brainstorm/, Sparkles],
  ];
  for (const [rx, Icon] of rules) if (rx.test(s)) return Icon;
  return Calendar;
}

interface CellAssignment {
  task: Task;
  Icon: LucideIcon;
  isStart: boolean;
  isEnd: boolean;
}

export default function Sequencer() {
  const tasks = useTaskStore((s) => s.tasks);
  const setEditingTask = useTaskStore((s) => s.setEditingTask);
  const { minutes: nowMin, dateStr } = useCurrentTime(15000);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Build a flat array indexed by slot (0..SLOTS_PER_DAY-1) → assignment.
  const cells = useMemo(() => {
    const arr: (CellAssignment | null)[] = Array(SLOTS_PER_DAY).fill(null);
    const dayStartMin = START_HOUR * 60;
    for (const t of tasks) {
      if (t.date !== dateStr) continue;
      if (t.archivedAt || t.inWaitingRoom || t.groupId) continue;
      if (!t.time) continue;
      const start = timeToMinutes(t.time);
      const dur = t.duration ?? 30;
      const end = start + dur;
      const fromSlot = Math.floor((start - dayStartMin) / SLOT_MIN);
      const toSlot = Math.ceil((end - dayStartMin) / SLOT_MIN) - 1;
      if (toSlot < 0 || fromSlot >= SLOTS_PER_DAY) continue;
      const Icon = pickIcon(t);
      const lo = Math.max(0, fromSlot);
      const hi = Math.min(SLOTS_PER_DAY - 1, toSlot);
      for (let i = lo; i <= hi; i++) {
        arr[i] = {
          task: t,
          Icon,
          isStart: i === fromSlot,
          isEnd: i === toSlot,
        };
      }
    }
    return arr;
  }, [tasks, dateStr]);

  // Playhead position (vertical line through entire grid).
  // Grid spans START_HOUR..END_HOUR. Convert nowMin → 0..1 across the grid height.
  const playheadFrac = (() => {
    const total = (END_HOUR - START_HOUR) * 60;
    return Math.max(0, Math.min(1, (nowMin - START_HOUR * 60) / total));
  })();
  const playheadVisible = nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60;

  // Refs for measuring grid height for the playhead.
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridH, setGridH] = useState(0);
  useEffect(() => {
    if (!gridRef.current) return;
    const ro = new ResizeObserver(() => {
      if (gridRef.current) setGridH(gridRef.current.offsetHeight);
    });
    ro.observe(gridRef.current);
    setGridH(gridRef.current.offsetHeight);
    return () => ro.disconnect();
  }, []);

  const fmtHour = (h: number) => {
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:00 ${period}`;
  };

  return (
    <div className="min-h-screen pb-16 sm:pb-0" style={{ background: '#f3efe7' }}>
      <AppNav />
      <TaskEditPanel />

      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Header strip — instrument panel */}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] text-stone-500 uppercase">
              Sequencer · Day
            </div>
            <div className="mt-2 text-3xl font-light tracking-tight text-stone-800" style={{ fontFamily: 'ui-serif, Georgia, serif' }}>
              {new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-[10px] font-mono tracking-widest text-stone-500 uppercase">
              {Math.floor(nowMin / 60).toString().padStart(2, '0')}:{(nowMin % 60).toString().padStart(2, '0')}
            </div>
            <span className="inline-block h-2 w-2 rounded-full bg-stone-400 animate-pulse" />
          </div>
        </div>

        {/* Column header — :00 :15 :30 :45 */}
        <div className="grid mb-3" style={{ gridTemplateColumns: '64px repeat(4, 1fr)' }}>
          <div />
          {[':00', ':15', ':30', ':45'].map((label) => (
            <div key={label} className="text-[10px] font-mono tracking-widest text-stone-400 text-center uppercase">
              {label}
            </div>
          ))}
        </div>

        {/* Grid + playhead */}
        <div className="relative">
          <div
            ref={gridRef}
            className="grid relative bg-white/60 rounded-2xl p-3"
            style={{
              gridTemplateColumns: '64px repeat(4, 1fr)',
              gridAutoRows: '64px',
              boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 20px 40px -24px rgba(60, 50, 30, 0.18)',
            }}
          >
            {Array.from({ length: ROWS }).map((_, rowIdx) => {
              const hour = START_HOUR + rowIdx;
              return (
                <RowFragment
                  key={hour}
                  hour={hour}
                  hourLabel={fmtHour(hour)}
                  cells={cells}
                  rowIdx={rowIdx}
                  nowMin={nowMin}
                  hoverIdx={hoverIdx}
                  setHoverIdx={setHoverIdx}
                  onOpen={(id) => setEditingTask(id)}
                />
              );
            })}
          </div>

          {/* Playhead */}
          {playheadVisible && gridH > 0 && (
            <Playhead frac={playheadFrac} height={gridH} />
          )}
        </div>

        {/* Footer legend */}
        <div className="mt-6 flex items-center justify-between text-[10px] font-mono tracking-widest text-stone-400 uppercase">
          <span>Past · filled · consumed</span>
          <span>Now · pulsing</span>
          <span>Future · outline</span>
        </div>
      </div>
    </div>
  );
}

function RowFragment({
  hour, hourLabel, cells, rowIdx, nowMin, hoverIdx, setHoverIdx, onOpen,
}: {
  hour: number;
  hourLabel: string;
  cells: (CellAssignment | null)[];
  rowIdx: number;
  nowMin: number;
  hoverIdx: number | null;
  setHoverIdx: (i: number | null) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-end pr-4 text-[10px] font-mono tracking-widest text-stone-400 uppercase">
        {hourLabel}
      </div>
      {Array.from({ length: COLS }).map((_, colIdx) => {
        const slotIdx = rowIdx * COLS + colIdx;
        const cell = cells[slotIdx];
        const slotStartMin = (START_HOUR + rowIdx) * 60 + colIdx * SLOT_MIN;
        const slotEndMin = slotStartMin + SLOT_MIN;
        const isPast = slotEndMin <= nowMin;
        const isCurrent = nowMin >= slotStartMin && nowMin < slotEndMin;
        return (
          <Cell
            key={colIdx}
            cell={cell}
            isPast={isPast}
            isCurrent={isCurrent}
            isHover={hoverIdx === slotIdx}
            onHoverIn={() => setHoverIdx(slotIdx)}
            onHoverOut={() => setHoverIdx(null)}
            onOpen={onOpen}
          />
        );
      })}
    </>
  );
}

function Cell({
  cell, isPast, isCurrent, isHover, onHoverIn, onHoverOut, onOpen,
}: {
  cell: CellAssignment | null;
  isPast: boolean;
  isCurrent: boolean;
  isHover: boolean;
  onHoverIn: () => void;
  onHoverOut: () => void;
  onOpen: (id: string) => void;
}) {
  const occupied = !!cell;
  const completed = cell?.task.completed;
  const filled = occupied && (isPast || completed);

  // Visual tone
  let bg = 'transparent';
  let stroke = '#d6d0c2';
  let iconColor = '#3b3528';
  let iconOpacity = 1;

  if (occupied) {
    if (completed) { bg = '#e9e3d4'; iconOpacity = 0.35; }
    else if (isPast) { bg = '#ece6d7'; iconOpacity = 0.55; }
    else if (isCurrent) { bg = '#fff8e8'; }
    else { bg = '#ffffff'; }
  } else if (isHover) {
    bg = '#faf6ec';
  }

  return (
    <button
      type="button"
      onMouseEnter={onHoverIn}
      onMouseLeave={onHoverOut}
      onClick={() => cell && onOpen(cell.task.id)}
      className="relative m-[3px] rounded-lg transition-all duration-200 flex items-center justify-center"
      style={{
        background: bg,
        border: `1px solid ${stroke}`,
        boxShadow: isCurrent && occupied
          ? '0 0 0 2px rgba(180, 140, 60, 0.18), 0 4px 14px -6px rgba(180, 140, 60, 0.35)'
          : occupied && !filled
            ? '0 1px 0 rgba(0,0,0,0.02), inset 0 0 0 1px rgba(255,255,255,0.6)'
            : 'none',
        cursor: occupied ? 'pointer' : 'default',
      }}
    >
      {cell && (
        <cell.Icon
          size={22}
          strokeWidth={1.4}
          color={iconColor}
          fill={filled ? '#cfc7b3' : 'none'}
          style={{ opacity: iconOpacity }}
        />
      )}
    </button>
  );
}

function Playhead({ frac, height }: { frac: number; height: number }) {
  const top = frac * height;
  return (
    <div
      className="pointer-events-none absolute left-0 right-0"
      style={{ top: 0, height }}
    >
      {/* Label column is 64px; the grid starts after it. Line covers cells only. */}
      <div
        className="absolute"
        style={{
          left: 64 + 12, // grid left padding (p-3 = 12px) inside container
          right: 12,
          top,
          height: 1,
          background: 'transparent',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 10,
            height: 10,
            borderRadius: 9999,
            background: '#b87333',
            boxShadow: '0 0 0 3px rgba(184, 115, 51, 0.18), 0 0 12px rgba(184, 115, 51, 0.4)',
          }}
        />
      </div>
      {/* Vertical line spanning the grid height, centered horizontally over the columns. */}
      <div
        className="absolute"
        style={{
          left: 64 + 12,
          right: 12,
          top: 0,
          bottom: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            bottom: 0,
            width: 1,
            transform: 'translateX(-50%)',
            background: 'linear-gradient(to bottom, rgba(184,115,51,0) 0%, rgba(184,115,51,0.35) 8%, rgba(184,115,51,0.35) 92%, rgba(184,115,51,0) 100%)',
            transition: 'opacity 200ms',
          }}
        />
        {/* Active horizontal playhead at current time */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top,
            height: 1,
            background: 'rgba(184, 115, 51, 0.5)',
            boxShadow: '0 0 8px rgba(184,115,51,0.4)',
            transition: 'top 800ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </div>
    </div>
  );
}