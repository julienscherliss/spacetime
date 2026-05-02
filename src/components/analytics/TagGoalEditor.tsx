import { useState } from 'react';
import { Plus, Trash2, Target, Check } from 'lucide-react';
import { useGoalsStore, type Goal, type GoalMetric, type GoalPeriod } from '@/store/goalsStore';
import { useGoalsProgress } from '@/hooks/useGoalsProgress';

interface Props {
  tag: string;
  tagLabel: string;
}

const METRIC_OPTS: { value: GoalMetric; label: string; unit: string }[] = [
  { value: 'completed-tasks', label: 'Tasks completed', unit: 'tasks' },
  { value: 'completed-minutes', label: 'Time completed', unit: 'min' },
  { value: 'scheduled-minutes', label: 'Time scheduled', unit: 'min' },
];

const PERIOD_OPTS: { value: GoalPeriod; label: string }[] = [
  { value: 'daily', label: 'Per day' },
  { value: 'weekly', label: 'Per week' },
  { value: 'monthly', label: 'Per month' },
];

export function TagGoalEditor({ tag, tagLabel }: Props) {
  const allGoals = useGoalsStore((s) => s.goals);
  const goals = allGoals.filter((g) => g.tag === tag);
  const addGoal = useGoalsStore((s) => s.addGoal);
  const removeGoal = useGoalsStore((s) => s.removeGoal);
  const allProgress = useGoalsProgress();

  const [editing, setEditing] = useState(false);
  const [metric, setMetric] = useState<GoalMetric>('completed-tasks');
  const [period, setPeriod] = useState<GoalPeriod>('weekly');
  const [target, setTarget] = useState<string>('5');
  const [hours, setHours] = useState<string>('1');
  const [minutes, setMinutes] = useState<string>('0');

  const isTimeMetric = metric !== 'completed-tasks';

  const submit = () => {
    let n: number;
    if (isTimeMetric) {
      const h = Math.max(0, Number(hours) || 0);
      const m = Math.max(0, Number(minutes) || 0);
      n = h * 60 + m;
    } else {
      n = Number(target);
    }
    if (!Number.isFinite(n) || n <= 0) return;
    addGoal({ tag, metric, period, target: n });
    setEditing(false);
    setTarget('5');
    setHours('1');
    setMinutes('0');
  };

  const progressFor = (g: Goal) => allProgress.find((p) => p.goal.id === g.id);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[9px] font-mono text-muted-foreground/40 tracking-[0.15em] flex items-center gap-1.5">
          <Target size={10} /> GOALS <span className="text-muted-foreground/30">({goals.length})</span>
        </h3>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-[9px] font-mono text-primary/70 hover:text-primary tracking-[0.12em] flex items-center gap-1 px-2 py-1 rounded hover:bg-primary/10 transition-colors"
          >
            <Plus size={10} /> SET GOAL
          </button>
        )}
      </div>

      {goals.length === 0 && !editing && (
        <p className="text-[9px] font-mono text-muted-foreground/40 leading-relaxed">
          Set a goal to track {tagLabel.toLowerCase()} progress per day, week, or month.
        </p>
      )}

      <div className="space-y-1.5">
        {goals.map((g) => {
          const p = progressFor(g);
          const opt = METRIC_OPTS.find((m) => m.value === g.metric)!;
          const periodOpt = PERIOD_OPTS.find((x) => x.value === g.period)!;
          return (
            <div key={g.id} className="border border-border/30 rounded p-2 bg-card/30">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[10px] font-mono text-foreground">
                  {g.target} {opt.unit} · {periodOpt.label.toLowerCase()}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {p && (
                    <span className={`text-[9px] font-mono tabular-nums ${p.reached ? 'text-primary' : 'text-muted-foreground/60'}`}>
                      {Math.round(p.pct * 100)}%
                    </span>
                  )}
                  <button
                    onClick={() => removeGoal(g.id)}
                    className="p-0.5 text-muted-foreground/30 hover:text-foreground"
                    aria-label="Remove goal"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
              {p && (
                <div className="h-1 bg-muted/30 rounded-sm overflow-hidden">
                  <div
                    className={`h-full ${p.reached ? 'bg-primary' : 'bg-foreground/60'}`}
                    style={{ width: `${p.pct * 100}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="mt-2 border border-primary/30 rounded p-2.5 bg-card/50 space-y-2">
          <div>
            <div className="text-[8px] font-mono text-muted-foreground/50 tracking-[0.15em] mb-1">METRIC</div>
            <div className="flex flex-wrap gap-1">
              {METRIC_OPTS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setMetric(o.value)}
                  className={`text-[9px] font-mono px-2 py-1 rounded border tracking-wide ${
                    metric === o.value
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-border/40 text-muted-foreground/70 hover:text-foreground'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[8px] font-mono text-muted-foreground/50 tracking-[0.15em] mb-1">PERIOD</div>
            <div className="flex gap-1">
              {PERIOD_OPTS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setPeriod(o.value)}
                  className={`text-[9px] font-mono px-2 py-1 rounded border tracking-wide ${
                    period === o.value
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-border/40 text-muted-foreground/70 hover:text-foreground'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[8px] font-mono text-muted-foreground/50 tracking-[0.15em] mb-1">TARGET</div>
            <div className="flex items-center gap-2 flex-wrap">
              {isTimeMetric ? (
                <>
                  <input
                    type="number"
                    min={0}
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                    className="w-14 bg-transparent border border-border/40 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
                    autoFocus
                  />
                  <span className="text-[9px] font-mono text-muted-foreground/60">h</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    step={5}
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                    className="w-14 bg-transparent border border-border/40 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
                  />
                  <span className="text-[9px] font-mono text-muted-foreground/60">min</span>
                </>
              ) : (
                <>
                  <input
                    type="number"
                    min={1}
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                    className="w-20 bg-transparent border border-border/40 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
                    autoFocus
                  />
                  <span className="text-[9px] font-mono text-muted-foreground/60">tasks</span>
                </>
              )}
              <div className="flex-1" />
              <button
                onClick={() => setEditing(false)}
                className="text-[9px] font-mono text-muted-foreground/60 hover:text-foreground tracking-[0.12em] px-2 py-1"
              >
                CANCEL
              </button>
              <button
                onClick={submit}
                className="text-[9px] font-mono text-primary tracking-[0.12em] px-2 py-1 rounded border border-primary/40 hover:bg-primary/10 flex items-center gap-1"
              >
                <Check size={10} /> SAVE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}