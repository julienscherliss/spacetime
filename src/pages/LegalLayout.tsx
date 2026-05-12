import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface Props {
  title: string;
  updated: string;
  children: ReactNode;
}

/**
 * Shared chrome for the Privacy Policy and Terms of Service pages.
 * Uses semantic tokens only — never hard-coded colors — so it inherits the
 * Light Industrial palette in both light and dark mode.
 */
export function LegalLayout({ title, updated, children }: Props) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-[env(safe-area-inset-top)] z-10 bg-background/90 backdrop-blur border-b border-border/40">
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-[11px] font-mono tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={12} />
            <span>SPACETIME</span>
          </Link>
          <span className="text-[10px] font-mono tracking-[0.18em] text-muted-foreground/50">
            {updated}
          </span>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-5 py-10">
        <h1 className="text-2xl font-mono font-medium tracking-tight mb-8">{title}</h1>
        <article className="legal-prose text-[13px] leading-[1.7] font-mono text-foreground space-y-6">
          {children}
        </article>
        <footer className="mt-16 pt-6 border-t border-border/30 flex items-center justify-between text-[10px] font-mono tracking-[0.18em] text-muted-foreground/60">
          <Link to="/privacy" className="hover:text-foreground">PRIVACY</Link>
          <Link to="/terms" className="hover:text-foreground">TERMS</Link>
          <a href="mailto:hello@launchspacetime.com" className="hover:text-foreground">CONTACT</a>
        </footer>
      </main>
    </div>
  );
}