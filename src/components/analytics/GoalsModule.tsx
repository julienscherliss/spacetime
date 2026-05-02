import { Trash2, Target } from 'lucide-react';
import { useGoalsProgress } from '@/hooks/useGoalsProgress';
import { useGoalsStore } from '@/store/goalsStore';

function formatValue(metric: string, value: number): string {
  if (metric === 'completed-tasks') return `${value}`;
  if (value < 60) return `${value}m`;
  const h = Math.floor(value / 60);
  const m = value % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function metricLabel(metric: string): string {
  if (metric === 'completed-tasks') return 'TASKS DONE';
  if (metric === 'scheduled-minutes') return 'TIME SCHEDULED';
  return 'TIME COMPLETED';
}

export function GoalsModule() {
  const progress = useGoalsProgress();
  const removeGoal = useGoalsStore((s) => s.removeGoal);

  if (progress.length === 0) {
    return (
      <div className="text-[10px] font-mono text-muted-foreground/40 tracking-wide py-3 leading-relaxed">
        NO GOALS YET. OPEN A TAG IN <span className="text-foreground/60">TIME BY TAG</span> AND TAP{' '}
        <span className="text-foreground/60">+ SET GOAL</span> TO ADD ONE.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {progress.map((p) => (
        <div key={p.goal.id} className="border border-border/30 rounded-md p-2.5 bg-card/40">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Target size={10} className={p.reached ? 'text-primary' : 'text-muted-foreground/40'} />
                <span className="text-[11px] font-mono text-foreground truncate">{p.tagLabel.toUpperCase()}</span>
              </div>
              <div className="text-[8px] font-mono text-muted-foreground/50 tracking-[0.12em] mt-0.5 ml-[18px]">
                {metricLabel(p.goal.metric)} · {p.periodLabel}
              </div>
            </div>
            <button
              onClick={() => removeGoal(p.goal.id)}
              className="p-1 text-muted-foreground/30 hover:text-foreground rounded transition-colors"
              aria-label="Remove goal"
            >
              <Trash2 size={11} />
            </button>
          </div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="font-display text-base font-bold text-foreground tabular-nums">
              {formatValue(p.goal.metric, p.current)}
              <span className="text-[10px] font-mono text-muted-foreground/50 ml-1">
                / {formatValue(p.goal.metric, p.target)}
              </span>
            </span>
            <span className={`text-[10px] font-mono tabular-nums ${p.reached ? 'text-primary' : 'text-muted-foreground/60'}`}>
              {Math.round(p.pct * 100)}%
            </span>
          </div>
          <div className="h-1.5 bg-muted/30 rounded-sm overflow-hidden">
            <div
              className={`h-full transition-all ${p.reached ? 'bg-primary' : 'bg-foreground/60'}`}
              style={{ width: `${p.pct * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}