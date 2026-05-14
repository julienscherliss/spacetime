import { useRef } from 'react';
import { motion, useScroll, useTransform, MotionValue } from 'framer-motion';
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
    tint: 'hsl(12 76% 50%)', // primary burnt orange
  },
  {
    src: mockupDetail,
    label: 'TASK',
    title: 'Just enough surface.',
    caption: 'Notes, subtasks, and tags — no menus to dig through.',
    tint: 'hsl(220 70% 55%)',
  },
  {
    src: mockupDay,
    label: 'DAY',
    title: 'Time, made visible.',
    caption: 'Your day as a living block — drag to reshape it in seconds.',
    tint: 'hsl(160 50% 40%)',
  },
  {
    src: mockupAnalytics,
    label: 'ANALYTICS',
    title: 'Where your hours go.',
    caption: 'Patterns, allocation, and goals — without the dashboard bloat.',
    tint: 'hsl(280 50% 50%)',
  },
];

function Slide({
  index,
  total,
  progress,
  src,
  label,
  title,
  caption,
}: {
  index: number;
  total: number;
  progress: MotionValue<number>;
  src: string;
  label: string;
  title: string;
  caption: string;
}) {
  const start = index / total;
  const end = (index + 1) / total;
  const mid = (start + end) / 2;
  const span = 1 / total;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  // Phone: travels in from below-right, settles, exits up-left
  const opacity = useTransform(
    progress,
    [
      clamp(start - 0.02),
      clamp(mid - span * 0.35),
      clamp(mid + span * 0.35),
      clamp(end + 0.02),
    ],
    [0, 1, 1, 0],
  );
  const scale = useTransform(progress, [start, mid, end], [0.85, 1, 0.92]);
  const y = useTransform(progress, [start, mid, end], [120, 0, -120]);
  const x = useTransform(progress, [start, mid, end], [40, 0, -40]);
  const rotate = useTransform(progress, [start, mid, end], [4, 0, -3]);

  // Caption: settles a hair earlier than the phone for that "hero copy" feel
  const captionOpacity = useTransform(
    progress,
    [start, mid - span * 0.2, mid + span * 0.2, end],
    [0, 1, 1, 0],
  );
  const captionY = useTransform(progress, [start, mid, end], [30, 0, -30]);

  return (
    <motion.div
      style={{ opacity }}
      className="absolute inset-0 flex flex-col lg:flex-row items-center justify-center gap-6 lg:gap-20 px-6 lg:px-16"
    >
      {/* Caption block */}
      <motion.div
        style={{ opacity: captionOpacity, y: captionY }}
        className="order-1 lg:order-1 max-w-md text-center lg:text-left"
      >
        <div className="text-[10px] font-mono text-muted-foreground/60 tracking-[0.3em] mb-3">
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')} · {label}
        </div>
        <h3 className="font-display text-2xl sm:text-3xl lg:text-5xl font-bold tracking-tight leading-[1.05] mb-3 lg:mb-5">
          {title}
        </h3>
        <p className="text-[12px] sm:text-sm font-mono text-muted-foreground/70 leading-relaxed max-w-sm mx-auto lg:mx-0">
          {caption}
        </p>
      </motion.div>

      {/* Phone */}
      <motion.div
        style={{ scale, y, x, rotate }}
        className="order-2 lg:order-2 relative"
      >
        <img
          src={src}
          alt={`${label} screen`}
          className="relative z-10 max-h-[55vh] sm:max-h-[65vh] lg:max-h-[78vh] w-auto object-contain
                     drop-shadow-[0_40px_60px_rgba(0,0,0,0.18)]
                     [filter:drop-shadow(0_2px_3px_rgba(0,0,0,0.08))_drop-shadow(0_30px_50px_rgba(0,0,0,0.18))]"
          draggable={false}
        />
      </motion.div>
    </motion.div>
  );
}

function AmbientGlow({
  progress,
  total,
  tints,
}: {
  progress: MotionValue<number>;
  total: number;
  tints: string[];
}) {
  // Build interpolation stops across slides
  const stops = tints.map((_, i) => (i + 0.5) / total);
  const x = useTransform(progress, stops, ['25%', '70%', '30%', '75%'].slice(0, total));
  const y = useTransform(progress, stops, ['30%', '65%', '70%', '35%'].slice(0, total));
  const color = useTransform(progress, stops, tints);

  return (
    <motion.div
      style={{ left: x, top: y, background: color }}
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full opacity-[0.18] blur-[140px] mix-blend-multiply"
    />
  );
}

function ProgressRail({ progress }: { progress: MotionValue<number> }) {
  const height = useTransform(progress, [0, 1], ['0%', '100%']);
  return (
    <div className="absolute right-5 top-1/2 -translate-y-1/2 hidden md:block">
      <div className="relative w-px h-40 bg-foreground/10 overflow-hidden">
        <motion.div
          style={{ height }}
          className="absolute top-0 left-0 w-full bg-foreground/70"
        />
      </div>
    </div>
  );
}

export function MockupShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const total = slides.length;
  const tints = slides.map((s) => s.tint);

  return (
    <section
      ref={sectionRef}
      className="relative"
      style={{ height: `${total * 110}vh` }}
      aria-label="Product showcase"
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-background">
        {/* Ambient color glow that drifts as you scroll */}
        <AmbientGlow progress={scrollYProgress} total={total} tints={tints} />

        {/* Grid backdrop */}
        <div
          className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
          }}
        />

        {/* Vignette top/bottom for cinematic feel */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background to-transparent pointer-events-none z-20" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none z-20" />

        {/* Slides */}
        <div className="absolute inset-0">
          {slides.map((s, i) => (
            <Slide
              key={s.label}
              index={i}
              total={total}
              progress={scrollYProgress}
              src={s.src}
              label={s.label}
              title={s.title}
              caption={s.caption}
            />
          ))}
        </div>

        {/* Progress rail */}
        <ProgressRail progress={scrollYProgress} />

        {/* Section label */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-30">
          <span className="text-[9px] font-mono text-muted-foreground/40 tracking-[0.3em]">
            A LOOK INSIDE
          </span>
        </div>
      </div>
    </section>
  );
}
