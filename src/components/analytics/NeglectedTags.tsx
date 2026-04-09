import { useMemo } from 'react';
import { useTaskStore } from '@/store/taskStore';
import { useLibraryStore } from '@/store/libraryStore';
import { subDays, format } from 'date-fns';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';

interface TagInsight {
  tag: string;
  label: string;
  recentMinutes: number;
  previousMinutes: number;
  trend: 'up' | 'down' | 'flat';
  kind: 'neglected' | 'growing' | 'dropped';
}

export function NeglectedTags() {
  const tasks = useTaskStore(s => s.tasks);
  const categories = useLibraryStore(s => s.categories);

  const insights = useMemo(() => {
    const today = new Date();
    const recentStart = format(subDays(today, 7), 'yyyy-MM-dd');
    const prevStart = format(subDays(today, 14), 'yyyy-MM-dd');
    const recentEnd = format(today, 'yyyy-MM-dd');

    const allTags = [...new Set(tasks.map(t => t.category || '').filter(Boolean))];
    const result: TagInsight[] = [];

    allTags.forEach(tag => {
      const recent = tasks.filter(t => t.date >= recentStart && t.date <= recentEnd && t.category === tag && t.archiveReason !== 'deleted');
      const prev = tasks.filter(t => t.date >= prevStart && t.date < recentStart && t.category === tag && t.archiveReason !== 'deleted');

      const recentMin = recent.reduce((s, t) => s + (t.duration || 30), 0);
      const prevMin = prev.reduce((s, t) => s + (t.duration || 30), 0);
      const label = categories.find(c => c.value === tag)?.label || tag;

      if (prevMin > 0 && recentMin === 0) {
        result.push({ tag, label, recentMinutes: recentMin, previousMinutes: prevMin, trend: 'down', kind: 'dropped' });
      } else if (prevMin > 0 && recentMin < prevMin * 0.5) {
        result.push({ tag, label, recentMinutes: recentMin, previousMinutes: prevMin, trend: 'down', kind: 'neglected' });
      } else if (prevMin > 0 && recentMin > prevMin * 1.5) {
        result.push({ tag, label, recentMinutes: recentMin, previousMinutes: prevMin, trend: 'up', kind: 'growing' });
      }
    });

    return result.sort((a, b) => {
      if (a.kind === 'dropped' && b.kind !== 'dropped') return -1;
      if (a.kind !== 'dropped' && b.kind === 'dropped') return 1;
      return 0;
    }).slice(0, 5);
  }, [tasks, categories]);

  if (insights.length === 0) {
    return (
      <div className="flex items-center justify-center h-20 text-[10px] font-mono text-muted-foreground/40 tracking-widest">
        NO NOTABLE CHANGES
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {insights.map(ins => (
        <div key={ins.tag} className="flex items-center gap-2 py-1">
          <div className={`p-1 rounded ${
            ins.kind === 'growing' ? 'bg-green-500/10' : 'bg-destructive/10'
          }`}>
            {ins.kind === 'growing' ? (
              <TrendingUp size={11} className="text-green-600/60" />
            ) : ins.kind === 'dropped' ? (
              <AlertTriangle size={11} className="text-destructive/60" />
            ) : (
              <TrendingDown size={11} className="text-destructive/60" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-mono text-foreground/80 tracking-wide">{ins.label.toUpperCase()}</span>
          </div>
          <span className={`text-[9px] font-mono tracking-wide ${
            ins.kind === 'growing' ? 'text-green-600/60' : 'text-destructive/60'
          }`}>
            {ins.kind === 'dropped' ? 'INACTIVE' : ins.kind === 'growing' ? '↑ GROWING' : '↓ DECLINING'}
          </span>
        </div>
      ))}
    </div>
  );
}
