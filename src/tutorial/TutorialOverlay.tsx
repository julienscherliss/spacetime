import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useAnchorRect } from './useAnchorRect';
import type { TutorialStep } from './steps/part1';

interface Props {
  step: TutorialStep;
  stepNumber: number;
  totalSteps: number;
  checklistProgress?: boolean[];
  onAdvance: () => void;
  onSkip: () => void;
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const PAD = 8;
const RADIUS = 8;
const TOOLTIP_W = 320;
const TOOLTIP_GAP = 16;

export function TutorialOverlay({
  step,
  stepNumber,
  totalSteps,
  checklistProgress,
  onAdvance,
  onSkip,
}: Props) {
  const rect = useAnchorRect(step.anchor);
  const [subIdx, setSubIdx] = useState(0); // 0..N for body/body2/body3

  // Reset sub-tooltip index whenever the step changes.
  useEffect(() => {
    setSubIdx(0);
  }, [step.id]);

  const bodies = useMemo(
    () => [step.body, step.body2, step.body3].filter(Boolean) as string[],
    [step.id]
  );
  const isLastBody = subIdx >= bodies.length - 1;
  const currentBody = bodies[subIdx] ?? step.body;

  const viewport = useMemo(
    () => ({
      w: typeof window !== 'undefined' ? window.innerWidth : 1024,
      h: typeof window !== 'undefined' ? window.innerHeight : 768,
    }),
    [rect?.top, rect?.left, rect?.width, rect?.height]
  );

  // Centered (no anchor) modal or anchored tooltip card.
  const isCentered = !step.anchor || !rect;

  // Position the tooltip near the anchor, preferring below, falling back above
  // or beside depending on space.
  let tooltipStyle: React.CSSProperties = {
    top: viewport.h / 2 - 80,
    left: viewport.w / 2 - TOOLTIP_W / 2,
    width: TOOLTIP_W,
  };
  if (!isCentered && rect) {
    const spaceBelow = viewport.h - (rect.top + rect.height);
    const placeBelow = spaceBelow > 200;
    const top = placeBelow
      ? rect.top + rect.height + TOOLTIP_GAP
      : Math.max(16, rect.top - TOOLTIP_GAP - 160);
    let left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    left = Math.max(16, Math.min(viewport.w - TOOLTIP_W - 16, left));
    tooltipStyle = { top, left, width: TOOLTIP_W };
  }

  const advance = () => {
    if (!isLastBody) {
      setSubIdx((i) => i + 1);
      return;
    }
    onAdvance();
  };

  // If the step waits for a real user action (awaitEvent), do NOT show a
  // manual advance button on the final body — the user must actually
  // perform the action. Earlier sub-bodies still get a "Next" to page
  // through the explanatory text.
  const requiresAction = !!step.awaitEvent;
  const showContinue = !isLastBody || (step.cta !== null && !requiresAction);
  const ctaLabel = !isLastBody ? 'Next' : step.cta ?? 'Continue';

  const overlay = (
    <div className="fixed inset-0 z-[9998] pointer-events-none">
      {/* Dim mask with cutout */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ background: 'transparent' }}
      >
        <defs>
          <mask id="tutorial-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <motion.rect
                initial={false}
                animate={{
                  x: rect.left - PAD,
                  y: rect.top - PAD,
                  width: rect.width + PAD * 2,
                  height: rect.height + PAD * 2,
                }}
                transition={{ duration: 0.24, ease: EASE }}
                rx={RADIUS}
                ry={RADIUS}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="hsl(var(--background))"
          fillOpacity={0.72}
          mask="url(#tutorial-mask)"
        />
        {/* Hairline ring around the cutout */}
        {rect && (
          <motion.rect
            initial={false}
            animate={{
              x: rect.left - PAD,
              y: rect.top - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
            }}
            transition={{ duration: 0.24, ease: EASE }}
            rx={RADIUS}
            ry={RADIUS}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeOpacity={0.6}
            strokeWidth={1}
          />
        )}
      </svg>

      {/* Tooltip card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${step.id}-${subIdx}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          transition={{ duration: 0.24, ease: EASE }}
          className="absolute pointer-events-auto bg-background border border-border rounded-sm p-4 font-mono"
          style={tooltipStyle}
        >
          {step.title && subIdx === 0 && (
            <h3 className="text-[15px] font-display font-medium tracking-tight text-foreground mb-2 leading-snug">
              {step.title}
            </h3>
          )}
          <p className="text-[12px] leading-relaxed text-foreground/80">
            {currentBody}
          </p>

          {step.checklist && checklistProgress && subIdx === bodies.length - 1 && (
            <ul className="mt-3 space-y-1.5">
              {step.checklist.map((label, i) => (
                <li
                  key={label}
                  className="flex items-center gap-2 text-[11px] tracking-wide"
                >
                  <span
                    className={`inline-block w-3 h-3 border ${
                      checklistProgress[i]
                        ? 'bg-primary border-primary'
                        : 'border-border'
                    }`}
                  />
                  <span
                    className={
                      checklistProgress[i]
                        ? 'text-foreground/90 line-through decoration-foreground/30'
                        : 'text-foreground/70'
                    }
                  >
                    {label}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="text-[10px] tracking-[0.18em] text-muted-foreground/60 uppercase">
              {String(stepNumber).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}
            </span>
            <div className="flex items-center gap-2">
              {isLastBody && requiresAction && (
                <span className="text-[10px] tracking-[0.18em] text-primary/80 uppercase animate-pulse">
                  Awaiting action
                </span>
              )}
              <button
                onClick={onSkip}
                className="text-[10px] tracking-[0.18em] text-muted-foreground/60 hover:text-foreground uppercase transition-colors"
              >
                Skip
              </button>
              {showContinue && (
                <button
                  onClick={advance}
                  className="text-[11px] tracking-[0.14em] uppercase bg-foreground text-background px-3 py-1.5 rounded-sm hover:bg-foreground/90 transition-colors"
                >
                  {ctaLabel}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );

  return createPortal(overlay, document.body);
}