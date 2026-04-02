import { Priority } from '@/store/taskStore';

const labels: Record<Priority, string> = {
  0: 'FLEX',
  1: 'SEMI',
  2: 'FIXED',
  3: 'LOCK',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const colorClass = {
    0: 'bg-priority-0/20 text-priority-0',
    1: 'bg-priority-1/20 text-priority-1',
    2: 'bg-priority-2/20 text-priority-2',
    3: 'bg-priority-3/20 text-priority-3',
  }[priority];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-mono tracking-widest rounded-sm ${colorClass}`}>
      {labels[priority]}
    </span>
  );
}
