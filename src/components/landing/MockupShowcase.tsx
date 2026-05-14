import { useRef } from 'react';
import { motion, useScroll, useTransform, MotionValue } from 'framer-motion';
import mockupTimer from '@/assets/mockup-focus-timer.png';
import mockupDetail from '@/assets/mockup-focus-detail.png';
import mockupDay from '@/assets/mockup-day-view.png';
import mockupAnalytics from '@/assets/mockup-analytics.png';

const slides = [
  { src: mockupTimer, label: 'FOCUS', caption: 'Press and hold to complete.' },
  { src: mockupDetail, label: 'TASK', caption: 'Notes, subtasks, tags.' },
  { src: mockupDay, label: 'DAY', caption: 'See your time as it flows.' },
  { src: mockupAnalytics, label: 'ANALYTICS', caption: 'Where your hours actually go.' },
];

function Slide({
  index,
  total,
  progress,
  src,
  label,
  caption,
}: {
  index: number;
  total: number;
  progress: MotionValue<number>;
  src: string;
  label: string;
  caption: string;
}) {
  // Each slide owns a window of scroll progress
  const start = index / total;
  const end = (index + 1) / total;
  const mid = (start + end) / 2;

  const opacity = useTransform(
    progress,
    [start, mid - 0.04, mid + 0.04, end],
    [0, 1, 1, 0],
  );
  const scale = useTransform(
    progress,
    [start, mid, end],
    [0.88, 1, 0.92],
  );
  const y = useTransform(progress, [start, mid, end], [60, 0, -40]);
  const captionOpacity = useTransform(
    progress,
    [start, mid - 0.02, mid + 0.02, end],
    [0, 1, 1, 0],
  );

  return (
    <motion.div
      style={{ opacity, scale, y }}
      className="absolute inset-0 flex flex-col items-center justify-center px-6"
    >
      <motion.div
        style={{ opacity: captionOpacity }}
        className="mb-6 sm:mb-8 text-center"
      >
        <div className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.25em] mb-2">
          {label}
        </div>
        <div className="text-[12px] sm:text-sm font-mono text-foreground/80">
          {caption}
        </div>
      </motion.div>
      <img
        src={src}
        alt={`${label} screen`}
        className="max-h-[60vh] sm:max-h-[70vh] w-auto object-contain drop-shadow-[0_30px_60px_rgba(0,0,0,0.18)]"
        draggable={false}
      />
    </motion.div>
  );
}

export function MockupShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  // Section is tall (one viewport per slide + a tail) so scroll drives the sequence
  const total = slides.length;

  return (
    <section
      ref={sectionRef}
      className="relative"
      style={{ height: `${total * 100}vh` }}
      aria-label="Product showcase"
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-background">
        {/* subtle backdrop grid */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="absolute inset-0">
          {slides.map((s, i) => (
            <Slide
              key={s.label}
              index={i}
              total={total}
              progress={scrollYProgress}
              {...s}
            />
          ))}
        </div>
        {/* Progress dots */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2">
          {slides.map((s, i) => {
            const start = i / total;
            const end = (i + 1) / total;
            const mid = (start + end) / 2;
            const dotOpacity = useTransform(
              scrollYProgress,
              [start, mid, end],
              [0.25, 1, 0.25],
            );
            const dotScale = useTransform(
              scrollYProgress,
              [start, mid, end],
              [1, 1.6, 1],
            );
            return (
              <motion.span
                key={s.label}
                style={{ opacity: dotOpacity, scale: dotScale }}
                className="block w-1.5 h-1.5 rounded-full bg-foreground"
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
