import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, Clock, CheckCircle, Calendar, TrendingUp } from 'lucide-react';
import { useTaskStore } from '@/store/taskStore';
import { useLibraryStore } from '@/store/libraryStore';
import { subDays, format, parseISO } from 'date-fns';

function formatTime(minutes: number): string {
  if (minutes === 0) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface Props {
  tag: string;
  onClose: () => void;
}

export function TagDetailPanel({ tag, onClose }: Props) {
  const tasks = useTaskStore(s => s.tasks);
  const categories = useLibraryStore(s => s.categories);
  const label = categories.find(c => c.value === tag)?.label || tag;

  const stats = useMemo(() => {
    const tagTasks = tasks.filter(t => (t.category || '') === tag && t.archiveReason !== 'deleted');
    const today = format(new Date(), 'yyyy-MM-dd');
    const week7 = format(subDays(new Date(), 7), 'yyyy-MM-dd');
    const week30 = format(subDays(new Date(), 30), 'yyyy-MM-dd');

    const last7 = tagTasks.filter(t => t.date >= week7 && t.date <= today);
    const last30 = tagTasks.filter(t => t.date >= week30 && t.date <= today);

    const totalScheduled = tagTasks.reduce((s, t) => s + (t.duration || 30), 0);
    const totalCompleted = tagTasks.filter(t => t.completed).reduce((s, t) => s + (t.duration || 30), 0);
    const completionRate = tagTasks.length > 0
      ? Math.round((tagTasks.filter(t => t.completed).length / tagTasks.length) * 100)
      : 0;

    // Top days
    const dayMap = new Map<string, number>();
    tagTasks.forEach(t => {
      const dow = parseISO(t.date).toLocaleDateString('en', { weekday: 'short' });
      dayMap.set(dow, (dayMap.get(dow) || 0) + (t.duration || 30));
    });
    const topDays = [...dayMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

    // Weekly average
    const weeklyAvg = last30.length > 0
      ? Math.round(last30.reduce((s, t) => s + (t.duration || 30), 0) / 4)
      : 0;

    // Recent tasks
    const recentTasks = tagTasks
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);

    return {
      totalTasks: tagTasks.length,
      totalScheduled,
      totalCompleted,
      completionRate,
      last7Count: last7.length,
      last7Minutes: last7.reduce((s, t) => s + (t.duration || 30), 0),
      topDays,
      weeklyAvg,
      recentTasks,
    };
  }, [tasks, tag]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto"
    >
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground tracking-tight">{label.toUpperCase()}</h2>
            <p className="text-[9px] font-mono text-muted-foreground/50 tracking-widest mt-0.5">TAG DETAIL</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            { icon: Clock, label: 'TOTAL SCHEDULED', value: formatTime(stats.totalScheduled) },
            { icon: CheckCircle, label: 'TOTAL COMPLETED', value: formatTime(stats.totalCompleted) },
            { icon: Calendar, label: 'WEEKLY AVG', value: formatTime(stats.weeklyAvg) },
            { icon: TrendingUp, label: 'COMPLETION', value: `${stats.completionRate}%` },
          ].map(card => (
            <div key={card.label} className="border border-border/30 rounded-md p-3 bg-card/50">
              <div className="flex items-center gap-1.5 mb-1">
                <card.icon size={10} className="text-muted-foreground/40" />
                <span className="text-[8px] font-mono text-muted-foreground/40 tracking-[0.12em]">{card.label}</span>
              </div>
              <span className="text-base font-display font-bold text-foreground">{card.value}</span>
            </div>
          ))}
        </div>

        {/* Top days */}
        {stats.topDays.length > 0 && (
          <div className="mb-6">
            <h3 className="text-[9px] font-mono text-muted-foreground/40 tracking-[0.15em] mb-2">TOP DAYS</h3>
            <div className="flex gap-2">
              {stats.topDays.map(([day, mins]) => (
                <div key={day} className="border border-border/30 rounded px-3 py-2 bg-card/30 flex-1 text-center">
                  <span className="text-[11px] font-mono text-foreground/80 block">{day}</span>
                  <span className="text-[9px] font-mono text-muted-foreground/50">{formatTime(mins)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent tasks */}
        <div>
          <h3 className="text-[9px] font-mono text-muted-foreground/40 tracking-[0.15em] mb-2">RECENT TASKS</h3>
          <div className="space-y-1">
            {stats.recentTasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 py-1.5 px-2 rounded border border-border/20 bg-card/30">
                <div className={`w-1.5 h-1.5 rounded-full ${t.completed ? 'bg-green-500/60' : 'bg-muted-foreground/30'}`} />
                <span className="text-[10px] font-mono text-foreground/70 flex-1 truncate">{t.title}</span>
                <span className="text-[8px] font-mono text-muted-foreground/40">{t.date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
