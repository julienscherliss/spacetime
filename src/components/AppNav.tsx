/* nav v2 */
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, ViewMode } from '@/store/taskStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useTimezoneStore, getTzAbbr } from '@/store/timezoneStore';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Focus, List, CalendarDays, Grid3X3, Repeat,
  Archive, Clock, LogOut, Settings, MoreHorizontal, X, ArchiveRestore
} from 'lucide-react';

const views: { mode: ViewMode; icon: typeof Focus; label: string }[] = [
  { mode: 'focus', icon: Focus, label: 'FOCUS' },
  { mode: 'day', icon: List, label: 'DAY' },
  { mode: 'week', icon: CalendarDays, label: 'WEEK' },
  { mode: 'calendar', icon: Grid3X3, label: 'MONTH' },
];

export function AppNav() {
  const { viewMode, setViewMode, routinesEnabled, toggleRoutines, tasks } = useTaskStore();
  const { panelOpen: libPanelOpen, setPanelOpen: setLibPanelOpen } = useLibraryStore();
  const libCount = useLibraryStore((s) => s.items.length);
  const { signOut } = useAuth();
  const waitingCount = tasks.filter((t) => t.inWaitingRoom && !t.completed && !t.archivedAt).length;
  const isMobile = useIsMobile();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close overflow menu on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen]);

  // Close overflow on route/view change
  useEffect(() => { setMoreOpen(false); }, [viewMode]);

  if (isMobile) {
    return (
      <>
        <nav className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border/60">
          <div className="flex items-center justify-between px-2 py-1.5">
            {/* Logo */}
            <h1 className="flex flex-col leading-[0.85] font-display font-bold text-[11px] uppercase pl-1">
              <span className="text-foreground tracking-[0.12em]">space</span>
              <span className="text-muted-foreground/60 tracking-[0.35em]">time</span>
            </h1>

            {/* View tabs — primary action */}
            <div className="flex items-center bg-muted/50 rounded-md p-0.5 gap-0.5">
              {views.map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`relative flex flex-col items-center justify-center min-w-[48px] h-[44px] rounded-md transition-colors ${
                    viewMode === mode ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {viewMode === mode && (
                    <motion.div
                      layoutId="activeView"
                      className="absolute inset-0 bg-card rounded-md border border-border/50 shadow-sm"
                      transition={{ type: 'spring', bounce: 0.08, duration: 0.4 }}
                    />
                  )}
                  <span className="relative z-10 flex flex-col items-center gap-0.5">
                    <Icon size={18} strokeWidth={viewMode === mode ? 2 : 1.5} />
                    <span className="text-[8px] font-mono tracking-[0.08em] leading-none">{label}</span>
                  </span>
                </button>
              ))}
            </div>

            {/* More button */}
            <div className="relative" ref={moreRef}>
              <button
                onClick={() => setMoreOpen((o) => !o)}
                className={`relative flex items-center justify-center w-[44px] h-[44px] rounded-md transition-colors ${
                  moreOpen ? 'bg-muted text-foreground' : 'text-muted-foreground'
                }`}
              >
                {moreOpen ? <X size={20} strokeWidth={1.5} /> : <MoreHorizontal size={20} strokeWidth={1.5} />}
                {/* Badge for waiting count */}
                {waitingCount > 0 && !moreOpen && (
                  <span className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] rounded-full bg-primary text-primary-foreground text-[9px] font-mono flex items-center justify-center">
                    {waitingCount}
                  </span>
                )}
              </button>

              {/* Overflow menu */}
              <AnimatePresence>
                {moreOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1 w-56 bg-card border border-border/60 rounded-lg shadow-lg overflow-hidden z-50"
                  >
                    <div className="py-1">
                      <OverflowItem
                        icon={<Repeat size={18} strokeWidth={1.5} />}
                        label={routinesEnabled ? 'Routines on' : 'Routines off'}
                        active={routinesEnabled}
                        onClick={() => { toggleRoutines(); }}
                      />
                      <OverflowItem
                        icon={<Archive size={18} strokeWidth={1.5} />}
                        label="Library"
                        badge={libCount > 0 ? String(libCount) : undefined}
                        active={libPanelOpen}
                        onClick={() => { setLibPanelOpen(!libPanelOpen); setMoreOpen(false); }}
                      />
                      <OverflowItem
                        icon={<Clock size={18} strokeWidth={1.5} />}
                        label="Waiting Room"
                        badge={waitingCount > 0 ? String(waitingCount) : undefined}
                        onClick={() => { window.dispatchEvent(new CustomEvent('toggle-waiting-room')); setMoreOpen(false); }}
                      />
                      <OverflowItem
                        icon={<ArchiveRestore size={18} strokeWidth={1.5} />}
                        label="Archive"
                        onClick={() => { window.dispatchEvent(new CustomEvent('toggle-archive')); setMoreOpen(false); }}
                      />

                      <div className="border-t border-border/40 my-1" />

                      <OverflowItem
                        icon={<Settings size={18} strokeWidth={1.5} />}
                        label={`Settings · ${getTzAbbr(useTimezoneStore.getState().timezone)}`}
                        onClick={() => { window.dispatchEvent(new CustomEvent('toggle-settings')); setMoreOpen(false); }}
                      />
                      <OverflowItem
                        icon={<LogOut size={18} strokeWidth={1.5} />}
                        label="Sign out"
                        onClick={() => { signOut(); setMoreOpen(false); }}
                        destructive
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </nav>
      </>
    );
  }

  // Desktop layout
  return (
    <nav className="sticky top-0 z-40 bg-background/98 backdrop-blur-sm border-b border-border/40 shadow-[0_1px_3px_0_hsl(var(--foreground)/0.04)]">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-5 sm:px-6 py-3">
        {/* Logo — more breathing room */}
        <h1 className="flex flex-col leading-[0.85] font-display font-bold text-[12px] uppercase shrink-0 mr-6">
          <span className="text-foreground tracking-[0.14em]">space</span>
          <span className="text-muted-foreground/50 tracking-[0.38em]">time</span>
        </h1>

        {/* LEFT GROUP — View tabs */}
        <div className="flex items-center bg-muted/40 rounded-md p-0.5 gap-0.5">
          {views.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`relative flex items-center gap-2 px-4 py-2.5 rounded-md text-[11px] font-mono tracking-[0.08em] transition-colors whitespace-nowrap ${
                viewMode === mode
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground/60 hover:text-foreground/80 hover:bg-muted/40'
              }`}
            >
              {viewMode === mode && (
                <motion.div
                  layoutId="activeView"
                  className="absolute inset-0 bg-card rounded-md border border-border/50 shadow-sm"
                  transition={{ type: 'spring', bounce: 0.08, duration: 0.4 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <Icon size={14} strokeWidth={viewMode === mode ? 2 : 1.5} />
                <span>{label}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Spacer between groups */}
        <div className="flex-1 min-w-6" />

        {/* RIGHT GROUP — Sections */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={toggleRoutines}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-md text-[11px] font-mono tracking-wider transition-colors ${
              routinesEnabled
                ? 'bg-primary/8 text-primary border border-primary/15 font-semibold'
                : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/30'
            }`}
          >
            <Repeat size={14} strokeWidth={1.5} />
            <span>{routinesEnabled ? 'ROUTINES' : 'OFF'}</span>
          </button>
          <button
            onClick={() => setLibPanelOpen(!libPanelOpen)}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-md text-[11px] font-mono tracking-wider transition-colors ${
              libPanelOpen
                ? 'bg-primary/8 text-primary border border-primary/15 font-semibold'
                : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/30'
            }`}
          >
            <Archive size={14} strokeWidth={1.5} />
            <span>LIBRARY</span>
            {libCount > 0 && (
              <span className="text-[10px] font-mono text-muted-foreground/40 ml-0.5">{libCount}</span>
            )}
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-waiting-room'))}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-md text-[11px] font-mono tracking-wider text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors relative"
          >
            <Clock size={14} strokeWidth={1.5} />
            <span>WAITING</span>
            {waitingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full bg-primary text-primary-foreground text-[9px] font-mono flex items-center justify-center">
                {waitingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-archive'))}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-md text-[11px] font-mono tracking-wider text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            <ArchiveRestore size={14} strokeWidth={1.5} />
            <span>ARCHIVE</span>
          </button>

          {/* Subtle separator */}
          <div className="w-px h-5 bg-border/30 mx-1" />

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-settings'))}
            className="flex items-center gap-1.5 px-2.5 py-2.5 rounded-md text-[11px] font-mono tracking-wider text-muted-foreground/40 hover:text-foreground hover:bg-muted/30 transition-colors"
            title="Settings"
          >
            <Settings size={14} strokeWidth={1.5} />
            <span className="text-[10px] text-muted-foreground/30">{getTzAbbr(useTimezoneStore.getState().timezone)}</span>
          </button>
          <button
            onClick={signOut}
            className="p-2.5 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-muted/30 transition-colors"
            title="Sign out"
          >
            <LogOut size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </nav>
  );
}

/* ── Overflow menu item ── */
function OverflowItem({
  icon,
  label,
  badge,
  active,
  destructive,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  active?: boolean;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-4 py-3 text-sm font-mono tracking-wide transition-colors text-left ${
        destructive
          ? 'text-destructive hover:bg-destructive/5'
          : active
            ? 'text-primary bg-primary/5'
            : 'text-foreground hover:bg-muted/60'
      }`}
    >
      <span className={active ? 'text-primary' : destructive ? 'text-destructive' : 'text-muted-foreground'}>
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="min-w-[20px] h-[20px] rounded-full bg-primary text-primary-foreground text-[10px] font-mono flex items-center justify-center">
          {badge}
        </span>
      )}
      {active && !badge && (
        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
      )}
    </button>
  );
}
