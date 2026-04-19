import { useMemo } from 'react';
import { useReflectionStore } from '@/store/reflectionStore';
import { useTaskStore } from '@/store/taskStore';
import { REASON_LABELS, type ReflectionReason } from '@/utils/reflectionTips';
import { isWithinInterval, parseISO } from 'date-fns';

interface Props {
  range: { start: Date; end: Date };
}

interface TaskOverride {
  taskId: string;
  title: string;
  count: number;
  reasons: Record<string, number>;
}

function formatReasonLabel(reasonId: string): string {
  if (reasonId.startsWith('custom:')) return reasonId.slice(7);
  return REASON_LABELS[reasonId as ReflectionReason] || reasonId;
}

export function ReflectionInsights({ range }: Props) {
  const daily = useReflectionStore((s) => s.daily);
  const reasonFreq = useReflectionStore((s) => s.reasonFreq);
  const tasks = useTaskStore((s) => s.tasks);

  const data = useMemo(() => {
    const byTask = new Map<string, TaskOverride>();
    const reasonsInRange: Record<string, number> = {};
    let totalMoves = 0;

    for (const [key, entry] of Object.entries(daily)) {
      const [dateStr, taskId] = key.split('::');
      let inRange = false;
      try {
        inRange = isWithinInterval(parseISO(dateStr), { start: range.start, end: range.end });
      } catch {
        inRange = false;
      }
      if (!inRange) continue;

      for (const log of entry.logs) {
        totalMoves++;
        if (log.reason) {
          reasonsInRange[log.reason] = (reasonsInRange[log.reason] ?? 0) + 1;
        }
        const task = tasks.find((t) => t.id === taskId);
        const title = task?.title ?? '(deleted task)';
        const existing = byTask.get(taskId) ?? { taskId, title, count: 0, reasons: {} };
        existing.count++;
        if (log.reason) {
          existing.reasons[log.reason] = (existing.reasons[log.reason] ?? 0) + 1;
        }
        byTask.set(taskId, existing);
      }
    }

    const topTasks = [...byTask.values()].sort((a, b) => b.count - a.count).slice(0, 5);
    const topReasons = Object.entries(reasonsInRange).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const uniqueTasks = byTask.size;

    return { totalMoves, uniqueTasks, topTasks, topReasons };
  }, [daily, tasks, range.start, range.end]);

  if (data.totalMoves === 0) {
    return (
      <div className="text-[10px] font-mono text-muted-foreground/40 tracking-wide py-3">
        NO CONSTRAINT-VIOLATING MOVES IN THIS PERIOD.
      </div>
    );
  }

  const maxReasonCount = data.topReasons[0]?.[1] ?? 1;

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="border border-border/30 rounded p-2">
          <div className="text-[8px] font-mono text-muted-foreground/50 tracking-[0.15em] mb-1">
            OVERRIDES
          </div>
          <div className="font-display text-xl font-bold text-foreground">{data.totalMoves}</div>
        </div>
        <div className="border border-border/30 rounded p-2">
          <div className="text-[8px] font-mono text-muted-foreground/50 tracking-[0.15em] mb-1">
            TASKS AFFECTED
          </div>
          <div className="font-display text-xl font-bold text-foreground">{data.uniqueTasks}</div>
        </div>
      </div>

      {/* Top reasons */}
      {data.topReasons.length > 0 && (
        <div>
          <div className="text-[8px] font-mono text-muted-foreground/50 tracking-[0.15em] mb-2">
            TOP REASONS
          </div>
          <div className="space-y-1.5">
            {data.topReasons.map(([reasonId, count]) => {
              const pct = (count / maxReasonCount) * 100;
              return (
                <div key={reasonId} className="space-y-0.5">
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-foreground truncate pr-2">{formatReasonLabel(reasonId)}</span>
                    <span className="text-muted-foreground/60 tabular-nums">{count}</span>
                  </div>
                  <div className="h-1 bg-muted/30 rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-foreground/60"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Most-moved tasks */}
      {data.topTasks.length > 0 && (
        <div>
          <div className="text-[8px] font-mono text-muted-foreground/50 tracking-[0.15em] mb-2">
            MOST-MOVED IMMOBILE TASKS
          </div>
          <div className="space-y-1.5">
            {data.topTasks.map((t) => {
              const topReason = Object.entries(t.reasons).sort((a, b) => b[1] - a[1])[0];
              return (
                <div
                  key={t.taskId}
                  className="flex items-start justify-between gap-2 border-b border-dashed border-border/20 pb-1.5 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-mono text-foreground truncate">{t.title}</div>
                    {topReason && (
                      <div className="text-[9px] font-mono text-muted-foreground/50 truncate">
                        ▸ {formatReasonLabel(topReason[0]).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-foreground tabular-nums shrink-0">
                    {t.count}×
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
