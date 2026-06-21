import { useMemo, useState, useRef, useEffect } from 'react';
import { AppNav } from '@/components/AppNav';
import { useTaskStore, type Task } from '@/store/taskStore';
import { useCurrentTime, timeToMinutes } from '@/hooks/useCurrentTime';
import { TaskEditPanel } from '@/components/TaskEditPanel';
import {
  Footprints, Users, Camera, Film, Dumbbell, BookOpen, PenLine,
  Home, Plane, HeartHandshake, Phone, Sparkles, Coffee, Utensils,
  Code2, Music, Mail, ShoppingCart, Briefcase, Brush, Calendar,
  ChevronLeft, ChevronRight, SlidersVertical, MoreHorizontal, Plus, Play,
  type LucideIcon,
} from 'lucide-react';

const START_HOUR = 8;
const END_HOUR = 18;
const ROWS = END_HOUR - START_HOUR; // 10
const COLS = 4;
const SLOT_MIN = 15;
const SLOTS_PER_DAY = ROWS * COLS;

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
        arr[i] = { task: t, Icon, isStart: i === fromSlot, isEnd: i === toSlot };
      }
    }
    return arr;
  }, [tasks, dateStr]);

  const completedOnDay = useMemo(() => {
    const day = tasks.filter((t) => t.date === dateStr && !t.archivedAt && !t.inWaitingRoom && !t.groupId && t.time);
    return { done: day.filter((t) => t.completed).length, total: day.length };
  }, [tasks, dateStr]);

  const visible = nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60;
  const playFrac = Math.max(0, Math.min(1, (nowMin - START_HOUR * 60) / ((END_HOUR - START_HOUR) * 60)));

  const gridRef = useRef<HTMLDivElement>(null);
  const [gridSize, setGridSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!gridRef.current) return;
    const ro = new ResizeObserver(() => {
      if (gridRef.current) setGridSize({ w: gridRef.current.offsetWidth, h: gridRef.current.offsetHeight });
    });
    ro.observe(gridRef.current);
    const el = gridRef.current;
    setGridSize({ w: el.offsetWidth, h: el.offsetHeight });
    return () => ro.disconnect();
  }, []);

  const dateObj = new Date(dateStr + 'T12:00:00');
  const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();

  return (
    <div className="min-h-screen pb-20 sm:pb-0 bg-background text-foreground">
      <AppNav />
      <TaskEditPanel />

      <div className="mx-auto max-w-md px-5 pt-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-[22px] leading-none font-bold tracking-[0.04em]">
              {dateLabel}
            </h1>
            <div className="mt-2 text-[11px] font-mono tracking-[0.18em] text-muted-foreground">
              {completedOnDay.done}/{completedOnDay.total || 0} COMPLETED
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ChromeBtn><SlidersVertical size={16} strokeWidth={1.5} /></ChromeBtn>
            <ChromeBtn><MoreHorizontal size={16} strokeWidth={1.5} /></ChromeBtn>
          </div>
        </div>

        {/* Day nav */}
        <div className="mt-5 flex items-center gap-2">
          <ChromeBtn><ChevronLeft size={16} strokeWidth={1.5} /></ChromeBtn>
          <div className="px-5 py-2 rounded-md text-[11px] font-mono tracking-[0.22em] border border-border">
            TODAY
          </div>
          <ChromeBtn><ChevronRight size={16} strokeWidth={1.5} /></ChromeBtn>
        </div>

        {/* Column header */}
        <div className="mt-7 grid" style={{ gridTemplateColumns: '46px repeat(4, 1fr)' }}>
          <div />
          {[':00', ':15', ':30', ':45'].map((l) => (
            <div key={l} className="text-[10px] font-mono tracking-[0.18em] text-center pb-2 text-muted-foreground/60">
              {l}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="relative">
          <div
            ref={gridRef}
            className="grid relative"
            style={{
              gridTemplateColumns: '46px repeat(4, 1fr)',
              gridAutoRows: '60px',
              borderTop: '1px solid hsl(var(--border) / 0.4)',
            }}
          >
            {Array.from({ length: ROWS }).map((_, rowIdx) => {
              const hour = START_HOUR + rowIdx;
              const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
              const period = hour >= 12 ? 'PM' : 'AM';
              return (
                <RowFragment
                  key={hour}
                  label={`${h12} ${period}`}
                  cells={cells}
                  rowIdx={rowIdx}
                  nowMin={nowMin}
                  onOpen={(id) => setEditingTask(id)}
                />
              );
            })}
          </div>

          {visible && gridSize.h > 0 && (
            <Playhead
              frac={playFrac}
              width={gridSize.w}
              height={gridSize.h}
              labelColW={46}
            />
          )}
        </div>

        {/* Legend + actions */}
        <div className="mt-6 grid items-end gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)' }}>
          <div className="rounded-md px-3 py-2.5 text-[10px] font-mono tracking-[0.16em] space-y-1.5 border border-border text-muted-foreground">
            {CATEGORIES.map(({ label, icon: Icon }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon size={11} strokeWidth={1.5} className="text-foreground/70" />
                <span>{label}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="h-12 w-12 rounded-md flex items-center justify-center border border-border bg-muted"
          >
            <Plus size={20} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className="h-12 rounded-md flex items-center justify-center gap-2 text-[11px] font-mono tracking-[0.22em] border border-border bg-muted"
          >
            NOW
            <Play size={11} strokeWidth={1.5} fill="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
}

const CATEGORIES: { label: string; icon: LucideIcon }[] = [
  { label: 'HEALTH', icon: Footprints },
  { label: 'MEETINGS', icon: Users },
  { label: 'WEDDING', icon: HeartHandshake },
  { label: 'COMMUNICATION', icon: Phone },
  { label: 'WORK', icon: Code2 },
  { label: 'PERSONAL', icon: Sparkles },
];

function ChromeBtn({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="h-9 w-9 rounded-md flex items-center justify-center border border-border text-foreground"
    >
      {children}
    </button>
  );
}

function RowFragment({
  label, cells, rowIdx, nowMin, onOpen,
}: {
  label: string;
  cells: (CellAssignment | null)[];
  rowIdx: number;
  nowMin: number;
  onOpen: (id: string) => void;
}) {
  return (
    <>
      <div
        className="flex items-center justify-start pl-1 text-[10px] font-mono tracking-[0.18em] text-muted-foreground/60"
        style={{ borderBottom: '1px solid hsl(var(--border) / 0.25)' }}
      >
        {label}
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
            onOpen={onOpen}
          />
        );
      })}
    </>
  );
}

function Cell({
  cell, isPast, isCurrent, onOpen,
}: {
  cell: CellAssignment | null;
  isPast: boolean;
  isCurrent: boolean;
  onOpen: (id: string) => void;
}) {
  const occupied = !!cell;
  const completed = cell?.task.completed;

  return (
    <div className="p-[3px]">
      <button
        type="button"
        onClick={() => cell && onOpen(cell.task.id)}
        className="relative w-full h-full rounded-sm flex items-center justify-center transition-all duration-200"
        style={{
          background: occupied ? 'hsl(var(--muted))' : 'transparent',
          border: occupied ? '1px solid hsl(var(--border) / 0.5)' : '1px solid transparent',
          boxShadow: isCurrent && occupied
            ? 'inset 0 0 0 1px hsl(var(--primary) / 0.45), 0 2px 8px -4px hsl(var(--primary) / 0.25)'
            : occupied
              ? 'inset 0 1px 0 rgba(255,255,255,0.5), 0 1px 0 rgba(0,0,0,0.03)'
              : 'none',
          cursor: occupied ? 'pointer' : 'default',
        }}
      >
        {cell ? (
          <cell.Icon
            size={22}
            strokeWidth={1.4}
            className="text-foreground"
            style={{ opacity: completed ? 0.35 : isPast ? 0.55 : 1 }}
          />
        ) : (
          <span
            className="block rounded-full bg-foreground/[0.12]"
            style={{ width: 3, height: 3 }}
          />
        )}
      </button>
    </div>
  );
}

function Playhead({
  frac, width, height, labelColW,
}: { frac: number; width: number; height: number; labelColW: number }) {
  const y = frac * height;
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Horizontal line at current time */}
      <div
        style={{
          position: 'absolute',
          left: labelColW,
          top: y,
          width: width - labelColW,
          height: 1,
          background: 'hsl(var(--primary))',
          opacity: 0.45,
        }}
      />
      {/* Bright dot on the line */}
      <div
        style={{
          position: 'absolute',
          left: labelColW + 6,
          top: y,
          width: 7,
          height: 7,
          borderRadius: 9999,
          background: 'hsl(var(--primary))',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 0 2px hsl(var(--primary) / 0.25), 0 0 10px hsl(var(--primary) / 0.4)',
          transition: 'top 800ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </div>
  );
}
