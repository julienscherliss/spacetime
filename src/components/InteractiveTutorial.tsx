import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, CheckCircle2, Hand, MousePointerClick, GripVertical, Plus, ArrowUpDown, Archive, RotateCcw } from 'lucide-react';

interface TutorialStep {
  id: string;
  title: string;
  instruction: string;
  hint: string;
  icon: React.ReactNode;
  type: 'tap' | 'double-tap' | 'hold' | 'drag' | 'info';
}

const STEPS: TutorialStep[] = [
  {
    id: 'tap-edit',
    title: 'Tap to edit',
    instruction: 'Tap the task below to open its edit panel.',
    hint: 'Single tap or click on any task to view and edit its details.',
    icon: <MousePointerClick size={20} strokeWidth={1.5} />,
    type: 'tap',
  },
  {
    id: 'double-tap',
    title: 'Double-tap to complete',
    instruction: 'Double-tap the task to mark it as complete.',
    hint: 'A quick double-tap toggles a task between complete and incomplete.',
    icon: <CheckCircle2 size={20} strokeWidth={1.5} />,
    type: 'double-tap',
  },
  {
    id: 'uncomplete',
    title: 'Restore a completed task',
    instruction: 'Double-tap the completed task to restore it.',
    hint: 'Double-tapping a completed task brings it back to incomplete.',
    icon: <RotateCcw size={20} strokeWidth={1.5} />,
    type: 'double-tap',
  },
  {
    id: 'hold-drag',
    title: 'Hold to pick up',
    instruction: 'Press and hold the task until the ring fills, then drag it to the target zone.',
    hint: 'On mobile, a long press (~1 second) picks up a task so you can reposition it.',
    icon: <Hand size={20} strokeWidth={1.5} />,
    type: 'hold',
  },
  {
    id: 'priority',
    title: 'Priority levels',
    instruction: 'Tap each priority level below to learn what it means.',
    hint: 'FLEX → SEMI → FIXED → LOCK. Moving a task between days escalates priority.',
    icon: <ArrowUpDown size={20} strokeWidth={1.5} />,
    type: 'info',
  },
  {
    id: 'add-task',
    title: 'Add a new task',
    instruction: 'Tap the + button below to create a task.',
    hint: 'Use the + button at the bottom of your screen, or drag on an empty timeline slot.',
    icon: <Plus size={20} strokeWidth={1.5} />,
    type: 'tap',
  },
];

interface InteractiveTutorialProps {
  open: boolean;
  onClose: () => void;
}

export function InteractiveTutorial({ open, onClose }: InteractiveTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [stepCompleted, setStepCompleted] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Step-specific state
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [taskCompleted, setTaskCompleted] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [droppedInTarget, setDroppedInTarget] = useState(false);
  const [priorityTapped, setPriorityTapped] = useState<Set<string>>(new Set());
  const [addTaskTapped, setAddTaskTapped] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef<number>(0);
  const taskRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);

  const step = STEPS[currentStep];
  const isLastStep = currentStep === STEPS.length - 1;

  const resetStepState = useCallback(() => {
    setStepCompleted(false);
    setEditPanelOpen(false);
    setTaskCompleted(false);
    setHoldProgress(0);
    setIsDragging(false);
    setDroppedInTarget(false);
    setPriorityTapped(new Set());
    setAddTaskTapped(false);
  }, []);

  const handleNext = useCallback(() => {
    if (isLastStep) {
      setShowSuccess(true);
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

  // Reset on open
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

  // Reset taskCompleted for uncomplete step
  useEffect(() => {
    if (step?.id === 'uncomplete') {
      setTaskCompleted(true);
    }
  }, [step?.id]);

  // --- Hold to drag ---
  const handleHoldStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (step.id !== 'hold-drag') return;
    holdStartRef.current = Date.now();
    setHoldProgress(0);

    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current;
      const pct = Math.min(elapsed / 800, 1);
      setHoldProgress(pct);
      if (pct >= 1) {
        clearInterval(holdTimerRef.current!);
        holdTimerRef.current = null;
        setIsDragging(true);
      }
    }, 16);
  };

  const handleHoldEnd = () => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (isDragging) {
      // Check if dropped in target
      if (targetRef.current && taskRef.current) {
        const targetRect = targetRef.current.getBoundingClientRect();
        const taskRect = taskRef.current.getBoundingClientRect();
        const taskCenter = {
          x: taskRect.left + dragPosition.x + taskRect.width / 2,
          y: taskRect.top + dragPosition.y + taskRect.height / 2,
        };
        if (
          taskCenter.x >= targetRect.left &&
          taskCenter.x <= targetRect.right &&
          taskCenter.y >= targetRect.top &&
          taskCenter.y <= targetRect.bottom
        ) {
          setDroppedInTarget(true);
          setStepCompleted(true);
        }
      }
      setIsDragging(false);
      setHoldProgress(0);
      if (!droppedInTarget) {
        setDragPosition({ x: 0, y: 0 });
      }
    } else {
      setHoldProgress(0);
    }
  };

  const handleDragMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    if (taskRef.current) {
      const rect = taskRef.current.getBoundingClientRect();
      setDragPosition({
        x: clientX - rect.left - rect.width / 2,
        y: clientY - rect.top - rect.height / 2,
      });
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

  // --- Add task ---
  const handleAddTask = () => {
    setAddTaskTapped(true);
    setStepCompleted(true);
  };

  if (!open) return null;

  const PRIORITY_LEVELS = [
    { key: 'flex', label: 'FLEX', desc: 'Move freely between any days', color: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600' },
    { key: 'semi', label: 'SEMI', desc: 'Move within the current week only', color: 'bg-amber-500/15 border-amber-500/30 text-amber-600' },
    { key: 'fixed', label: 'FIXED', desc: 'Move within the current day only', color: 'bg-orange-500/15 border-orange-500/30 text-orange-600' },
    { key: 'lock', label: 'LOCK', desc: 'Cannot be moved at all', color: 'bg-red-500/15 border-red-500/30 text-red-600' },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-background/95 backdrop-blur-sm flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono tracking-wider text-muted-foreground/60">
                STEP {currentStep + 1} / {STEPS.length}
              </span>
            </div>
            <button onClick={() => { onClose(); setCurrentStep(0); resetStepState(); }} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-border/30">
            <motion.div
              className="h-full bg-primary"
              animate={{ width: `${((currentStep + (stepCompleted ? 1 : 0)) / STEPS.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 overflow-hidden">
            <AnimatePresence mode="wait">
              {showSuccess ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center"
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
                  <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4">
                    {step.icon}
                  </div>
                  <h3 className="text-sm font-display font-bold text-foreground tracking-tight mb-1">{step.title}</h3>
                  <p className="text-[11px] font-mono text-muted-foreground/70 text-center mb-6 leading-relaxed max-w-[280px]">
                    {step.instruction}
                  </p>

                  {/* Interactive area */}
                  <div className="w-full bg-muted/20 border border-border/40 rounded-sm p-4 min-h-[180px] flex flex-col items-center justify-center relative">

                    {/* TAP TO EDIT */}
                    {step.id === 'tap-edit' && (
                      <div className="w-full space-y-3">
                        <div
                          onClick={handleTapTask}
                          className="w-full bg-card border border-border/60 rounded-sm p-3 cursor-pointer hover:border-primary/30 transition-all active:scale-[0.98]"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-1 h-8 rounded-full bg-emerald-500/40" />
                            <div>
                              <div className="text-[12px] font-mono text-foreground font-medium">Morning workout</div>
                              <div className="text-[10px] font-mono text-muted-foreground/50">30 min · FLEX</div>
                            </div>
                          </div>
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
                        className={`w-full bg-card border rounded-sm p-3 cursor-pointer transition-all active:scale-[0.98] select-none ${
                          taskCompleted
                            ? 'border-primary/30 bg-primary/5'
                            : 'border-border/60 hover:border-primary/30'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-1 h-8 rounded-full transition-colors ${taskCompleted ? 'bg-primary/60' : 'bg-emerald-500/40'}`} />
                          <div className="flex-1">
                            <div className={`text-[12px] font-mono font-medium transition-colors ${taskCompleted ? 'text-primary line-through' : 'text-foreground'}`}>
                              Review presentation
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground/50">45 min · SEMI</div>
                          </div>
                          {taskCompleted && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="text-primary"
                            >
                              <CheckCircle2 size={16} />
                            </motion.div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* HOLD TO DRAG */}
                    {step.id === 'hold-drag' && (
                      <div className="w-full space-y-3">
                        <div className="relative">
                          <div
                            ref={taskRef}
                            onMouseDown={handleHoldStart}
                            onMouseUp={handleHoldEnd}
                            onMouseMove={handleDragMove}
                            onMouseLeave={handleHoldEnd}
                            onTouchStart={handleHoldStart}
                            onTouchEnd={handleHoldEnd}
                            onTouchMove={handleDragMove}
                            style={isDragging ? {
                              transform: `translate(${dragPosition.x}px, ${dragPosition.y}px)`,
                              zIndex: 10,
                              position: 'relative' as const,
                            } : droppedInTarget ? { opacity: 0.3 } : {}}
                            className={`w-full bg-card border rounded-sm p-3 cursor-grab transition-shadow select-none ${
                              isDragging ? 'border-primary/40 shadow-lg scale-105' : 'border-border/60'
                            } ${holdProgress > 0 && !isDragging ? 'border-primary/30' : ''}`}
                          >
                            <div className="flex items-center gap-2">
                              <div className="relative">
                                <div className="w-1 h-8 rounded-full bg-amber-500/40" />
                                {holdProgress > 0 && !isDragging && (
                                  <svg className="absolute -inset-1.5 w-[calc(100%+12px)] h-[calc(100%+12px)]" viewBox="0 0 20 44">
                                    <circle
                                      cx="10" cy="22" r="8"
                                      fill="none"
                                      stroke="hsl(var(--primary))"
                                      strokeWidth="2"
                                      strokeDasharray={`${holdProgress * 50} 50`}
                                      strokeLinecap="round"
                                      className="transition-all"
                                    />
                                  </svg>
                                )}
                              </div>
                              <div>
                                <div className="text-[12px] font-mono text-foreground font-medium">Team standup</div>
                                <div className="text-[10px] font-mono text-muted-foreground/50">15 min · SEMI</div>
                              </div>
                              <GripVertical size={14} className="ml-auto text-muted-foreground/30" />
                            </div>
                          </div>
                        </div>

                        {/* Drop target */}
                        <div
                          ref={targetRef}
                          className={`w-full border-2 border-dashed rounded-sm p-4 flex items-center justify-center transition-colors ${
                            droppedInTarget
                              ? 'border-primary/40 bg-primary/5'
                              : isDragging
                                ? 'border-primary/30 bg-primary/5'
                                : 'border-border/30 bg-muted/10'
                          }`}
                        >
                          <span className="text-[10px] font-mono text-muted-foreground/40 tracking-wider">
                            {droppedInTarget ? '✓ DROPPED' : 'DROP HERE'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* PRIORITY INFO */}
                    {step.id === 'priority' && (
                      <div className="w-full space-y-2">
                        {PRIORITY_LEVELS.map(p => (
                          <button
                            key={p.key}
                            onClick={() => handlePriorityTap(p.key)}
                            className={`w-full text-left border rounded-sm p-2.5 transition-all ${p.color} ${
                              priorityTapped.has(p.key) ? 'opacity-100' : 'opacity-60 hover:opacity-80'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-mono font-bold tracking-wider">{p.label}</span>
                              {priorityTapped.has(p.key) && <CheckCircle2 size={12} />}
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
                            className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary hover:bg-primary/20 transition-all active:scale-95"
                          >
                            <Plus size={24} strokeWidth={1.5} />
                          </button>
                        ) : (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="w-full bg-card border border-primary/30 rounded-sm p-3"
                          >
                            <div className="text-[10px] font-mono text-primary tracking-wider mb-2">NEW TASK CREATED</div>
                            <div className="flex items-center gap-2">
                              <div className="w-1 h-6 rounded-full bg-emerald-500/40" />
                              <div className="text-[12px] font-mono text-foreground font-medium">My new task</div>
                            </div>
                          </motion.div>
                        )}
                        <p className="text-[9px] font-mono text-muted-foreground/40 text-center">
                          In the real app, you can also drag on an empty timeline slot
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Hint */}
                  <div className="mt-3 px-3 py-2 bg-primary/5 border border-primary/10 rounded-sm w-full">
                    <p className="text-[10px] font-mono text-primary/60 leading-relaxed text-center">{step.hint}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border/30">
            <button
              onClick={handleNext}
              disabled={!stepCompleted}
              className={`w-full py-3 rounded-sm text-[12px] font-mono tracking-wider transition-all ${
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
