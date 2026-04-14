import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
// FeatureCarousel temporarily removed — will re-add with video content
// import { FeatureCarousel } from '@/components/FeatureCarousel';
import { Layers, ArrowRight, Zap, Target, Calendar, Repeat, BarChart3 } from 'lucide-react';
import { GravityCanvas } from '@/components/GravityCanvas';
import faviconUrl from '/favicon.png';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.12 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
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

export default function Landing() {
  const navigate = useNavigate();

  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [carouselIndex, setCarouselIndex] = useState<number | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/40">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <img src={faviconUrl} alt="Spacetime" className="w-4 h-4" />
            <span className="font-display text-sm font-bold tracking-tight">spacetime</span>
          </div>
          <button
            onClick={() => navigate('/auth')}
            className="text-[10px] font-mono tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            SIGN IN
          </button>
        </div>
      </nav>

      {/* Hero with gravity animation */}
      <section className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden">
        <div className="absolute inset-0 bg-background">
          <GravityCanvas />
        </div>
        {/* Gradient overlay so text is readable */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <motion.div
            initial="hidden"
            animate="visible"
            custom={0}
            variants={fadeUp}
            className="mb-8"
          >
            <div className="inline-block px-3 py-1 border border-border/60 rounded-full bg-background/40 backdrop-blur-sm">
              <span className="text-[9px] font-mono text-muted-foreground/60 tracking-[0.2em]">
                TIME MANAGEMENT · REIMAGINED
              </span>
            </div>
          </motion.div>

          <motion.h1
            initial="hidden"
            animate="visible"
            custom={1}
            variants={fadeUp}
            className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-8"
          >
            <span className="block text-primary">rediscover</span>
            your time
          </motion.h1>

          <motion.p
            initial="hidden"
            animate="visible"
            custom={2}
            variants={fadeUp}
            className="text-sm font-mono max-w-lg mx-auto leading-relaxed mb-10 sm:text-[sidebar-accent-foreground] text-popover-foreground opacity-85"
          >
            Spacetime turns your schedule into a tangible landscape. A system for testing, refining, and reshaping how you spend your time. Watch priorities escalate. Build routines that stick. Clearing space for what matters.
          </motion.p>

          <motion.div
            initial="hidden"
            animate="visible"
            custom={3}
            variants={fadeUp}
            className="flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <button
              onClick={() => navigate('/auth', { state: { plan: 'yearly' } })}
              className="group flex items-center gap-2 px-6 py-3 bg-foreground text-background text-[11px] font-mono tracking-widest rounded-sm hover:bg-foreground/90 transition-colors"
            >
              START FREE TRIAL
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
            <span className="text-[9px] font-mono text-muted-foreground/40 tracking-wider">
              30 DAYS FREE · THEN $2/MO
            </span>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            custom={0}
            variants={fadeUp}
            className="text-center mb-14"
          >
            <span className="text-[9px] font-mono text-muted-foreground/40 tracking-[0.25em]">
              BUILT FOR PEOPLE WHO THINK IN SYSTEMS
            </span>
          </motion.div>

          {/* Feature carousel — temporarily removed, waiting for video assets */}

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {features.map((f, i) => (
              <motion.div
                key={f.label}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-40px' }}
                custom={i}
                variants={fadeUp}
                className="relative"
                style={{ height: 0, paddingBottom: '100%' }}
              >
                <button
                  onClick={() => {}}
                  className="group absolute inset-0 border border-border/40 rounded-md hover:border-foreground/20 transition-all text-left cursor-pointer p-4 sm:p-5 flex flex-col justify-center overflow-hidden"
                >
                  <f.icon
                    size={16}
                    className="text-primary/70 mb-3 group-hover:text-primary transition-colors flex-shrink-0"
                  />
                  <div className="text-[8px] sm:text-[9px] font-mono text-muted-foreground/50 tracking-[0.2em] mb-2 flex-shrink-0">
                    {f.label}
                  </div>
                  <p className="text-[10px] sm:text-[12px] font-mono text-muted-foreground/70 leading-relaxed line-clamp-4">
                    {f.desc}
                  </p>
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="h-px bg-border/40" />
      </div>

      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={0}
            variants={fadeUp}
          >
            <span className="text-[9px] font-mono text-muted-foreground/40 tracking-[0.25em] block mb-6">
              PHILOSOPHY
            </span>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mb-6">
              Less interface.
              <br />
              More intention.
            </h2>
            <p className="text-[12px] font-mono text-muted-foreground/60 leading-relaxed max-w-md mx-auto">
              Most task apps bury you in features. Spacetime strips everything back to the physics 
              of your day: blocks of time, levels of commitment, and the momentum of completing what matters.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="h-px bg-border/40" />
      </div>

      <section className="py-20 px-6">
        <div className="max-w-md mx-auto text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={0}
            variants={fadeUp}
          >
            <span className="text-[9px] font-mono text-muted-foreground/40 tracking-[0.25em] block mb-6">
              PRICING
            </span>
            <h2 className="font-display text-2xl font-bold tracking-tight mb-2">
              Fully featured. 30 days free.
            </h2>
            <p className="text-[12px] font-mono text-muted-foreground/50 mb-8">
              30-day free trial · No credit card required
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={1}
            variants={fadeUp}
            className="grid grid-cols-2 gap-3 mb-8"
          >
            <button
              onClick={() => setSelectedPlan('monthly')}
              className={`border rounded-md p-5 text-left transition-all ${
                selectedPlan === 'monthly'
                  ? 'border-foreground/40 bg-muted/20'
                  : 'border-border/50 hover:border-foreground/20'
              }`}
            >
              <div className="text-[9px] font-mono text-muted-foreground/50 tracking-widest mb-2">MONTHLY</div>
              <div className="text-2xl font-display font-bold">$3</div>
              <div className="text-[10px] font-mono text-muted-foreground/50">/ month</div>
            </button>
            <button
              onClick={() => setSelectedPlan('yearly')}
              className={`border rounded-md p-5 relative text-left transition-all ${
                selectedPlan === 'yearly'
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-primary/20 hover:border-primary/40'
              }`}
            >
              <div className="absolute -top-2 right-3 px-2 py-0.5 bg-primary text-primary-foreground text-[8px] font-mono tracking-wider rounded-full">
                SAVE 33%
              </div>
              <div className="text-[9px] font-mono text-muted-foreground/50 tracking-widest mb-2">YEARLY</div>
              <div className="text-2xl font-display font-bold">$2</div>
              <div className="text-[10px] font-mono text-muted-foreground/50">/ mo · $24/yr</div>
            </button>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={2}
            variants={fadeUp}
          >
            <button
              onClick={() => navigate('/auth', { state: { plan: selectedPlan } })}
              className="group flex items-center gap-2 mx-auto px-6 py-3 bg-foreground text-background text-[11px] font-mono tracking-widest rounded-sm hover:bg-foreground/90 transition-colors"
            >
              BEGIN YOUR TRIAL
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
            <p className="text-[9px] font-mono text-muted-foreground/40 mt-3">
              {selectedPlan === 'yearly' ? '$24 BILLED ANNUALLY AFTER TRIAL' : '$3 BILLED MONTHLY AFTER TRIAL'}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={faviconUrl} alt="Spacetime" className="w-3 h-3 opacity-40" />
            <span className="text-[10px] font-mono text-muted-foreground/40 tracking-wider">
              SPACETIME © {new Date().getFullYear()}
            </span>
          </div>
          <span className="text-[9px] font-mono text-muted-foreground/30 tracking-wider">
            BUILT WITH INTENTION
          </span>
        </div>
      </footer>
    </div>
  );
}
