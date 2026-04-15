import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, Hand, MousePointerClick, GripVertical, Plus, ArrowUpDown, RotateCcw, Move, Package } from 'lucide-react';

interface TutorialStep {
  id: string;
  title: string;
  instruction: string;
  hint: string;
  icon: React.ReactNode;
}

const STEPS: TutorialStep[] = [
  {
    id: 'tap-edit',
    title: 'Tap to edit',
    instruction: 'Tap the task below to open its edit panel.',
    hint: 'Single tap or click on any task to view and edit its details.',
    icon: <MousePointerClick size={20} strokeWidth={1.5} />,
  },
  {
    id: 'double-tap',
    title: 'Double-tap to complete',
    instruction: 'Double-tap the task to mark it as complete.',
    hint: 'A quick double-tap toggles a task between complete and incomplete.',
    icon: <CheckCircle2 size={20} strokeWidth={1.5} />,
  },
  {
    id: 'uncomplete',
    title: 'Restore a completed task',
    instruction: 'Double-tap the completed task to restore it.',
    hint: 'Double-tapping a completed task brings it back to incomplete.',
    icon: <RotateCcw size={20} strokeWidth={1.5} />,
  },
  {
    id: 'drag-move',
    title: 'Drag to move',
    instruction: 'Click and drag the task to the target zone below.',
    hint: 'On desktop, click-drag moves a task to a new time slot. Works across day columns in Week view.',
    icon: <Move size={20} strokeWidth={1.5} />,
  },
  {
    id: 'hold-pickup',
    title: 'Hold to pick up',
    instruction: 'Press and hold the task until the ring fills. It enters your inventory. Then tap the target to place it.',
    hint: 'On mobile, hold ~1 second to pick up a task into inventory, then tap where you want to drop it.',
    icon: <Package size={20} strokeWidth={1.5} />,
  },
  {
    id: 'priority',
    title: 'Priority levels',
    instruction: 'Tap each priority level below to learn what it means.',
    hint: 'FLEX → SEMI → FIXED → LOCK. Moving a task between days escalates priority.',
    icon: <ArrowUpDown size={20} strokeWidth={1.5} />,
  },
  {
    id: 'add-task',
    title: 'Schedule a task',
    instruction: 'Tap an empty time slot on the schedule below to place a task.',
    hint: 'In the app, tap any open slot on your timeline to create and schedule a task there.',
    icon: <Plus size={20} strokeWidth={1.5} />,
  },
];

interface InteractiveTutorialProps {
  open: boolean;
  onClose: () => void;
  /** When true, the user cannot dismiss/skip — must complete all steps */
  mandatory?: boolean;
}

export function InteractiveTutorial({ open, onClose, mandatory = false }: InteractiveTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [stepCompleted, setStepCompleted] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Step-specific state
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [taskCompleted, setTaskCompleted] = useState(false);
  // drag-move state
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragDropped, setDragDropped] = useState(false);
  const dragTaskRef = useRef<HTMLDivElement>(null);
  const dragTargetRef = useRef<HTMLDivElement>(null);
  // hold-pickup state
  const [holdProgress, setHoldProgress] = useState(0);
  const [inInventory, setInInventory] = useState(false);
  const [inventoryPlaced, setInventoryPlaced] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef<number>(0);
  // priority state
  const [priorityTapped, setPriorityTapped] = useState<Set<string>>(new Set());
  // add task state
  const [addTaskTapped, setAddTaskTapped] = useState(false);
  // Touch feedback
  const [isTouching, setIsTouching] = useState(false);

  const step = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1;

  const resetStepState = useCallback(() => {
    setStepCompleted(false);
    setEditPanelOpen(false);
    setTaskCompleted(false);
    setDragStartPos(null);
    setDragOffset({ x: 0, y: 0 });
    setDragDropped(false);
    setHoldProgress(0);
    setInInventory(false);
    setInventoryPlaced(false);
    setPriorityTapped(new Set());
    setAddTaskTapped(false);
    setIsTouching(false);
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const handleNext = useCallback(() => {
    if (isLastStep) {
      setShowSuccess(true);
      localStorage.setItem('tutorial-completed', 'true');
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
        setCurrentStep(0);
        resetStepState();
      }, 2000);
      return;
    }
    setCurrentStep(s => s + 1);
    resetStepState();
  }, [isLastStep, onClose, resetStepState]);

  useEffect(() => {
    if (open) {
      setCurrentStep(0);
      resetStepState();
      setShowSuccess(false);
    }
  }, [open, resetStepState]);

  // --- Tap to edit ---
  const handleTapTask = () => {
    if (step.id === 'tap-edit') {
      setEditPanelOpen(true);
      setTimeout(() => {
        setEditPanelOpen(false);
        setStepCompleted(true);
      }, 1200);
    }
  };

  // --- Double-tap ---
  const lastTapRef = useRef(0);
  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 400) {
      if (step.id === 'double-tap') {
        setTaskCompleted(true);
        setStepCompleted(true);
      } else if (step.id === 'uncomplete' && taskCompleted) {
        setTaskCompleted(false);
        setStepCompleted(true);
      }
    }
    lastTapRef.current = now;
  };

  useEffect(() => {
    if (step?.id === 'uncomplete') {
      setTaskCompleted(true);
    }
  }, [step?.id]);

  // --- Drag to move ---
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (step.id !== 'drag-move') return;
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragStartPos({ x: clientX, y: clientY });
    setDragOffset({ x: 0, y: 0 });
    setIsTouching(true);
  };

  const handleDragMoveEvent = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dragStartPos || step.id !== 'drag-move') return;
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragOffset({
      x: clientX - dragStartPos.x,
      y: clientY - dragStartPos.y,
    });
  };

  const handleDragEnd = () => {
    if (!dragStartPos || step.id !== 'drag-move') return;
    setIsTouching(false);
    // Check if over target
    if (dragTargetRef.current && dragTaskRef.current) {
      const targetRect = dragTargetRef.current.getBoundingClientRect();
      const taskRect = dragTaskRef.current.getBoundingClientRect();
      const cx = taskRect.left + taskRect.width / 2;
      const cy = taskRect.top + taskRect.height / 2;
      if (cx >= targetRect.left && cx <= targetRect.right && cy >= targetRect.top && cy <= targetRect.bottom) {
        setDragDropped(true);
        setStepCompleted(true);
      }
    }
    setDragStartPos(null);
    if (!dragDropped) {
      setDragOffset({ x: 0, y: 0 });
    }
  };

  // --- Hold to pick up (inventory) ---
  const handleHoldStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (step.id !== 'hold-pickup' || inInventory) return;
    if ('touches' in e) e.preventDefault();
    setIsTouching(true);
    holdStartRef.current = Date.now();
    setHoldProgress(0);
    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current;
      const pct = Math.min(elapsed / 800, 1);
      setHoldProgress(pct);
      if (pct >= 1) {
        clearInterval(holdTimerRef.current!);
        holdTimerRef.current = null;
        setInInventory(true);
        setHoldProgress(0);
        setIsTouching(false);
      }
    }, 16);
  };

  const handleHoldEnd = () => {
    setIsTouching(false);
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (!inInventory) {
      setHoldProgress(0);
    }
  };

  const handleInventoryPlace = () => {
    if (step.id === 'hold-pickup' && inInventory && !inventoryPlaced) {
      setInventoryPlaced(true);
      setStepCompleted(true);
    }
  };

  // --- Priority info ---
  const handlePriorityTap = (level: string) => {
    setPriorityTapped(prev => {
      const next = new Set(prev);
      next.add(level);
      if (next.size >= 4) {
        setTimeout(() => setStepCompleted(true), 300);
      }
      return next;
    });
  };

  // --- Add task (schedule slot) ---
  const [scheduledSlot, setScheduledSlot] = useState<number | null>(null);
  const handleSlotTap = (slotIndex: number) => {
    if (step.id !== 'add-task' || scheduledSlot !== null) return;
    setScheduledSlot(slotIndex);
    setAddTaskTapped(true);
    setStepCompleted(true);
  };
    setStepCompleted(true);
  };

  // Prevent touch scrolling during drag/hold interactions
  useEffect(() => {
    const preventScroll = (e: TouchEvent) => {
      if (isTouching && (step.id === 'drag-move' || step.id === 'hold-pickup')) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchmove', preventScroll, { passive: false });
    return () => document.removeEventListener('touchmove', preventScroll);
  }, [isTouching, step.id]);

  if (!open) return null;

  const PRIORITY_LEVELS = [
    { key: 'flex', label: 'FLEX', desc: 'Move freely between any days', color: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600' },
    { key: 'semi', label: 'SEMI', desc: 'Move within the current week only', color: 'bg-amber-500/15 border-amber-500/30 text-amber-600' },
    { key: 'fixed', label: 'FIXED', desc: 'Move within the current day only', color: 'bg-orange-500/15 border-orange-500/30 text-orange-600' },
    { key: 'lock', label: 'LOCK', desc: 'Cannot be moved at all', color: 'bg-red-500/15 border-red-500/30 text-red-600' },
  ];

  const TaskBlock = ({ title, duration, priority, priorityColor }: { title: string; duration: string; priority: string; priorityColor: string }) => (
    <div className="flex items-center gap-2 min-w-0">
      <div className={`w-1 h-8 rounded-full ${priorityColor} shrink-0`} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-mono text-foreground font-medium truncate">{title}</div>
        <div className="text-[10px] font-mono text-muted-foreground/50 truncate">{duration} · {priority}</div>
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-background/95 backdrop-blur-sm flex flex-col touch-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
            <span className="text-[10px] font-mono tracking-wider text-muted-foreground/60">
              STEP {currentStep + 1} / {STEPS.length}
            </span>
            {!mandatory && (
              <button 
                onClick={() => { onClose(); setCurrentStep(0); resetStepState(); }} 
                className="text-muted-foreground hover:text-foreground transition-colors p-2 -mr-2 touch-manipulation"
                aria-label="Close tutorial"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-border/30 shrink-0">
            <motion.div
              className="h-full bg-primary"
              animate={{ width: `${((currentStep + (stepCompleted ? 1 : 0)) / STEPS.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 overflow-hidden min-h-0">
            <AnimatePresence mode="wait">
              {showSuccess ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center px-4"
                >
                  <CheckCircle2 size={48} className="text-primary mx-auto mb-4" />
                  <h2 className="text-lg font-display font-bold text-foreground mb-2">Tutorial Complete!</h2>
                  <p className="text-[12px] font-mono text-muted-foreground">You're ready to go.</p>
                </motion.div>
              ) : (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.25 }}
                  className="w-full max-w-sm flex flex-col items-center"
                >
                  {/* Step icon & title */}
                  <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4 shrink-0">
                    {step.icon}
                  </div>
                  <h3 className="text-sm font-display font-bold text-foreground tracking-tight mb-1 text-center">{step.title}</h3>
                  <p className="text-[11px] font-mono text-muted-foreground/70 text-center mb-4 sm:mb-6 leading-relaxed max-w-[280px]">
                    {step.instruction}
                  </p>

                  {/* Interactive area - mobile optimized */}
                  <div className="w-full bg-muted/20 border border-border/40 rounded-sm p-3 sm:p-4 flex flex-col items-center justify-center relative min-h-[160px] sm:min-h-[180px]">

                    {/* TAP TO EDIT */}
                    {step.id === 'tap-edit' && (
                      <div className="w-full space-y-3">
                        <div
                          onClick={handleTapTask}
                          className="w-full bg-card border border-border/60 rounded-sm p-4 cursor-pointer hover:border-primary/30 transition-all active:scale-[0.98] touch-manipulation"
                        >
                          <TaskBlock title="Morning workout" duration="30 min" priority="FLEX" priorityColor="bg-emerald-500/40" />
                        </div>
                        <AnimatePresence>
                          {editPanelOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 10 }}
                              className="w-full bg-card border border-primary/30 rounded-sm p-3"
                            >
                              <div className="text-[10px] font-mono text-primary tracking-wider mb-2">EDIT PANEL</div>
                              <div className="space-y-1.5">
                                <div className="h-3 bg-muted/40 rounded w-3/4" />
                                <div className="h-3 bg-muted/40 rounded w-1/2" />
                                <div className="h-3 bg-muted/40 rounded w-2/3" />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* DOUBLE-TAP / UNCOMPLETE */}
                    {(step.id === 'double-tap' || step.id === 'uncomplete') && (
                      <div
                        onClick={handleDoubleTap}
                        className={`w-full bg-card border rounded-sm p-4 cursor-pointer transition-all active:scale-[0.98] select-none touch-manipulation ${
                          taskCompleted ? 'border-primary/30 bg-primary/5' : 'border-border/60 hover:border-primary/30'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-1 h-8 rounded-full transition-colors shrink-0 ${taskCompleted ? 'bg-primary/60' : 'bg-emerald-500/40'}`} />
                          <div className="flex-1 min-w-0">
                            <div className={`text-[12px] font-mono font-medium transition-colors truncate ${taskCompleted ? 'text-primary line-through' : 'text-foreground'}`}>
                              Review presentation
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground/50 truncate">45 min · SEMI</div>
                          </div>
                          {taskCompleted && (
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-primary shrink-0">
                              <CheckCircle2 size={16} />
                            </motion.div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* DRAG TO MOVE */}
                    {step.id === 'drag-move' && (
                      <div className="w-full space-y-3">
                        <div
                          ref={dragTaskRef}
                          onMouseDown={handleDragStart}
                          onMouseMove={handleDragMoveEvent}
                          onMouseUp={handleDragEnd}
                          onMouseLeave={handleDragEnd}
                          onTouchStart={handleDragStart}
                          onTouchMove={handleDragMoveEvent}
                          onTouchEnd={handleDragEnd}
                          style={{
                            transform: dragStartPos ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : dragDropped ? 'none' : undefined,
                            zIndex: dragStartPos ? 10 : undefined,
                            position: 'relative' as const,
                            opacity: dragDropped ? 0.3 : 1,
                          }}
                          className={`w-full bg-card border rounded-sm p-4 cursor-grab select-none transition-shadow touch-manipulation ${
                            dragStartPos ? 'border-primary/40 shadow-lg' : 'border-border/60'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <TaskBlock title="Team standup" duration="15 min" priority="SEMI" priorityColor="bg-amber-500/40" />
                            <GripVertical size={16} className="ml-auto text-muted-foreground/30 shrink-0" />
                          </div>
                        </div>

                        <div
                          ref={dragTargetRef}
                          className={`w-full border-2 border-dashed rounded-sm p-4 flex items-center justify-center transition-colors min-h-[60px] ${
                            dragDropped
                              ? 'border-primary/40 bg-primary/5'
                              : dragStartPos
                                ? 'border-primary/30 bg-primary/5'
                                : 'border-border/30 bg-muted/10'
                          }`}
                        >
                          <span className="text-[10px] font-mono text-muted-foreground/40 tracking-wider">
                            {dragDropped ? '✓ MOVED' : 'DROP HERE'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* HOLD TO PICK UP (INVENTORY) */}
                    {step.id === 'hold-pickup' && (
                      <div className="w-full space-y-3">
                        {/* The task to hold */}
                        {!inventoryPlaced && (
                          <div
                            onMouseDown={handleHoldStart}
                            onMouseUp={handleHoldEnd}
                            onMouseLeave={handleHoldEnd}
                            onTouchStart={handleHoldStart}
                            onTouchEnd={handleHoldEnd}
                            className={`w-full bg-card border rounded-sm p-4 select-none transition-all touch-manipulation ${
                              inInventory
                                ? 'border-primary/30 bg-primary/5 opacity-40'
                                : holdProgress > 0
                                  ? 'border-primary/30'
                                  : 'border-border/60'
                            } ${isTouching ? 'scale-[0.98]' : ''}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="relative shrink-0">
                                <div className="w-1 h-8 rounded-full bg-orange-500/40" />
                                {holdProgress > 0 && !inInventory && (
                                  <svg className="absolute -inset-2 w-[calc(100%+16px)] h-[calc(100%+16px)]" viewBox="0 0 20 48">
                                    <circle
                                      cx="10" cy="24" r="8"
                                      fill="none"
                                      stroke="hsl(var(--primary))"
                                      strokeWidth="2"
                                      strokeDasharray={`${holdProgress * 50} 50`}
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-[12px] font-mono text-foreground font-medium truncate">Write report</div>
                                <div className="text-[10px] font-mono text-muted-foreground/50 truncate">60 min · FIXED</div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Inventory indicator */}
                        <AnimatePresence>
                          {inInventory && !inventoryPlaced && (
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              className="w-full bg-card border border-primary/30 rounded-sm p-3 flex items-center gap-2"
                            >
                              <Package size={16} className="text-primary shrink-0" />
                              <span className="text-[11px] font-mono text-primary font-medium truncate flex-1">Write report</span>
                              <span className="text-[9px] font-mono text-primary/50 tracking-wider shrink-0">IN INVENTORY</span>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Drop target — tap to place */}
                        <div
                          onClick={handleInventoryPlace}
                          className={`w-full border-2 border-dashed rounded-sm p-4 flex items-center justify-center transition-colors min-h-[60px] touch-manipulation ${
                            inventoryPlaced
                              ? 'border-primary/40 bg-primary/5'
                              : inInventory
                                ? 'border-primary/30 bg-primary/5 cursor-pointer active:bg-primary/15'
                                : 'border-border/30 bg-muted/10'
                          }`}
                        >
                          <span className="text-[10px] font-mono text-muted-foreground/40 tracking-wider">
                            {inventoryPlaced ? '✓ PLACED' : inInventory ? 'TAP TO PLACE HERE' : 'TARGET ZONE'}
                          </span>
                        </div>

                        {/* Placed task preview */}
                        <AnimatePresence>
                          {inventoryPlaced && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="w-full bg-card border border-primary/20 rounded-sm p-3"
                            >
                              <TaskBlock title="Write report" duration="60 min" priority="FIXED" priorityColor="bg-orange-500/40" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* PRIORITY INFO */}
                    {step.id === 'priority' && (
                      <div className="w-full space-y-2">
                        {PRIORITY_LEVELS.map(p => (
                          <button
                            key={p.key}
                            onClick={() => handlePriorityTap(p.key)}
                            className={`w-full text-left border rounded-sm p-3 transition-all touch-manipulation active:scale-[0.98] ${p.color} ${
                              priorityTapped.has(p.key) ? 'opacity-100' : 'opacity-60 hover:opacity-80'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-mono font-bold tracking-wider">{p.label}</span>
                              {priorityTapped.has(p.key) && <CheckCircle2 size={12} className="shrink-0" />}
                            </div>
                            <AnimatePresence>
                              {priorityTapped.has(p.key) && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                >
                                  <div className="text-[10px] font-mono mt-1 opacity-70">{p.desc}</div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* ADD TASK */}
                    {step.id === 'add-task' && (
                      <div className="flex flex-col items-center gap-4">
                        {!addTaskTapped ? (
                          <button
                            onClick={handleAddTask}
                            className="w-14 h-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary hover:bg-primary/20 transition-all active:scale-95 touch-manipulation"
                            aria-label="Add task"
                          >
                            <Plus size={28} strokeWidth={1.5} />
                          </button>
                        ) : (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="w-full bg-card border border-primary/30 rounded-sm p-3"
                          >
                            <div className="text-[10px] font-mono text-primary tracking-wider mb-2">NEW TASK CREATED</div>
                            <TaskBlock title="My new task" duration="30 min" priority="FLEX" priorityColor="bg-emerald-500/40" />
                          </motion.div>
                        )}
                        <p className="text-[9px] font-mono text-muted-foreground/40 text-center px-2">
                          In the real app, you can also drag on an empty timeline slot
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Hint */}
                  <div className="mt-3 px-3 py-2 bg-primary/5 border border-primary/10 rounded-sm w-full">
                    <p className="text-[10px] sm:text-[11px] font-mono text-primary/60 leading-relaxed text-center">{step.hint}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="px-4 sm:px-6 py-4 border-t border-border/30 shrink-0">
            <button
              onClick={handleNext}
              disabled={!stepCompleted}
              className={`w-full py-3.5 sm:py-3 rounded-sm text-[12px] font-mono tracking-wider transition-all touch-manipulation ${
                stepCompleted
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted/30 text-muted-foreground/30 cursor-not-allowed border border-border/30'
              }`}
            >
              {isLastStep ? 'FINISH' : 'NEXT'}
              {!stepCompleted && (
                <span className="ml-2 text-[9px] opacity-50">Complete the task first</span>
              )}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
