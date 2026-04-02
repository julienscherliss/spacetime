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
    <nav className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border/50">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-2.5">
        {/* Logo */}
        <h1 className="text-xl font-display font-bold text-foreground tracking-tighter">
          DO<span className="text-primary">.</span>
        </h1>

        {/* View toggles */}
        <div className="flex items-center bg-muted rounded-md p-0.5 gap-0.5">
          {views.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono tracking-[0.15em] transition-colors ${
                viewMode === mode ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/60'
              }`}
            >
              {viewMode === mode && (
                <motion.div
                  layoutId="activeView"
                  className="absolute inset-0 bg-elevated rounded border border-border/50"
                  transition={{ type: 'spring', bounce: 0.1, duration: 0.45 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon size={12} />
                <span className="hidden sm:inline">{label}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleVacationMode}
            className={`flex items-center gap-1.5 px-2.5 py-2 rounded text-[10px] font-mono tracking-wider transition-colors ${
              vacationMode
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            <Palmtree size={12} />
            <span className="hidden sm:inline">{vacationMode ? 'ON' : 'OFF'}</span>
          </button>
          <AddTaskModal />
        </div>
      </div>
    </nav>
  );
}
