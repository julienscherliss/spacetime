import { motion } from 'framer-motion';
import { useTaskStore, ViewMode } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useLibraryStore } from '@/store/libraryStore';
import { AddTaskModal } from '@/components/AddTaskModal';
import { Focus, List, CalendarDays, Grid3X3, Repeat, Calendar as CalIcon, Archive } from 'lucide-react';

const views: { mode: ViewMode; icon: typeof Focus; label: string }[] = [
  { mode: 'focus', icon: Focus, label: 'FOCUS' },
  { mode: 'day', icon: List, label: 'DAY' },
  { mode: 'week', icon: CalendarDays, label: 'WEEK' },
  { mode: 'calendar', icon: Grid3X3, label: 'MONTH' },
];

export function AppNav() {
  const { viewMode, setViewMode, routinesEnabled, toggleRoutines } = useTaskStore();
  const { panelOpen: calPanelOpen, setPanelOpen: setCalPanelOpen, connected } = useCalendarStore();
  const { panelOpen: libPanelOpen, setPanelOpen: setLibPanelOpen } = useLibraryStore();
  const libCount = useLibraryStore((s) => s.items.length);

  return (
    <nav className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border/60">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-2">
        {/* Logo */}
        <h1 className="text-lg font-display font-bold text-foreground tracking-tight">
          DO<span className="text-primary">.</span>
        </h1>

        {/* View toggles */}
        <div className="flex items-center bg-muted/50 rounded-sm p-0.5 gap-px">
          {views.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[9px] font-mono tracking-[0.12em] transition-colors ${
                viewMode === mode ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/60'
              }`}
            >
              {viewMode === mode && (
                <motion.div
                  layoutId="activeView"
                  className="absolute inset-0 bg-card rounded-sm border border-border/50 shadow-sm"
                  transition={{ type: 'spring', bounce: 0.08, duration: 0.4 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon size={11} strokeWidth={1.5} />
                <span className="hidden sm:inline">{label}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleRoutines}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-sm text-[9px] font-mono tracking-wider transition-colors ${
              routinesEnabled
                ? 'bg-primary/8 text-primary border border-primary/15'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Repeat size={11} strokeWidth={1.5} />
            <span className="hidden sm:inline">{routinesEnabled ? 'ROUTINES' : 'ROUTINES OFF'}</span>
          </button>
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-sm text-[9px] font-mono tracking-wider transition-colors ${
              panelOpen
                ? 'bg-primary/8 text-primary border border-primary/15'
                : connected
                  ? 'text-muted-foreground hover:text-foreground'
                  : 'text-muted-foreground/40 hover:text-foreground'
            }`}
          >
            <CalIcon size={11} strokeWidth={1.5} />
            <span className="hidden sm:inline">CAL</span>
          </button>
          <AddTaskModal />
        </div>
      </div>
    </nav>
  );
}
