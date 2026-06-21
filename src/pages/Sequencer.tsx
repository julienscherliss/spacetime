import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { AppNav } from '@/components/AppNav';
import { useTaskStore, type Task } from '@/store/taskStore';
import { useLibraryStore } from '@/store/libraryStore';
import { resolveTaskIcon } from '@/lib/resolveTaskIcon';
import { useCurrentTime, timeToMinutes, minutesToTime, snapTo15 } from '@/hooks/useCurrentTime';
import {
  getOccupiedSlots,
  findValidPosition,
  clampResize,
} from '@/utils/collisionDetection';
import { TaskEditPanel } from '@/components/TaskEditPanel';
import { useCarryStore, roundCarriedDuration } from '@/store/carryStore';
import {
  Footprints, Users, Camera, Film, Dumbbell, BookOpen, PenLine,
  Home, Plane, HeartHandshake, Phone, Sparkles, Coffee, Utensils,
  Code2, Music, Mail, ShoppingCart, Briefcase, Brush, Calendar,
  ChevronLeft, ChevronRight,
  type LucideIcon,
} from 'lucide-react';

const COLS = 4;
const SLOT_MIN = 15;
const LABEL_COL_W = 46;
const PICKUP_MS = 1000;
const LOCK_MS = 250;
const MOVE_THRESHOLD_PX = 8;

// Day window is configurable via Settings → Advanced. These mirror the store
// and are kept in sync via a top-level subscription so all helpers in this
// module read the live values.
let START_HOUR = 6;
let END_HOUR = 21;
let ROWS = END_HOUR - START_HOUR;
let SLOTS_PER_DAY = ROWS * COLS;

function _syncSequencerHours(s: { dayStartHour: number; dayEndHour: number }) {
  START_HOUR = s.dayStartHour;
  END_HOUR = s.dayEndHour;
  ROWS = Math.max(1, END_HOUR - START_HOUR);
  SLOTS_PER_DAY = ROWS * COLS;
}
_syncSequencerHours(useTaskStore.getState());
useTaskStore.subscribe((state, prev) => {
  if (state.dayStartHour !== prev.dayStartHour || state.dayEndHour !== prev.dayEndHour) {
    _syncSequencerHours(state);
  }
});

const slotToMin = (slot: number) => START_HOUR * 60 + slot * SLOT_MIN;
const minToSlot = (min: number) => Math.floor((min - START_HOUR * 60) / SLOT_MIN);

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

type Gesture =
  | {
      kind: 'idle-pending';
      pointerId: number;
      startSlot: number;
      x0: number;
      y0: number;
      t0: number;
      isTouch: boolean;
      holdTimer: ReturnType<typeof setTimeout> | null;
    }
  | { kind: 'create-drag'; pointerId: number; startSlot: number; endSlot: number }
  | {
      kind: 'task-pending';
      pointerId: number;
      taskId: string;
      grabSlot: number;
      x0: number;
      y0: number;
      t0: number;
      isTouch: boolean;
      pickupTimer: ReturnType<typeof setTimeout> | null;
    }
  | {
      kind: 'task-drag';
      pointerId: number;
      taskId: string;
      duration: number;
      grabOffsetSlots: number;
      targetStart: number;
      blocked: boolean;
      PreviewIcon: LucideIcon;
    }
  | {
      kind: 'resize';
      pointerId: number;
      taskId: string;
      edge: 'start' | 'end';
      origStart: number;
      origDuration: number;
      previewStart: number;
      previewDuration: number;
    };

interface PreviewState {
  cells: Set<number>;
  blocked: boolean;
  hideTaskId?: string;
  PreviewIcon?: LucideIcon;
}

export default function Sequencer({ embedded = false }: { embedded?: boolean } = {}) {
  const tasks = useTaskStore((s) => s.tasks);
  const setEditingTask = useTaskStore((s) => s.setEditingTask);
  const addTask = useTaskStore((s) => s.addTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const resizeTask = useTaskStore((s) => s.resizeTask);
  const routinesEnabled = useTaskStore((s) => s.routinesEnabled);
  const categories = useLibraryStore((s) => s.categories);
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
      const Icon = resolveTaskIcon(t, categories) ?? pickIcon(t);
      const lo = Math.max(0, fromSlot);
      const hi = Math.min(SLOTS_PER_DAY - 1, toSlot);
      for (let i = lo; i <= hi; i++) {
        arr[i] = { task: t, Icon, isStart: i === fromSlot, isEnd: i === toSlot };
      }
    }
    return arr;
  }, [tasks, dateStr, categories]);

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

  // ─── Interaction state ─────────────────────────────────
  const gestureRef = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  // Stable refs so window listeners attach only once.
  const handlePointerMoveRef = useRef<(e: PointerEvent) => void>(() => {});
  const handlePointerUpRef = useRef<(e: PointerEvent) => void>(() => {});
  const endGestureRef = useRef<() => void>(() => {});

  /** Convert client coordinates into a slot index, or null if outside the grid. */
  const hitTestSlot = useCallback((clientX: number, clientY: number): number | null => {
    const el = gridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const relX = clientX - rect.left - LABEL_COL_W;
    const relY = clientY - rect.top;
    const cellW = (rect.width - LABEL_COL_W) / COLS;
    const rowH = rect.height / ROWS;
    if (cellW <= 0 || rowH <= 0) return null;
    const col = Math.max(0, Math.min(COLS - 1, Math.floor(relX / cellW)));
    const row = Math.max(0, Math.min(ROWS - 1, Math.floor(relY / rowH)));
    if (clientX < rect.left + LABEL_COL_W || clientY < rect.top || clientY > rect.bottom || clientX > rect.right) {
      // Out of bounds → still clamp so dragging past the edge has nice behavior
    }
    return row * COLS + col;
  }, []);

  const cellsBetween = (a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const s = new Set<number>();
    for (let i = lo; i <= hi; i++) s.add(i);
    return s;
  };

  const cellsForRange = (startSlot: number, slotCount: number) => {
    const s = new Set<number>();
    for (let i = 0; i < slotCount; i++) {
      const idx = startSlot + i;
      if (idx >= 0 && idx < SLOTS_PER_DAY) s.add(idx);
    }
    return s;
  };

  // ─── Pointer lifecycle ─────────────────────────────────
  // Track every active pointer on the grid so we can detect multi-touch (pinch/zoom)
  // and cancel any in-progress gesture instead of treating the second finger as input.
  const activePointersRef = useRef<Set<number>>(new Set());

  const endGesture = useCallback(() => {
    const g = gestureRef.current;
    if (g) {
      if ('pickupTimer' in g && g.pickupTimer) clearTimeout(g.pickupTimer);
      if ('holdTimer' in g && g.holdTimer) clearTimeout(g.holdTimer);
    }
    gestureRef.current = null;
    setPreview(null);
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const g = gestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;

    if (g.kind === 'idle-pending') {
      const moved = Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > MOVE_THRESHOLD_PX;
      if (!moved) return;
      // On touch: any movement before the hold timer fires = scroll intent.
      // Release the gesture so the browser can take over and pan the page.
      if (g.isTouch) {
        if (g.holdTimer) clearTimeout(g.holdTimer);
        endGesture();
        return;
      }
      // Mouse: promote to create-drag immediately on movement.
      const slot = hitTestSlot(e.clientX, e.clientY);
      if (slot == null) return;
      gestureRef.current = {
        kind: 'create-drag',
        pointerId: g.pointerId,
        startSlot: g.startSlot,
        endSlot: slot,
      };
      setPreview({ cells: cellsBetween(g.startSlot, slot), blocked: false });
      e.preventDefault();
      return;
    }

    if (g.kind === 'create-drag') {
      const slot = hitTestSlot(e.clientX, e.clientY);
      if (slot == null) return;
      if (slot === g.endSlot) return;
      gestureRef.current = { ...g, endSlot: slot };
      setPreview({ cells: cellsBetween(g.startSlot, slot), blocked: false });
      e.preventDefault();
      return;
    }

    if (g.kind === 'task-pending') {
      const moved = Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > MOVE_THRESHOLD_PX;
      if (!moved) return;
      if (g.isTouch && Date.now() - g.t0 < LOCK_MS) {
        return;
      }
      // Movement after the short lock window starts a task move; empty-cell pans still scroll.
      if (g.pickupTimer) clearTimeout(g.pickupTimer);
      if (g.isTouch) {
        try { gridRef.current?.setPointerCapture(g.pointerId); } catch {}
      }
      activateTaskDrag(g, e.clientX, e.clientY);
      e.preventDefault();
      return;
    }

    if (g.kind === 'task-drag') {
      const slot = hitTestSlot(e.clientX, e.clientY);
      if (slot == null) return;
      const requestedStart = slot - g.grabOffsetSlots;
      const maxStart = SLOTS_PER_DAY - Math.ceil(g.duration / SLOT_MIN);
      const clamped = Math.max(0, Math.min(maxStart, requestedStart));
      const slots = getOccupiedSlots(tasks, dateStr, g.taskId, routinesEnabled);
      const { startMin, blocked } = findValidPosition(
        slotToMin(clamped),
        g.duration,
        slots,
        START_HOUR * 60,
        END_HOUR * 60
      );
      const finalStartSlot = blocked ? clamped : Math.max(0, minToSlot(startMin));
      gestureRef.current = { ...g, targetStart: finalStartSlot, blocked };
      setPreview({
        cells: cellsForRange(finalStartSlot, Math.ceil(g.duration / SLOT_MIN)),
        blocked,
        PreviewIcon: g.PreviewIcon,
      });
      e.preventDefault();
      return;
    }

    if (g.kind === 'resize') {
      const slot = hitTestSlot(e.clientX, e.clientY);
      if (slot == null) return;
      const slots = getOccupiedSlots(tasks, dateStr, g.taskId, routinesEnabled);
      const { minStart, maxEnd } = clampResize(
        g.taskId,
        g.edge === 'start' ? 'top' : 'bottom',
        g.origStart,
        g.origStart + g.origDuration,
        slots,
        START_HOUR * 60,
        END_HOUR * 60
      );
      let previewStart = g.origStart;
      let previewDuration = g.origDuration;
      if (g.edge === 'start') {
        const targetMin = snapTo15(slotToMin(slot));
        const newStart = Math.max(minStart, Math.min(targetMin, g.origStart + g.origDuration - SLOT_MIN));
        previewStart = newStart;
        previewDuration = g.origStart + g.origDuration - newStart;
      } else {
        const targetEndMin = snapTo15(slotToMin(slot) + SLOT_MIN);
        const newEnd = Math.min(maxEnd, Math.max(targetEndMin, g.origStart + SLOT_MIN));
        previewDuration = newEnd - g.origStart;
      }
      gestureRef.current = { ...g, previewStart, previewDuration };
      const startSlot = minToSlot(previewStart);
      setPreview({
        cells: cellsForRange(startSlot, Math.ceil(previewDuration / SLOT_MIN)),
        blocked: false,
      });
      e.preventDefault();
      return;
    }
  }, [hitTestSlot, tasks, dateStr, routinesEnabled]);

  const activateTaskDrag = useCallback(
    (g: Extract<Gesture, { kind: 'task-pending' }>, clientX: number, clientY: number) => {
      const task = useTaskStore.getState().tasks.find((t) => t.id === g.taskId);
      if (!task || !task.time) return;
      const startMin = timeToMinutes(task.time);
      const duration = task.duration ?? 30;
      const startSlot = minToSlot(startMin);
      const grabOffsetSlots = Math.max(0, g.grabSlot - startSlot);
      const slot = hitTestSlot(clientX, clientY) ?? g.grabSlot;
      const requestedStart = slot - grabOffsetSlots;
      const PreviewIcon = resolveTaskIcon(task, categories) ?? pickIcon(task);
      gestureRef.current = {
        kind: 'task-drag',
        pointerId: g.pointerId,
        taskId: g.taskId,
        duration,
        grabOffsetSlots,
        targetStart: requestedStart,
        blocked: false,
        PreviewIcon,
      };
      setPreview({
        cells: cellsForRange(requestedStart, Math.ceil(duration / SLOT_MIN)),
        blocked: false,
        PreviewIcon,
      });
      if (navigator.vibrate) navigator.vibrate(12);
    },
    [hitTestSlot, categories]
  );

  const handlePointerUp = useCallback((e: PointerEvent) => {
    const g = gestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;

    if (g.kind === 'idle-pending') {
      // Pure tap on empty cell → create a 15-min task at that slot.
      const slots = getOccupiedSlots(tasks, dateStr, undefined, routinesEnabled);
      const { startMin, blocked } = findValidPosition(
        slotToMin(g.startSlot),
        SLOT_MIN,
        slots,
        START_HOUR * 60,
        END_HOUR * 60
      );
      if (!blocked) {
        const id = addTask({
          title: '',
          date: dateStr,
          time: minutesToTime(startMin),
          duration: SLOT_MIN,
          priority: 0,
          type: 'one-time',
        });
        setEditingTask(id);
      }
      endGesture();
      return;
    }

    if (g.kind === 'create-drag') {
      const lo = Math.min(g.startSlot, g.endSlot);
      const hi = Math.max(g.startSlot, g.endSlot);
      const duration = (hi - lo + 1) * SLOT_MIN;
      const slots = getOccupiedSlots(tasks, dateStr, undefined, routinesEnabled);
      const { startMin, blocked } = findValidPosition(
        slotToMin(lo),
        duration,
        slots,
        START_HOUR * 60,
        END_HOUR * 60
      );
      if (!blocked) {
        const id = addTask({
          title: '',
          date: dateStr,
          time: minutesToTime(startMin),
          duration,
          priority: 0,
          type: 'one-time',
        });
        setEditingTask(id);
      }
      endGesture();
      return;
    }

    if (g.kind === 'task-pending') {
      // Released before pickup → treat as tap → open edit panel.
      if (g.pickupTimer) clearTimeout(g.pickupTimer);
      setEditingTask(g.taskId);
      endGesture();
      return;
    }

    if (g.kind === 'task-drag') {
      if (!g.blocked) {
        const newTime = minutesToTime(slotToMin(g.targetStart));
        updateTask(g.taskId, { time: newTime, date: dateStr });
      }
      endGesture();
      return;
    }

    if (g.kind === 'resize') {
      const newTime = minutesToTime(g.previewStart);
      const duration = Math.max(SLOT_MIN, g.previewDuration);
      resizeTask(g.taskId, newTime, duration);
      endGesture();
      return;
    }
  }, [tasks, dateStr, routinesEnabled, addTask, updateTask, resizeTask, setEditingTask, endGesture]);

  // Attach window listeners while a gesture is active.
  useEffect(() => {
    const move = (e: PointerEvent) => handlePointerMoveRef.current(e);
    const up = (e: PointerEvent) => {
      activePointersRef.current.delete(e.pointerId);
      handlePointerUpRef.current(e);
    };
    const cancel = (e: PointerEvent) => {
      activePointersRef.current.delete(e.pointerId);
      endGestureRef.current();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, []);

  // Keep refs current.
  useEffect(() => {
    handlePointerMoveRef.current = handlePointerMove;
    handlePointerUpRef.current = handlePointerUp;
    endGestureRef.current = endGesture;
  }, [handlePointerMove, handlePointerUp, endGesture]);

  /** Grid-level pointerdown — dispatches to the right gesture based on the target. */
  const handleGridPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== undefined && e.button !== 0) return;

    // Carry-drop: if the user is currently carrying a task (e.g. picked up
    // from the Library or Waiting Room), a tap on the grid drops it at the
    // tapped slot. We handle this up-front so the normal gestures (create,
    // drag, resize) don't fire and the existing tile is left alone.
    if (useCarryStore.getState().carried) {
      const slot = hitTestSlot(e.clientX, e.clientY);
      if (slot == null) return;
      const carried = useCarryStore.getState().carried!;
      const startMinTarget = slotToMin(slot);
      const dropDuration = roundCarriedDuration(carried.duration);
      const occupied = getOccupiedSlots(
        useTaskStore.getState().tasks,
        dateStr,
        carried.fromLibrary ? undefined : carried.taskId,
        routinesEnabled,
      );
      const { startMin, blocked } = findValidPosition(startMinTarget, dropDuration, occupied);
      if (blocked) return;
      const newTime = minutesToTime(startMin);
      const dropped = useCarryStore.getState().drop();
      if (!dropped) return;
      if (dropped.fromLibrary && dropped.libraryItemId) {
        const libItem = useLibraryStore.getState().items.find((i) => i.id === dropped.libraryItemId);
        addTask({
          title: dropped.title,
          date: dateStr,
          time: newTime,
          duration: dropDuration,
          priority: 0,
          type: 'one-time',
          ...(libItem
            ? {
                dueDate: libItem.dueDate ?? undefined,
                description: libItem.note || undefined,
                category: libItem.category || undefined,
                subtasks: libItem.subtasks,
                attachments: libItem.attachments,
              }
            : {}),
        });
        useLibraryStore.getState().removeItem(dropped.libraryItemId);
      } else {
        updateTask(dropped.taskId, {
          date: dateStr,
          time: newTime,
          duration: dropDuration,
          inWaitingRoom: false,
        });
      }
      e.preventDefault();
      return;
    }

    // Multi-touch (pinch zoom etc) — abort any in-progress gesture and ignore the new pointer.
    activePointersRef.current.add(e.pointerId);
    if (activePointersRef.current.size > 1) {
      endGesture();
      return;
    }

    const target = e.target as HTMLElement;
    const slot = hitTestSlot(e.clientX, e.clientY);
    if (slot == null) return;

    // Capture coords up-front — synthetic event may detach by the time setTimeout runs.
    const cx = e.clientX;
    const cy = e.clientY;
    const pointerId = e.pointerId;
    const isTouch = e.pointerType === 'touch';

    // On mouse, capture so a fast drag past the edge still tracks.
    // On touch we deliberately skip capture so the browser can take over for
    // native vertical scroll if the user starts panning before any hold timer fires.
    if (!isTouch) {
      try { e.currentTarget.setPointerCapture(pointerId); } catch {}
    }

    // Resize handle?
    const handle = target.closest('[data-resize-handle]') as HTMLElement | null;
    if (handle) {
      const taskId = handle.getAttribute('data-task-id')!;
      const edge = handle.getAttribute('data-resize-handle') as 'start' | 'end';
      const task = tasks.find((t) => t.id === taskId);
      if (!task || !task.time) return;
      // Resize is an explicit edge grab — capture even on touch.
      if (isTouch) {
        try { e.currentTarget.setPointerCapture(pointerId); } catch {}
      }
      const origStart = timeToMinutes(task.time);
      const origDuration = task.duration ?? 30;
      gestureRef.current = {
        kind: 'resize',
        pointerId,
        taskId,
        edge,
        origStart,
        origDuration,
        previewStart: origStart,
        previewDuration: origDuration,
      };
      setPreview({
        cells: cellsForRange(minToSlot(origStart), Math.ceil(origDuration / SLOT_MIN)),
        blocked: false,
      });
      e.preventDefault();
      return;
    }

    const cell = cells[slot];
    if (cell) {
      // Press on a task → arm tap/hold/drag.
      const pickupTimer = setTimeout(() => {
        const g = gestureRef.current;
        if (!g || g.kind !== 'task-pending') return;
        // On touch we now own the gesture — capture so subsequent events stay here.
        if (g.isTouch) {
          try { gridRef.current?.setPointerCapture(g.pointerId); } catch {}
        }
            const latest = hitTestSlot(cx, cy) ?? g.grabSlot;
            activateTaskDrag(g, cx, cy);
            const current = gestureRef.current;
            if (current?.kind === 'task-drag') {
              gestureRef.current = { ...current, targetStart: latest - current.grabOffsetSlots };
            }
      }, PICKUP_MS);
      gestureRef.current = {
        kind: 'task-pending',
        pointerId,
        taskId: cell.task.id,
        grabSlot: slot,
        x0: cx,
        y0: cy,
        t0: Date.now(),
        isTouch,
        pickupTimer,
      };
      // Don't preventDefault on touch — let the browser scroll until hold activates.
      if (!isTouch) e.preventDefault();
    } else {
      // Press on empty cell → arm tap-to-create / hold-to-extend.
      // On touch, require a 500ms hold before drag-to-extend activates, so a plain
      // pan scrolls the page instead of accidentally creating a task.
      const holdTimer = isTouch
        ? setTimeout(() => {
            const g = gestureRef.current;
            if (!g || g.kind !== 'idle-pending') return;
            try { gridRef.current?.setPointerCapture(g.pointerId); } catch {}
            gestureRef.current = {
              kind: 'create-drag',
              pointerId: g.pointerId,
              startSlot: g.startSlot,
              endSlot: g.startSlot,
            };
            setPreview({ cells: cellsBetween(g.startSlot, g.startSlot), blocked: false });
            if (navigator.vibrate) navigator.vibrate(15);
          }, 500)
        : null;
      gestureRef.current = {
        kind: 'idle-pending',
        pointerId,
        startSlot: slot,
        x0: cx,
        y0: cy,
        t0: Date.now(),
        isTouch,
        holdTimer,
      };
    }
  }, [hitTestSlot, cells, tasks, activateTaskDrag, dateStr, routinesEnabled, addTask, updateTask]);

  const dateObj = new Date(dateStr + 'T12:00:00');
  const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();

  return (
    <div className={embedded ? "text-foreground" : "min-h-screen pb-20 sm:pb-0 bg-background text-foreground"}>
      {!embedded && <AppNav />}
      {!embedded && <TaskEditPanel />}

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
            className="grid relative select-none"
            style={{
              gridTemplateColumns: '46px repeat(4, 1fr)',
              gridAutoRows: '60px',
              borderTop: '1px solid hsl(var(--border) / 0.4)',
              touchAction: 'pan-y',
            }}
            onPointerDown={handleGridPointerDown}
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
                  preview={preview}
                />
              );
            })}
          </div>

          {visible && gridSize.h > 0 && (
            <Playhead
              nowMin={nowMin}
              width={gridSize.w}
              height={gridSize.h}
              labelColW={46}
            />
          )}
        </div>

      </div>
    </div>
  );
}


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
  label, cells, rowIdx, nowMin, preview,
}: {
  label: string;
  cells: (CellAssignment | null)[];
  rowIdx: number;
  nowMin: number;
  preview: PreviewState | null;
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
        const inPreview = preview?.cells.has(slotIdx) ?? false;
        const hidden = !!(preview?.hideTaskId && cell?.task.id === preview.hideTaskId);
        return (
          <Cell
            key={colIdx}
            slotIdx={slotIdx}
            cell={cell}
            isPast={isPast}
            isCurrent={isCurrent}
            inPreview={inPreview}
            previewBlocked={preview?.blocked ?? false}
            PreviewIcon={preview?.PreviewIcon}
            hidden={hidden}
          />
        );
      })}
    </>
  );
}

function Cell({
  slotIdx, cell, isPast, isCurrent, inPreview, previewBlocked, PreviewIcon, hidden,
}: {
  slotIdx: number;
  cell: CellAssignment | null;
  isPast: boolean;
  isCurrent: boolean;
  inPreview: boolean;
  previewBlocked: boolean;
  PreviewIcon?: LucideIcon;
  hidden: boolean;
}) {
  const occupied = !!cell && !hidden;
  const completed = cell?.task.completed;

  const previewBg = inPreview
    ? previewBlocked
      ? 'hsl(var(--destructive) / 0.18)'
      : 'hsl(var(--primary) / 0.18)'
    : null;
  const previewBorder = inPreview
    ? previewBlocked
      ? '1px dashed hsl(var(--destructive) / 0.7)'
      : '1px dashed hsl(var(--primary) / 0.7)'
    : null;

  return (
    <div className="p-[3px]" data-slot-idx={slotIdx}>
      <div
        className="relative w-full h-full rounded-sm flex items-center justify-center transition-all duration-150"
        style={{
          background: previewBg ?? (occupied ? 'hsl(var(--muted))' : 'transparent'),
          border: previewBorder ?? (occupied ? '1px solid hsl(var(--border) / 0.5)' : '1px solid transparent'),
          boxShadow: !inPreview && isCurrent && occupied
            ? 'inset 0 0 0 1px hsl(var(--primary) / 0.45), 0 2px 8px -4px hsl(var(--primary) / 0.25)'
            : !inPreview && occupied
              ? 'inset 0 1px 0 rgba(255,255,255,0.5), 0 1px 0 rgba(0,0,0,0.03)'
              : 'none',
          cursor: occupied ? 'grab' : 'default',
          touchAction: occupied ? 'none' : 'auto',
          opacity: hidden ? 0 : 1,
        }}
      >
        {inPreview && PreviewIcon ? (
          <PreviewIcon
            size={22}
            strokeWidth={1.4}
            className="text-primary pointer-events-none"
            style={{ opacity: previewBlocked ? 0.28 : 0.42 }}
          />
        ) : cell && !hidden ? (
          <cell.Icon
            size={22}
            strokeWidth={1.4}
            className="text-foreground pointer-events-none"
            style={{ opacity: completed ? 0.35 : isPast ? 0.55 : 1 }}
          />
        ) : (
          <span
            className="block rounded-full bg-foreground/[0.12] pointer-events-none"
            style={{ width: 3, height: 3 }}
          />
        )}
        {cell && !hidden && cell.isStart && (
          <div
            data-resize-handle="start"
            data-task-id={cell.task.id}
            className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize z-10"
            style={{ touchAction: 'none' }}
          />
        )}
        {cell && !hidden && cell.isEnd && (
          <div
            data-resize-handle="end"
            data-task-id={cell.task.id}
            className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize z-10"
            style={{ touchAction: 'none' }}
          />
        )}
      </div>
    </div>
  );
}

function Playhead({
  nowMin, width, height, labelColW,
}: { nowMin: number; width: number; height: number; labelColW: number }) {
  const rowH = height / ROWS;
  const dayStartMin = START_HOUR * 60;
  const minsIntoDay = nowMin - dayStartMin;
  const currentRow = Math.floor(minsIntoDay / 60);
  const minsIntoHour = minsIntoDay % 60;
  const colFrac = minsIntoHour / 60;

  const gridW = width - labelColW;
  const x = labelColW + colFrac * gridW;
  const y = currentRow * rowH;

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Vertical line within the current row */}
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: 1,
          height: rowH,
          background: 'hsl(var(--primary))',
          opacity: 0.45,
        }}
      />
      {/* Bright dot on the line */}
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y + rowH / 2,
          width: 7,
          height: 7,
          borderRadius: 9999,
          background: 'hsl(var(--primary))',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 0 2px hsl(var(--primary) / 0.25), 0 0 10px hsl(var(--primary) / 0.4)',
          transition: 'left 800ms cubic-bezier(0.22, 1, 0.36, 1), top 800ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </div>
  );
}
