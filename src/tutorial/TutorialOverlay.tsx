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
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const PAD = 8;
const RADIUS = 8;
const TOOLTIP_W = 320;
const TOOLTIP_GAP = 16;
const TOOLTIP_H_EST = 200; // conservative estimate for placement math
const SAFE_MARGIN = 16;

export function TutorialOverlay({
  step,
  stepNumber,
  totalSteps,
  checklistProgress,
  onAdvance,
}: Props) {
  const rect = useAnchorRect(step.anchor);
  const excludeRect = useAnchorRect(step.dimExclude ?? null);
  const [subIdx, setSubIdx] = useState(0); // 0..N for body/body2/body3
  // Track any open date-picker popover so the tooltip doesn't sit on top of it.
  const [avoidRect, setAvoidRect] = useState<{top:number;left:number;width:number;height:number} | null>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = document.querySelector<HTMLElement>('[data-date-autocomplete]');
      if (!el) {
        setAvoidRect((p) => (p ? null : p));
      } else {
        const r = el.getBoundingClientRect();
        setAvoidRect((p) => {
          if (p && Math.abs(p.top-r.top)<0.5 && Math.abs(p.left-r.left)<0.5 && Math.abs(p.width-r.width)<0.5 && Math.abs(p.height-r.height)<0.5) return p;
          return { top: r.top, left: r.left, width: r.width, height: r.height };
        });
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, []);

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

  let tooltipStyle: React.CSSProperties = {
    top: viewport.h / 2 - 80,
    left: viewport.w / 2 - TOOLTIP_W / 2,
    width: TOOLTIP_W,
  };
  if (!isCentered && rect) {
    // Combine the anchor with any active avoid-rect (e.g. open date picker)
    // so the tooltip never lands on top of an interactive popover.
    const union = avoidRect
      ? {
          top: Math.min(rect.top, avoidRect.top),
          left: Math.min(rect.left, avoidRect.left),
          right: Math.max(rect.left + rect.width, avoidRect.left + avoidRect.width),
          bottom: Math.max(rect.top + rect.height, avoidRect.top + avoidRect.height),
        }
      : {
          top: rect.top,
          left: rect.left,
          right: rect.left + rect.width,
          bottom: rect.top + rect.height,
        };
    const anchorPadded = {
      top: union.top - PAD,
      left: union.left - PAD,
      right: union.right + PAD,
      bottom: union.bottom + PAD,
    };
    const spaceBelow = viewport.h - anchorPadded.bottom - SAFE_MARGIN;
    const spaceAbove = anchorPadded.top - SAFE_MARGIN;
    const spaceRight = viewport.w - anchorPadded.right - SAFE_MARGIN;
    const spaceLeft = anchorPadded.left - SAFE_MARGIN;

    const candidates: Array<{ side: string; fits: boolean; space: number; top: number; left: number }> = [];

    // Below
    {
      const top = anchorPadded.bottom + TOOLTIP_GAP;
      let left = (anchorPadded.left + anchorPadded.right) / 2 - TOOLTIP_W / 2;
      left = Math.max(SAFE_MARGIN, Math.min(viewport.w - TOOLTIP_W - SAFE_MARGIN, left));
      candidates.push({ side: 'below', fits: spaceBelow >= TOOLTIP_H_EST, space: spaceBelow, top, left });
    }
    // Above
    {
      const top = anchorPadded.top - TOOLTIP_GAP - TOOLTIP_H_EST;
      let left = (anchorPadded.left + anchorPadded.right) / 2 - TOOLTIP_W / 2;
      left = Math.max(SAFE_MARGIN, Math.min(viewport.w - TOOLTIP_W - SAFE_MARGIN, left));
      candidates.push({ side: 'above', fits: spaceAbove >= TOOLTIP_H_EST, space: spaceAbove, top, left });
    }
    // Right
    {
      const left = anchorPadded.right + TOOLTIP_GAP;
      let top = (anchorPadded.top + anchorPadded.bottom) / 2 - TOOLTIP_H_EST / 2;
      top = Math.max(SAFE_MARGIN, Math.min(viewport.h - TOOLTIP_H_EST - SAFE_MARGIN, top));
      candidates.push({ side: 'right', fits: spaceRight >= TOOLTIP_W, space: spaceRight, top, left });
    }
    // Left
    {
      const left = anchorPadded.left - TOOLTIP_GAP - TOOLTIP_W;
      let top = (anchorPadded.top + anchorPadded.bottom) / 2 - TOOLTIP_H_EST / 2;
      top = Math.max(SAFE_MARGIN, Math.min(viewport.h - TOOLTIP_H_EST - SAFE_MARGIN, top));
      candidates.push({ side: 'left', fits: spaceLeft >= TOOLTIP_W, space: spaceLeft, top, left });
    }

    const fitting = candidates.filter((c) => c.fits);
    const pick = (fitting.length ? fitting : candidates).sort((a, b) => b.space - a.space)[0];
    tooltipStyle = { top: pick.top, left: pick.left, width: TOOLTIP_W };
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
            {excludeRect && (
              <motion.rect
                initial={false}
                animate={{
                  x: excludeRect.left,
                  y: excludeRect.top,
                  width: excludeRect.width,
                  height: excludeRect.height,
                }}
                transition={{ duration: 0.24, ease: EASE }}
                fill="black"
              />
            )}
            {avoidRect && (
              <motion.rect
                initial={false}
                animate={{
                  x: avoidRect.left,
                  y: avoidRect.top,
                  width: avoidRect.width,
                  height: avoidRect.height,
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