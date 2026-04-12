import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Layers, ArrowRight, Zap, Target, Calendar, Repeat, BarChart3 } from 'lucide-react';

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
    label: 'WAITING ROOM',
    desc: 'Tasks without a day. A staging area for things that matter but don\'t have a slot yet.',
  },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/40">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-primary" />
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

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial="hidden"
            animate="visible"
            custom={0}
            variants={fadeUp}
            className="mb-6"
          >
            <div className="inline-block px-3 py-1 border border-border/60 rounded-full mb-6">
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
            className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6"
          >
            Your time is a
            <br />
            <span className="text-primary">physical space.</span>
          </motion.h1>

          <motion.p
            initial="hidden"
            animate="visible"
            custom={2}
            variants={fadeUp}
            className="text-sm sm:text-base font-mono text-muted-foreground/60 max-w-lg mx-auto leading-relaxed mb-10"
          >
            Spacetime turns your schedule into a tangible landscape. 
            Drag tasks through time. Watch priorities escalate. 
            Build routines that stick. No bloat — just clarity.
          </motion.p>

          <motion.div
            initial="hidden"
            animate="visible"
            custom={3}
            variants={fadeUp}
            className="flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <button
              onClick={() => navigate('/auth')}
              className="group flex items-center gap-2 px-6 py-3 bg-foreground text-background text-[11px] font-mono tracking-widest rounded-sm hover:bg-foreground/90 transition-colors"
            >
              START FREE TRIAL
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
            <span className="text-[9px] font-mono text-muted-foreground/40 tracking-wider">
              7 DAYS FREE · THEN $2/MO
            </span>
          </motion.div>
        </div>
      </section>

      {/* Visual divider */}
      <div className="max-w-5xl mx-auto px-6">
        <div className="h-px bg-border/40" />
      </div>

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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <motion.div
                key={f.label}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-40px' }}
                custom={i}
                variants={fadeUp}
                className="group border border-border/40 rounded-md p-5 hover:border-foreground/20 transition-all"
              >
                <f.icon
                  size={16}
                  className="text-primary/70 mb-3 group-hover:text-primary transition-colors"
                />
                <div className="text-[9px] font-mono text-muted-foreground/50 tracking-[0.2em] mb-2">
                  {f.label}
                </div>
                <p className="text-[12px] font-mono text-muted-foreground/70 leading-relaxed">
                  {f.desc}
                </p>
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
              Start free. Stay sharp.
            </h2>
            <p className="text-[12px] font-mono text-muted-foreground/50 mb-8">
              7-day free trial · No credit card required
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
            <div className="border border-border/50 rounded-md p-5">
              <div className="text-[9px] font-mono text-muted-foreground/50 tracking-widest mb-2">MONTHLY</div>
              <div className="text-2xl font-display font-bold">$3</div>
              <div className="text-[10px] font-mono text-muted-foreground/50">/ month</div>
            </div>
            <div className="border border-primary/30 rounded-md p-5 relative">
              <div className="absolute -top-2 right-3 px-2 py-0.5 bg-primary text-primary-foreground text-[8px] font-mono tracking-wider rounded-full">
                SAVE 33%
              </div>
              <div className="text-[9px] font-mono text-muted-foreground/50 tracking-widest mb-2">YEARLY</div>
              <div className="text-2xl font-display font-bold">$2</div>
              <div className="text-[10px] font-mono text-muted-foreground/50">/ mo · $24/yr</div>
            </div>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={2}
            variants={fadeUp}
          >
            <button
              onClick={() => navigate('/auth')}
              className="group flex items-center gap-2 mx-auto px-6 py-3 bg-foreground text-background text-[11px] font-mono tracking-widest rounded-sm hover:bg-foreground/90 transition-colors"
            >
              BEGIN YOUR TRIAL
              <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={12} className="text-muted-foreground/40" />
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
