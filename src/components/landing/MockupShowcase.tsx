import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import mockupTimer from '@/assets/mockup-focus-timer.png';
import mockupDetail from '@/assets/mockup-focus-detail.png';
import mockupDay from '@/assets/mockup-day-view.png';
import mockupAnalytics from '@/assets/mockup-analytics.png';

const slides = [
  {
    src: mockupTimer,
    label: 'FOCUS',
    title: 'One thing at a time.',
    caption: 'A timer that mirrors your scheduled block — press and hold to complete.',
  },
  {
    src: mockupDetail,
    label: 'TASK',
    title: 'Just enough surface.',
    caption: 'Notes, subtasks, and tags — no menus to dig through.',
  },
  {
    src: mockupDay,
    label: 'DAY',
    title: 'Time, made visible.',
    caption: 'Your day as a living block — drag to reshape it in seconds.',
  },
  {
    src: mockupAnalytics,
    label: 'ANALYTICS',
    title: 'Where your hours go.',
    caption: 'Patterns, allocation, and goals — without the dashboard bloat.',
  },
];

const clampIndex = (value: number, total: number) => Math.min(total - 1, Math.max(0, value));

function Slide({
  index,
  total,
  src,
  label,
  title,
  caption,
}: {
  index: number;
  total: number;
  src: string;
  label: string;
  title: string;
  caption: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-0 flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-24 px-6 lg:px-16"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="order-1 max-w-md text-center lg:text-left"
      >
        <div className="text-[10px] font-mono text-muted-foreground/50 tracking-[0.3em] mb-3">
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')} · {label}
        </div>
        <h3 className="font-display text-2xl sm:text-3xl lg:text-5xl font-bold tracking-tight leading-[1.05] mb-3 lg:mb-5">
          {title}
        </h3>
        <p className="text-[12px] sm:text-sm font-mono text-muted-foreground/70 leading-relaxed max-w-sm mx-auto lg:mx-0">
          {caption}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 1.02, y: -24 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="order-2 relative"
      >
        <img
          src={src}
          alt={`${label} screen`}
          className="relative z-10 max-h-[55vh] sm:max-h-[65vh] lg:max-h-[78vh] w-auto object-contain
                     [filter:drop-shadow(0_2px_3px_rgba(0,0,0,0.06))_drop-shadow(0_30px_60px_rgba(0,0,0,0.16))]"
          draggable={false}
        />
      </motion.div>
    </motion.div>
  );
}

function ProgressRail({
  activeIndex,
  total,
}: {
  activeIndex: number;
  total: number;
}) {
  return (
    <div className="absolute right-6 top-1/2 -translate-y-1/2 hidden md:flex flex-col items-center gap-3">
      <div className="relative w-px h-48 bg-foreground/10 overflow-hidden">
        <motion.div
          animate={{ height: `${((activeIndex + 1) / total) * 100}%` }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="absolute top-0 left-0 w-full bg-foreground/60"
        />
      </div>
      <span className="text-[9px] font-mono text-muted-foreground/40 tracking-[0.3em] [writing-mode:vertical-rl]">
        {String(total).padStart(2, '0')}
      </span>
    </div>
  );
}

export function MockupShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const total = slides.length;
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const update = () => {
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      if (scrollable <= 0) return;
      const progress = Math.min(1, Math.max(0, -rect.top / scrollable));
      const next = clampIndex(Math.floor(progress * total), total);
      setActiveIndex((current) => (current === next ? current : next));
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [total]);

  const activeSlide = slides[activeIndex];

  return (
    <section
      ref={sectionRef}
      className="relative"
      style={{ height: `${total * 100}vh` }}
      aria-label="Product showcase"
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-background">
        {/* Subtle grid backdrop */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
          }}
        />

        {/* Soft top/bottom vignettes */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background to-transparent pointer-events-none z-20" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent pointer-events-none z-20" />

        <div className="absolute inset-0">
          <AnimatePresence mode="wait">
            <Slide
              key={activeIndex}
              index={activeIndex}
              total={total}
              src={activeSlide.src}
              label={activeSlide.label}
              title={activeSlide.title}
              caption={activeSlide.caption}
            />
          </AnimatePresence>
        </div>

        <ProgressRail activeIndex={activeIndex} total={total} />

        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-30">
          <span className="text-[9px] font-mono text-muted-foreground/40 tracking-[0.3em]">
            A LOOK INSIDE
          </span>
        </div>
      </div>
    </section>
  );
}
