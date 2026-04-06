import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useScheduledDragStore } from '@/store/scheduledDragStore';
import { useTaskStore } from '@/store/taskStore';
import { useLibraryStore } from '@/store/libraryStore';
import { HoldToConfirmRing } from '@/components/HoldToConfirmRing';
import { Archive, Clock } from 'lucide-react';

const HOLD_DURATION_MS = 400;
const ZONE_HEIGHT = 64;

type ZoneType = 'library' | 'waitingRoom' | null;

export function InventoryDropZones() {
  const dragActive = useScheduledDragStore((s) => s.active);
  const dragTaskId = useScheduledDragStore((s) => s.taskId);
  const [hoveredZone, setHoveredZone] = useState<ZoneType>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdStartRef = useRef<number | null>(null);
  const holdRafRef = useRef<number | null>(null);
  const committedRef = useRef(false);

  // Reset when drag ends
  useEffect(() => {
    if (!dragActive) {
      setHoveredZone(null);
      setHoldProgress(0);
      holdStartRef.current = null;
      committedRef.current = false;
      if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current);
    }
  }, [dragActive]);

  // Track pointer position during drag to detect zone hover
  useEffect(() => {
    if (!dragActive) return;

    const handleMove = (e: PointerEvent) => {
      const y = e.clientY;
      const screenH = window.innerHeight;

      let zone: ZoneType = null;
      // Top zone = library, bottom zone = waiting room
      if (y <= ZONE_HEIGHT) {
        zone = 'library';
      } else if (y >= screenH - ZONE_HEIGHT) {
        zone = 'waitingRoom';
      }

      setHoveredZone(prev => {
        if (prev !== zone) {
          // Zone changed — reset hold
          holdStartRef.current = null;
          setHoldProgress(0);
          committedRef.current = false;
          if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current);
          return zone;
        }
        return prev;
      });
    };

    window.addEventListener('pointermove', handleMove);
    return () => window.removeEventListener('pointermove', handleMove);
  }, [dragActive]);

  // Hold timer animation loop
  useEffect(() => {
    if (!dragActive || !hoveredZone || committedRef.current) return;

    holdStartRef.current = performance.now();

    const tick = () => {
      if (!holdStartRef.current || committedRef.current) return;
      const elapsed = performance.now() - holdStartRef.current;
      const progress = Math.min(1, elapsed / HOLD_DURATION_MS);
      setHoldProgress(progress);

      if (progress >= 1) {
        // Commit!
        committedRef.current = true;
        commitDrop(hoveredZone);
        return;
      }
      holdRafRef.current = requestAnimationFrame(tick);
    };

    holdRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (holdRafRef.current) cancelAnimationFrame(holdRafRef.current);
    };
  }, [dragActive, hoveredZone]);

  const commitDrop = useCallback((zone: ZoneType) => {
    const state = useScheduledDragStore.getState();
    if (!state.taskId) return;

    if (zone === 'library') {
      // Move task to library
      const task = useTaskStore.getState().tasks.find(t => t.id === state.taskId);
      if (task) {
        useLibraryStore.getState().addFromSchedule({
          title: task.title,
          duration: task.duration || 30,
          category: task.category,
          note: task.description,
        });
        useTaskStore.getState().deleteTask(task.id);
      }
    } else if (zone === 'waitingRoom') {
      // Send task to waiting room
      useTaskStore.getState().updateTask(state.taskId, {
        inWaitingRoom: true,
        time: undefined,
      } as any);
    }

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(30);
    
    useScheduledDragStore.getState().endDrag();
  }, []);

  if (!dragActive) return null;

  return (
    <>
      {/* Top zone — Library */}
      <AnimatePresence>
        {dragActive && (
          <motion.div
            initial={{ y: -ZONE_HEIGHT, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -ZONE_HEIGHT, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={`fixed top-0 left-0 right-0 z-[90] flex items-center justify-center gap-3 transition-colors duration-150 ${
              hoveredZone === 'library'
                ? 'bg-primary/10 border-b-2 border-primary/30'
                : 'bg-background/80 border-b border-border/30 backdrop-blur-sm'
            }`}
            style={{ height: ZONE_HEIGHT }}
          >
            {hoveredZone === 'library' ? (
              <HoldToConfirmRing progress={holdProgress} size={36} strokeWidth={2.5} />
            ) : (
              <Archive size={16} className="text-muted-foreground/40" />
            )}
            <span className={`text-[10px] font-mono tracking-wider uppercase ${
              hoveredZone === 'library' ? 'text-primary/70' : 'text-muted-foreground/40'
            }`}>
              {hoveredZone === 'library' 
                ? (holdProgress >= 1 ? 'SENT TO LIBRARY' : 'HOLD TO SEND TO LIBRARY')
                : 'LIBRARY'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom zone — Waiting Room */}
      <AnimatePresence>
        {dragActive && (
          <motion.div
            initial={{ y: ZONE_HEIGHT, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: ZONE_HEIGHT, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={`fixed bottom-0 left-0 right-0 z-[90] flex items-center justify-center gap-3 transition-colors duration-150 ${
              hoveredZone === 'waitingRoom'
                ? 'bg-primary/10 border-t-2 border-primary/30'
                : 'bg-background/80 border-t border-border/30 backdrop-blur-sm'
            }`}
            style={{ height: ZONE_HEIGHT }}
          >
            {hoveredZone === 'waitingRoom' ? (
              <HoldToConfirmRing progress={holdProgress} size={36} strokeWidth={2.5} />
            ) : (
              <Clock size={16} className="text-muted-foreground/40" />
            )}
            <span className={`text-[10px] font-mono tracking-wider uppercase ${
              hoveredZone === 'waitingRoom' ? 'text-primary/70' : 'text-muted-foreground/40'
            }`}>
              {hoveredZone === 'waitingRoom'
                ? (holdProgress >= 1 ? 'SENT TO WAITING ROOM' : 'HOLD TO SEND TO WAITING')
                : 'WAITING ROOM'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
