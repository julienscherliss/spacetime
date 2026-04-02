import { Priority } from '@/store/taskStore';

const labels: Record<Priority, string> = {
  0: 'FLEX',
  1: 'SEMI',
  2: 'FIXED',
  3: 'LOCK',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const styles: Record<Priority, string> = {
    0: 'text-[hsl(var(--priority-0))] border-[hsl(var(--priority-0)/0.2)]',
    1: 'text-[hsl(var(--priority-1))] border-[hsl(var(--priority-1)/0.25)]',
    2: 'text-[hsl(var(--priority-2))] border-[hsl(var(--priority-2)/0.3)] font-medium',
    3: 'text-[hsl(var(--priority-3))] border-[hsl(var(--priority-3)/0.35)] font-semibold',
  };

  return (
    <span className={`inline-flex items-center px-1 py-px text-[7px] font-mono tracking-[0.12em] border rounded-[1px] bg-transparent ${styles[priority]}`}>
      {labels[priority]}
    </span>
  );
}
