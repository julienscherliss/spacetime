import { motion } from 'framer-motion';
import { Calendar, Layers, Repeat, Target, BarChart3, Zap } from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const features = [
  {
    icon: Calendar,
    label: 'TIMELINE VIEW',
    desc: 'Your entire day mapped across a clean, scrollable timeline. Drag to reschedule. Resize to adjust.',
  },
  {
    icon: Layers,
    label: 'PRIORITY ESCALATION',
    desc: 'Tasks gain urgency as you move them. FLEX → SEMI → FIXED → LOCK. The system enforces your intent.',
  },
  {
    icon: Repeat,
    label: 'LINKED RECURRENCE',
    desc: 'Routines that stay connected. Edit one, update the series. Detach when you need to deviate.',
  },
  {
    icon: Target,
    label: 'FOCUS MODE',
    desc: 'Zero distractions. One task, one timer, full attention. Complete it or carry it forward.',
  },
  {
    icon: BarChart3,
    label: 'ANALYTICS',
    desc: 'Completion rates, tag allocation, activity heatmaps. Understand where your time actually goes.',
  },
  {
    icon: Zap,
    label: 'LIBRARY',
    desc: 'Tasks without a day. A staging area for things that matter but don\'t have a slot yet.',
  },
];

interface LandingFeatureGridProps {
  activeIndex?: number;
  onSelect?: (index: number) => void;
}

export function LandingFeatureGrid({ activeIndex, onSelect }: LandingFeatureGridProps = {}) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3"
      style={{ gridAutoRows: '1fr' }}
    >
      {features.map((feature, index) => {
        const isActive = activeIndex === index;
        return (
          <motion.div
            key={feature.label}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-40px' }}
            custom={index}
            variants={fadeUp}
            className="min-h-0 min-w-0"
          >
            <button
              type="button"
              onClick={() => onSelect?.(index)}
              className={`relative w-full overflow-hidden rounded-md border text-left shadow-sm transition-colors ${
                isActive
                  ? 'border-primary/60'
                  : 'border-border/40 hover:border-foreground/20'
              }`}
            >
              <div aria-hidden="true" className="block w-full pt-[100%]" />
              <div className="absolute inset-0 flex h-full flex-col justify-between gap-3 p-3 sm:gap-4 sm:p-5">
                <div className="min-w-0">
                  <feature.icon
                    size={16}
                    className={`mb-3 flex-shrink-0 transition-colors ${
                      isActive ? 'text-primary' : 'text-primary/70'
                    }`}
                  />
                  <div className="mb-2 text-[8px] font-mono tracking-[0.2em] text-muted-foreground/50 sm:text-[9px]">
                    {feature.label}
                  </div>
                </div>

                <p className="overflow-hidden text-[10px] font-mono leading-relaxed text-muted-foreground/70 line-clamp-3 sm:text-[12px] sm:line-clamp-4">
                  {feature.desc}
                </p>
              </div>
            </button>
          </motion.div>
        );
      })}
    </div>
  );
}
