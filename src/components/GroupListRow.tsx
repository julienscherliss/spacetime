import { useState } from 'react';
import { ChevronRight, Layers } from 'lucide-react';
import { useTaskStore, Task } from '@/store/taskStore';
import { formatTime12h } from '@/hooks/useCurrentTime';

interface GroupListRowProps {
  group: Task;
  /** Render a single child row (lets the host control styling per-list). */
  renderChild: (child: Task) => React.ReactNode;
  /** Optional click handler on the group title itself (e.g. open editor). */
  onGroupTap?: (groupId: string) => void;
  /** Whether the entire row is dimmed (e.g. completed). */
  dimmed?: boolean;
}

/**
 * Standardized "Group" row for any list-style schedule view.
 * Shows the Group name + time + child count, and an expander that reveals
 * the children using the host-provided render function.
 */
export function GroupListRow({ group, renderChild, onGroupTap, dimmed }: GroupListRowProps) {
  const [open, setOpen] = useState(false);
  const tasks = useTaskStore((s) => s.tasks);

  const children = tasks
    .filter((t) => t.groupId === group.id && !t.archivedAt)
    .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0));

  const completedCount = children.filter((c) => c.completed).length;

  return (
    <div className={dimmed || group.completed ? 'opacity-50' : ''}>
      <div className="flex items-start gap-2 px-3 py-3 border-b border-border/20">
        {/* Time column */}
        <div className="w-16 flex-shrink-0 pt-0.5">
          {group.time ? (
            <p className="text-[11px] font-mono text-foreground/80 leading-tight">
              {formatTime12h(group.time)}
            </p>
          ) : (
            <p className="text-[9px] font-mono text-muted-foreground/30 tracking-wider">
              ANYTIME
            </p>
          )}
          {group.duration ? (
            <p className="text-[9px] font-mono text-muted-foreground/40 mt-0.5">
              {Math.floor(group.duration / 60) > 0 ? `${Math.floor(group.duration / 60)}h ` : ''}
              {group.duration % 60 > 0 ? `${group.duration % 60}m` : ''}
            </p>
          ) : null}
        </div>

        {/* Expander button + title */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-1 -m-1 rounded-sm text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors"
          aria-label={open ? 'Collapse group' : 'Expand group'}
        >
          <ChevronRight
            size={14}
            strokeWidth={1.5}
            className="transition-transform"
            style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
          />
        </button>

        <button
          onClick={() => onGroupTap?.(group.id)}
          className="flex-1 min-w-0 text-left active:bg-muted/40 rounded-sm -m-1 p-1 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <Layers size={11} strokeWidth={1.5} className="text-muted-foreground/60" />
            <p className={`text-sm font-display font-medium leading-snug ${group.completed ? 'line-through text-muted-foreground/60' : 'text-foreground'}`}>
              {group.title}
            </p>
          </div>
          <p className="text-[9px] font-mono text-muted-foreground/40 mt-1 tracking-wider">
            GROUP · {completedCount}/{children.length} DONE
          </p>
        </button>
      </div>

      {/* Children */}
      {open && children.length > 0 && (
        <div className="pl-12 pr-2 border-l-2 border-border/30 ml-3 my-1">
          {children.map((c) => (
            <div key={c.id}>{renderChild(c)}</div>
          ))}
        </div>
      )}
    </div>
  );
}
