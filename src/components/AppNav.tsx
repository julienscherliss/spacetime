import { motion } from 'framer-motion';
import { useTaskStore, ViewMode } from '@/store/taskStore';
import { AddTaskModal } from '@/components/AddTaskModal';
import { Focus, List, CalendarDays, Grid3X3, Palmtree } from 'lucide-react';

const views: { mode: ViewMode; icon: typeof Focus; label: string }[] = [
  { mode: 'focus', icon: Focus, label: 'FOCUS' },
  { mode: 'day', icon: List, label: 'DAY' },
  { mode: 'week', icon: CalendarDays, label: 'WEEK' },
  { mode: 'calendar', icon: Grid3X3, label: 'MONTH' },
];

export function AppNav() {
  const { viewMode, setViewMode, vacationMode, toggleVacationMode } = useTaskStore();

  return (
    <nav className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-display font-bold text-foreground tracking-tighter">
            DO<span className="text-primary">.</span>
          </h1>
        </div>

        {/* View toggles */}
        <div className="flex items-center bg-secondary rounded-lg p-1 gap-0.5">
          {views.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-mono tracking-widest transition-colors ${
                viewMode === mode ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/70'
              }`}
            >
              {viewMode === mode && (
                <motion.div
                  layoutId="activeView"
                  className="absolute inset-0 bg-elevated rounded-md border border-border"
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon size={13} />
                <span className="hidden sm:inline">{label}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Vacation toggle */}
          <button
            onClick={toggleVacationMode}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-mono tracking-wider transition-colors ${
              vacationMode
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            <Palmtree size={13} />
            <span className="hidden sm:inline">{vacationMode ? 'ON' : 'OFF'}</span>
          </button>

          <AddTaskModal />
        </div>
      </div>
    </nav>
  );
}
