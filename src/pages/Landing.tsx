import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FeatureCarousel } from '@/components/FeatureCarousel';
import { ArrowRight } from 'lucide-react';
import { GravityCanvas } from '@/components/GravityCanvas';
import { LandingFeatureGrid } from '@/components/landing/LandingFeatureGrid';
import { isNativePlatform, isIOSNative } from '@/utils/nativePlatform';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import faviconUrl from '/favicon.png';

// Resolved at click-time from the latest GitHub Release of this repo.
const GITHUB_RELEASES_API = "https://api.github.com/repos/julienscherliss/spacetime/releases/latest";
const IOS_TESTFLIGHT_URL = "https://testflight.apple.com/join/XMMVkKVW";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.12 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export default function Landing() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [activeFeature, setActiveFeature] = useState<number>(0);
  const [downloading, setDownloading] = useState(false);

  const triggerDownload = (url: string, filename: string) => {
    // Use a hidden anchor with `download` so the browser saves the file in
    // place instead of navigating away from the homepage.
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDesktopDownload = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(GITHUB_RELEASES_API, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) throw new Error('release fetch failed');
      const data = await res.json();
      const assets: Array<{ name: string; browser_download_url: string }> = data.assets || [];
      const dmg = assets.find((a) => a.name.toLowerCase().endsWith('.dmg'));
      const zip = assets.find((a) => /mac|darwin|osx/i.test(a.name) && a.name.toLowerCase().endsWith('.zip'));
      const asset = dmg || zip;
      if (asset) {
        triggerDownload(asset.browser_download_url, asset.name);
        toast.success(`Downloading ${asset.name}`);
      } else {
        toast.error('No macOS build available in the latest release yet.');
      }
    } catch {
      toast.error('Could not start download. Please try again.');
    } finally {
      setTimeout(() => setDownloading(false), 1500);
    }
  };

  return (
    <div className="brand-blue min-h-screen bg-background text-foreground selection:bg-primary/20">
      {/* Nav — hidden in native mobile app */}
      {!isNativePlatform() && (
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
      )}

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
            <div className="inline-block px-3 py-1 border border-border/60 rounded-full bg-background/40 backdrop-blur-sm shadow-[0_8px_30px_-4px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)]">
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
            A system for testing, refining, and reshaping how you spend your time. Watch priorities escalate. Build routines that stick. Clear space for what matters.
          </motion.p>

          <motion.div
            initial="hidden"
            animate="visible"
            custom={3}
            variants={fadeUp}
            className="flex flex-col items-center justify-center gap-3"
          >
            {isNativePlatform() ? (
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => navigate('/auth')}
                  className="px-5 py-3 bg-card text-foreground border border-border text-[11px] font-mono tracking-widest rounded-sm hover:bg-card/80 transition-colors"
                >
                  SIGN IN
                </button>
                <button
                  onClick={() => navigate('/auth', { state: { plan: 'yearly' } })}
                  className="group flex items-center gap-2 px-6 py-3 bg-foreground text-background text-[11px] font-mono tracking-widest rounded-sm hover:bg-foreground/90 transition-colors"
                >
                  START FREE TRIAL
                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl mx-auto">
                <a
                  href={IOS_TESTFLIGHT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between gap-3 border border-border/60 bg-background/40 backdrop-blur-sm rounded-md px-5 py-4 shadow-[0_8px_30px_-4px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)] hover:border-foreground/40 transition-colors"
                >
                  <span className="text-[11px] font-mono tracking-widest text-foreground">JOIN iOS BETA</span>
                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </a>
                <a
                  href="#"
                  onClick={handleDesktopDownload}
                  className="group flex items-center justify-between gap-3 border border-border/60 bg-background/40 backdrop-blur-sm rounded-md px-5 py-4 shadow-[0_8px_30px_-4px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)] hover:border-foreground/40 transition-colors"
                >
                  <span className="text-[11px] font-mono tracking-widest text-foreground">
                    {downloading ? 'PREPARING…' : 'DOWNLOAD FOR MAC'}
                  </span>
                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </a>
              </div>
            )}
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

          <div className="mb-10">
            <FeatureCarousel activeIndex={activeFeature} onSlideChange={setActiveFeature} />
          </div>

          <LandingFeatureGrid activeIndex={activeFeature} onSelect={setActiveFeature} />
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
               No credit card required
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
              className={`border rounded-md p-5 text-left shadow-[0_8px_30px_-4px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)] transition-all ${
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
              className={`border rounded-md p-5 relative text-left shadow-[0_8px_30px_-4px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)] transition-all ${
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
               GET STARTED&nbsp;
               <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
             </button>
             <p className="text-[9px] font-mono text-muted-foreground/40 mt-3">
               {"\n"}
             </p>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src={faviconUrl} alt="Spacetime" className="w-3 h-3 opacity-40" />
            <span className="text-[10px] font-mono text-muted-foreground/40 tracking-wider">
              SPACETIME © {new Date().getFullYear()}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/privacy" className="text-[9px] font-mono text-muted-foreground/30 tracking-wider hover:text-foreground transition-colors">
              PRIVACY
            </a>
            <a href="/terms" className="text-[9px] font-mono text-muted-foreground/30 tracking-wider hover:text-foreground transition-colors">
              TERMS
            </a>
            <span className="text-[9px] font-mono text-muted-foreground/30 tracking-wider">
              BUILT WITH INTENTION
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
