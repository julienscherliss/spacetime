import { motion } from 'framer-motion';
import { useTaskStore, ViewMode } from '@/store/taskStore';
import { useCalendarStore } from '@/store/calendarStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useAuth } from '@/hooks/useAuth';
import { AddTaskModal } from '@/components/AddTaskModal';
import { Focus, List, CalendarDays, Grid3X3, Repeat, Calendar as CalIcon, Archive, Clock, LogOut } from 'lucide-react';

const views: { mode: ViewMode; icon: typeof Focus; label: string }[] = [
  { mode: 'focus', icon: Focus, label: 'FOCUS' },
  { mode: 'day', icon: List, label: 'DAY' },
  { mode: 'week', icon: CalendarDays, label: 'WEEK' },
  { mode: 'calendar', icon: Grid3X3, label: 'MONTH' },
];

export function AppNav() {
  const { viewMode, setViewMode, routinesEnabled, toggleRoutines, tasks } = useTaskStore();
  const { panelOpen: calPanelOpen, setPanelOpen: setCalPanelOpen, connected } = useCalendarStore();
  const { panelOpen: libPanelOpen, setPanelOpen: setLibPanelOpen } = useLibraryStore();
  const libCount = useLibraryStore((s) => s.items.length);
  const { signOut } = useAuth();
  const waitingCount = tasks.filter((t) => t.inWaitingRoom && !t.completed).length;

  return (
    <nav className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border/60">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-3 sm:px-4 py-2">
        {/* Logo */}
        <h1 className="text-base sm:text-lg font-display font-bold text-foreground tracking-tight shrink-0">
          DO<span className="text-primary">.</span>
        </h1>

        {/* View toggles */}
        <div className="flex items-center bg-muted/50 rounded-sm p-0.5 gap-px overflow-x-auto">
          {views.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`relative flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-sm text-[10px] font-mono tracking-[0.1em] transition-colors whitespace-nowrap ${
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
              <span className="relative z-10 flex items-center gap-1 sm:gap-1.5">
                <Icon size={12} strokeWidth={1.5} />
                <span className="hidden sm:inline">{label}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            onClick={toggleRoutines}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-sm text-[10px] font-mono tracking-wider transition-colors ${
              routinesEnabled
                ? 'bg-primary/8 text-primary border border-primary/15'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Repeat size={12} strokeWidth={1.5} />
            <span className="hidden sm:inline">{routinesEnabled ? 'ROUTINES' : 'OFF'}</span>
          </button>
          <button
            onClick={() => setLibPanelOpen(!libPanelOpen)}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-sm text-[10px] font-mono tracking-wider transition-colors ${
              libPanelOpen
                ? 'bg-primary/8 text-primary border border-primary/15'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Archive size={12} strokeWidth={1.5} />
            <span className="hidden sm:inline">LIBRARY</span>
            {libCount > 0 && (
              <span className="text-[9px] font-mono text-muted-foreground/40 ml-0.5">{libCount}</span>
            )}
          </button>
          <button
            onClick={() => {
              // Dispatch a custom event for WaitingRoom toggle
              window.dispatchEvent(new CustomEvent('toggle-waiting-room'));
            }}
            className="flex items-center gap-1 px-2 py-1.5 rounded-sm text-[10px] font-mono tracking-wider text-muted-foreground hover:text-foreground transition-colors relative"
          >
            <Clock size={12} strokeWidth={1.5} />
            <span className="hidden sm:inline">WAITING</span>
            {waitingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-primary text-primary-foreground text-[8px] font-mono flex items-center justify-center">
                {waitingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setCalPanelOpen(!calPanelOpen)}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-sm text-[10px] font-mono tracking-wider transition-colors ${
              calPanelOpen
                ? 'bg-primary/8 text-primary border border-primary/15'
                : connected
                  ? 'text-muted-foreground hover:text-foreground'
                  : 'text-muted-foreground/40 hover:text-foreground'
            }`}
          >
            <CalIcon size={12} strokeWidth={1.5} />
            <span className="hidden sm:inline">CAL</span>
          </button>
          <AddTaskModal />
          <button
            onClick={signOut}
            className="p-1.5 rounded-sm text-muted-foreground/40 hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut size={12} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </nav>
  );
}
