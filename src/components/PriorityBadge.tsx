import { Priority } from '@/store/taskStore';

const labels: Record<Priority, string> = {
  0: 'FLEX',
  1: 'SEMI',
  2: 'FIXED',
  3: 'LOCK',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const colors = {
    0: 'bg-[hsl(var(--priority-0)/0.08)] text-[hsl(var(--priority-0))] border-[hsl(var(--priority-0)/0.15)]',
    1: 'bg-[hsl(var(--priority-1)/0.1)] text-[hsl(var(--priority-1))] border-[hsl(var(--priority-1)/0.2)]',
    2: 'bg-[hsl(var(--priority-2)/0.12)] text-[hsl(var(--priority-2))] border-[hsl(var(--priority-2)/0.25)]',
    3: 'bg-[hsl(var(--priority-3)/0.15)] text-[hsl(var(--priority-3))] border-[hsl(var(--priority-3)/0.3)]',
  }[priority];

  const weight = priority >= 2 ? 'font-semibold' : '';

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[8px] font-mono tracking-[0.15em] rounded-sm border ${colors} ${weight}`}>
      {labels[priority]}
    </span>
  );
}
