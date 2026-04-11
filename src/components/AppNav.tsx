/* nav v2 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, ViewMode, DaySubMode } from '@/store/taskStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useTimezoneStore, getTzAbbr } from '@/store/timezoneStore';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Focus, List, CalendarDays, Grid3X3, Repeat,
  Archive, Clock, LogOut, Settings, MoreHorizontal, X, ArchiveRestore, BarChart3, Scan, Maximize
} from 'lucide-react';

const views: { mode: ViewMode; icon: typeof Focus; label: string }[] = [
  { mode: 'focus', icon: Focus, label: 'FOCUS' },
  { mode: 'day', icon: List, label: 'DAY' },
  { mode: 'week', icon: CalendarDays, label: 'WEEK' },
  { mode: 'calendar', icon: Grid3X3, label: 'MONTH' },
];

export function AppNav() {
  const { viewMode, setViewMode, daySubMode, setDaySubMode, routinesEnabled, toggleRoutines, tasks } = useTaskStore();
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

        {/* Overflow menu — opens upward from bottom nav */}
        <AnimatePresence>
          {moreOpen && (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="fixed right-2 bottom-[68px] w-56 bg-card border border-border/60 rounded-lg shadow-lg overflow-hidden z-[51]"
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
                <OverflowItem
                  icon={<BarChart3 size={18} strokeWidth={1.5} />}
                  label="Analytics"
                  onClick={() => { window.dispatchEvent(new CustomEvent('toggle-analytics')); setMoreOpen(false); }}
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

        {/* Fixed bottom nav bar */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-t border-border/60"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          ref={moreRef}
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            {/* Fit/scan button with long-press menu */}
            <ScanButton />

            {/* View tabs — primary action */}
            <div className="flex items-center bg-muted/50 rounded-md p-0.5 gap-0.5">
              {views.map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  onClick={() => {
                    if (mode === 'day' && viewMode === 'day') {
                      setDaySubMode(daySubMode === 'timeline' ? 'list' : 'timeline');
                      return;
                    }
                    setViewMode(mode);
                  }}
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
            <button
              onClick={() => setMoreOpen((o) => !o)}
              className={`relative flex items-center justify-center w-[44px] h-[44px] rounded-md transition-colors ${
                moreOpen ? 'bg-muted text-foreground' : 'text-muted-foreground'
              }`}
            >
              {moreOpen ? <X size={20} strokeWidth={1.5} /> : <MoreHorizontal size={20} strokeWidth={1.5} />}
              {waitingCount > 0 && !moreOpen && (
                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] rounded-full bg-primary text-primary-foreground text-[9px] font-mono flex items-center justify-center">
                  {waitingCount}
                </span>
              )}
            </button>
          </div>
        </nav>
      </>
    );
  }

  // Desktop layout
  const navItemBase = "relative flex items-center gap-1.5 px-3 py-2 rounded-md text-[11px] font-mono tracking-[0.06em] transition-colors whitespace-nowrap";
  const navItemInactive = "text-muted-foreground/50 hover:text-foreground/70 hover:bg-muted/30";

  return (
    <nav className="sticky top-0 z-40 bg-background border-b border-border/30">
      <div className="max-w-5xl mx-auto flex items-center h-12 px-5 sm:px-6 gap-8">
        {/* Logo */}
        <h1 className="flex flex-col leading-[0.85] font-display font-bold text-[13px] uppercase shrink-0">
          <span className="text-foreground tracking-[0.14em]">space</span>
          <span className="text-muted-foreground/45 tracking-[0.38em]">time</span>
        </h1>

        {/* LEFT GROUP — View tabs */}
        <div className="flex items-center bg-muted/30 rounded-md p-0.5 gap-0.5">
          {views.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => {
                if (mode === 'day' && viewMode === 'day') {
                  setDaySubMode(daySubMode === 'timeline' ? 'list' : 'timeline');
                  return;
                }
                setViewMode(mode);
              }}
              className={`${navItemBase} ${
                viewMode === mode
                  ? 'text-foreground'
                  : navItemInactive
              }`}
            >
              {viewMode === mode && (
                <motion.div
                  layoutId="activeView"
                  className="absolute inset-0 bg-card rounded-md border border-border/40 shadow-sm"
                  transition={{ type: 'spring', bounce: 0.08, duration: 0.4 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon size={13} strokeWidth={viewMode === mode ? 2 : 1.5} />
                <span className={viewMode === mode ? 'font-medium' : ''}>{label}</span>
              </span>
            </button>
          ))}

        </div>

        {/* Flexible spacer */}
        <div className="flex-1" />

        {/* RIGHT GROUP — Sections */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={toggleRoutines}
            className={`${navItemBase} ${
              routinesEnabled
                ? 'bg-primary/8 text-primary border border-primary/12'
                : navItemInactive
            }`}
          >
            <Repeat size={13} strokeWidth={1.5} />
            <span className={routinesEnabled ? 'font-medium' : ''}>{routinesEnabled ? 'ROUTINES' : 'OFF'}</span>
          </button>
          <button
            onClick={() => setLibPanelOpen(!libPanelOpen)}
            className={`${navItemBase} ${
              libPanelOpen
                ? 'bg-primary/8 text-primary border border-primary/12'
                : navItemInactive
            }`}
          >
            <Archive size={13} strokeWidth={1.5} />
            <span className={libPanelOpen ? 'font-medium' : ''}>LIBRARY</span>
            {libCount > 0 && (
              <span className="text-[9px] font-mono text-muted-foreground/35 ml-0.5">{libCount}</span>
            )}
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-waiting-room'))}
            className={`${navItemBase} ${navItemInactive} relative`}
          >
            <Clock size={13} strokeWidth={1.5} />
            <span>WAITING</span>
            {waitingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] rounded-full bg-primary text-primary-foreground text-[8px] font-mono flex items-center justify-center">
                {waitingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-archive'))}
            className={`${navItemBase} ${navItemInactive}`}
          >
            <ArchiveRestore size={13} strokeWidth={1.5} />
            <span>ARCHIVE</span>
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-analytics'))}
            className={`${navItemBase} ${navItemInactive}`}
          >
            <BarChart3 size={13} strokeWidth={1.5} />
            <span>ANALYTICS</span>
          </button>

          {/* Utility separator */}
          <div className="w-px h-4 bg-border/25 mx-1.5" />

          <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-settings'))}
            className={`${navItemBase} ${navItemInactive} px-2`}
            title="Settings"
          >
            <Settings size={13} strokeWidth={1.5} />
            <span className="text-[9px] text-muted-foreground/25">{getTzAbbr(useTimezoneStore.getState().timezone)}</span>
          </button>
          <button
            onClick={signOut}
            className="flex items-center justify-center p-2 rounded-md text-muted-foreground/35 hover:text-foreground hover:bg-muted/30 transition-colors"
            title="Sign out"
          >
            <LogOut size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </nav>
  );
}

/* ── Scan button with long-press menu ── */
function ScanButton() {
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const pointerMoved = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    didLongPress.current = false;
    pointerMoved.current = false;
    startPos.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setMenuOpen(true);
    }, 400);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPos.current) return;
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    if (dx > 5 || dy > 5) {
      pointerMoved.current = true;
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (!didLongPress.current && !pointerMoved.current) {
      window.dispatchEvent(new CustomEvent('fit-to-tasks'));
    }
    startPos.current = null;
  }, []);

  const handlePointerCancel = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    startPos.current = null;
  }, []);

  useEffect(() => {
    return () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  }, []);

  return (
    <div className="relative">
      <button
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        className="flex items-center justify-center w-[44px] h-[44px] rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors touch-none select-none"
        title="Fit to tasks (hold for options)"
      >
        <Scan size={18} strokeWidth={1.5} />
      </button>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <span className="absolute inset-0 pointer-events-none" />
        </PopoverTrigger>
        <PopoverContent className="w-36 p-1.5" align="start" side="top" sideOffset={6}>
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => { window.dispatchEvent(new CustomEvent('fit-to-tasks')); setMenuOpen(false); }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-[10px] font-mono tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors w-full text-left"
            >
              <Scan size={11} strokeWidth={1.5} />
              FIT TASKS
            </button>
            <button
              onClick={() => { window.dispatchEvent(new CustomEvent('focus-current')); setMenuOpen(false); }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-[10px] font-mono tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors w-full text-left"
            >
              <Clock size={11} strokeWidth={1.5} />
              FOCUS
            </button>
            <button
              onClick={() => { window.dispatchEvent(new CustomEvent('frame-all')); setMenuOpen(false); }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-[10px] font-mono tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors w-full text-left"
            >
              <Maximize size={11} strokeWidth={1.5} />
              FRAME ALL
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
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
