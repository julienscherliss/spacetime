import { Priority } from '@/store/taskStore';

const labels: Record<Priority, string> = {
  0: 'FLEX',
  1: 'SEMI',
  2: 'FIXED',
  3: 'LOCK',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const styles = {
    0: 'bg-priority-0/10 text-priority-0 border-priority-0/20',
    1: 'bg-priority-1/15 text-priority-1 border-priority-1/25',
    2: 'bg-priority-2/15 text-priority-2 border-priority-2/30',
    3: 'bg-priority-3/20 text-priority-3 border-priority-3/40',
  }[priority];

  // Higher priority = more visual weight
  const fontWeight = priority >= 2 ? 'font-semibold' : '';

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono tracking-[0.15em] rounded-sm border ${styles} ${fontWeight}`}>
      {labels[priority]}
    </span>
  );
}
