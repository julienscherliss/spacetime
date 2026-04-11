import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Search, Mouse, GripVertical, Focus, List,
  CalendarDays, Grid3X3, Archive, Clock, BarChart3, Repeat,
  Settings, Plus, ArrowUpDown, Tag, CheckCheck, Layers,
  HelpCircle, Hand, MoveHorizontal, ArchiveRestore,
  Link, Unlink, Copy, CalendarCheck, Paperclip, Shield,
  Moon, ListChecks, ExternalLink,
} from 'lucide-react';
import { useTaskStore } from '@/store/taskStore';

interface HelpPanelProps {
  open: boolean;
  onClose: () => void;
  initialSection?: string;
}

interface HelpTip {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: 'navigation' | 'tasks' | 'gestures' | 'features';
  keywords: string[];
  /** Event name to dispatch when "Open" link is clicked */
  openAction?: string;
  /** Label for the action link */
  openLabel?: string;
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  navigation: { label: 'NAVIGATION', color: 'text-blue-500' },
  tasks: { label: 'TASKS', color: 'text-amber-500' },
  gestures: { label: 'GESTURES', color: 'text-emerald-500' },
  features: { label: 'FEATURES', color: 'text-violet-500' },
};

const tips: HelpTip[] = [
  // Navigation
  {
    id: 'views',
    title: 'Switch views',
    description: 'Use the tab bar to switch between Focus, Day, Week, and Month views. Tap the Day tab twice to toggle between timeline and list layout.',
    icon: <List size={16} strokeWidth={1.5} />,
    category: 'navigation',
    keywords: ['view', 'focus', 'day', 'week', 'month', 'calendar', 'switch', 'tab', 'timeline', 'list'],
  },
  {
    id: 'nav-day',
    title: 'Navigate between days',
    description: 'Swipe left/right on the timeline to move between days. On desktop, use the date header arrows or trackpad.',
    icon: <MoveHorizontal size={16} strokeWidth={1.5} />,
    category: 'navigation',
    keywords: ['swipe', 'day', 'navigate', 'next', 'previous', 'arrow', 'trackpad'],
  },
  {
    id: 'overflow-menu',
    title: 'More options menu',
    description: 'On mobile, tap the ··· button (top right) to access Library, Waiting Room, Archive, Analytics, Tag Manager, and Settings.',
    icon: <Layers size={16} strokeWidth={1.5} />,
    category: 'navigation',
    keywords: ['menu', 'more', 'overflow', 'mobile', 'dots', 'settings'],
  },

  // Tasks
  {
    id: 'add-task',
    title: 'Add a new task',
    description: 'Tap the + button at the bottom of the screen, or click-and-drag on an empty slot in the timeline to create a task at that time with a specific duration.',
    icon: <Plus size={16} strokeWidth={1.5} />,
    category: 'tasks',
    keywords: ['add', 'create', 'new', 'task', 'plus', 'button'],
  },
  {
    id: 'edit-task',
    title: 'Edit a task',
    description: 'Single-click or tap a task block to open the edit panel. Change the title, duration, priority, tag, due date, recurrence, notes, subtasks, and attachments. You can also click task names in Archive and Analytics to edit them.',
    icon: <Settings size={16} strokeWidth={1.5} />,
    category: 'tasks',
    keywords: ['edit', 'click', 'tap', 'panel', 'modify', 'change', 'details', 'retag'],
  },
  {
    id: 'complete-task',
    title: 'Complete a task',
    description: 'Double-click or double-tap a task block to mark it complete. A checkmark flash confirms the action.',
    icon: <CheckCheck size={16} strokeWidth={1.5} />,
    category: 'tasks',
    keywords: ['complete', 'done', 'double', 'click', 'tap', 'check', 'finish'],
  },
  {
    id: 'priority',
    title: 'Priority levels',
    description: 'Tasks have 4 priority levels: FLEX (move freely), SEMI (within week only), FIXED (within day only), and LOCK (cannot move at all). Moving a task to another day escalates its priority by one level automatically. The drag overlay turns red when you try to drop a task outside its allowed zone.',
    icon: <ArrowUpDown size={16} strokeWidth={1.5} />,
    category: 'tasks',
    keywords: ['priority', 'flex', 'semi', 'fixed', 'lock', 'escalate', 'level', 'move'],
  },
  {
    id: 'task-mobility',
    title: 'Task Mobility modes',
    description: 'Controls how due dates and movement affect task priority. Three modes available:\n\n• Disabled — No auto-escalation. Due dates don\'t affect priority. Tasks don\'t escalate when moved between days.\n\n• Normal — Tasks due this week auto-escalate to Semi. Tasks due today escalate to Fixed. You can still manually lower priority.\n\n• Elite — Same auto-escalation as Normal, but priority can only go up — never down. Lower priority options are greyed out in the edit panel.\n\nChange this in Settings → Task Mobility.',
    icon: <Shield size={16} strokeWidth={1.5} />,
    category: 'tasks',
    keywords: ['mobility', 'elite', 'normal', 'disabled', 'due', 'date', 'escalate', 'priority', 'restrict', 'settings'],
    openAction: 'toggle-settings',
    openLabel: 'Open Settings',
  },
  {
    id: 'due-dates',
    title: 'Due dates',
    description: 'Set a due date on any task from the edit panel. Due dates interact with the Task Mobility setting — in Normal or Elite mode, approaching deadlines automatically escalate task priority to restrict movement. Quick-set buttons let you pick 1 week, 1 month, 6 months, or 1 year.',
    icon: <CalendarCheck size={16} strokeWidth={1.5} />,
    category: 'tasks',
    keywords: ['due', 'date', 'deadline', 'overdue', 'quick', 'set'],
  },
  {
    id: 'subtasks',
    title: 'Subtasks',
    description: 'Add subtasks within the edit panel to break a task into smaller steps. Check them off individually — the task block shows a progress indicator based on completed subtasks.',
    icon: <ListChecks size={16} strokeWidth={1.5} />,
    category: 'tasks',
    keywords: ['subtask', 'checklist', 'step', 'progress', 'break', 'down'],
  },
  {
    id: 'tags',
    title: 'Tags & categories',
    description: 'Assign a category tag in the edit panel. Tags support a parent/subtag hierarchy using the "parent > subtag" format. Use the Tag Manager to create, rename, and organize tags. Tags drive the Analytics breakdown — click a tag in Analytics to drill down into its subtags.',
    icon: <Tag size={16} strokeWidth={1.5} />,
    category: 'tasks',
    keywords: ['tag', 'category', 'label', 'color', 'organize', 'analytics', 'subtag', 'hierarchy', 'manager'],
  },
  {
    id: 'attachments',
    title: 'Notes & attachments',
    description: 'Add notes in the edit panel description field. URLs typed in notes are automatically detected and shown as clickable link attachments. You can also upload file attachments directly.',
    icon: <Paperclip size={16} strokeWidth={1.5} />,
    category: 'tasks',
    keywords: ['note', 'attachment', 'link', 'url', 'file', 'upload', 'description'],
  },

  // Gestures
  {
    id: 'drag-desktop',
    title: 'Drag to reschedule (desktop)',
    description: 'Click and drag a task block to move it to a new time slot. Drag between day columns in Week view to reschedule across days. The overlay shows the target time and turns red if the drop zone is blocked.',
    icon: <Mouse size={16} strokeWidth={1.5} />,
    category: 'gestures',
    keywords: ['drag', 'move', 'reschedule', 'desktop', 'mouse', 'click', 'week'],
  },
  {
    id: 'drag-mobile',
    title: 'Press & hold to pick up (mobile)',
    description: 'Press and hold a task for ~1 second until the ring fills, then drag to reposition. The hold prevents accidental moves while scrolling.',
    icon: <Hand size={16} strokeWidth={1.5} />,
    category: 'gestures',
    keywords: ['hold', 'press', 'touch', 'mobile', 'pickup', 'ring', 'drag', 'long press'],
  },
  {
    id: 'resize',
    title: 'Resize task duration',
    description: 'Drag the top or bottom edge of a task block to make it longer or shorter. The duration updates in real time. Resizing respects collision boundaries — it won\'t overlap adjacent tasks.',
    icon: <GripVertical size={16} strokeWidth={1.5} />,
    category: 'gestures',
    keywords: ['resize', 'duration', 'longer', 'shorter', 'drag', 'edge', 'bottom', 'top', 'handle'],
  },
  {
    id: 'copy-task',
    title: 'Copy a task',
    description: 'While dragging an unlinked task, move the pointer to the rightmost edge of the column. A "COPY HERE" label and copy icon appear — drop to duplicate the task at that time without moving the original.',
    icon: <Copy size={16} strokeWidth={1.5} />,
    category: 'gestures',
    keywords: ['copy', 'duplicate', 'clone', 'drag', 'right', 'edge'],
  },
  {
    id: 'unlink-task',
    title: 'Unlink a recurring task',
    description: 'Linked recurring tasks move together. To unlink a single instance: drag it to the right edge (shows an Unlink icon), or tap the Unlink chip in the edit panel next to the repeat setting. Unlinking is one-way — once unlinked, the task becomes independent. Its repeat setting changes to "No repeat".',
    icon: <Unlink size={16} strokeWidth={1.5} />,
    category: 'gestures',
    keywords: ['unlink', 'detach', 'recurring', 'linked', 'independent', 'series', 'one-way'],
  },
  {
    id: 'relink-task',
    title: 'Relink a task to a series',
    description: 'To re-join an unlinked task to a series: drag it on top of another task with the same name and duration. A "RELINK" overlay appears. Dropping relinks the task — it adopts the target\'s recurrence, routine status, and series membership without moving from its position.',
    icon: <Link size={16} strokeWidth={1.5} />,
    category: 'gestures',
    keywords: ['relink', 'rejoin', 'series', 'linked', 'drag', 'same', 'name', 'merge'],
  },
  {
    id: 'complete-cal',
    title: 'Complete calendar events',
    description: 'Double-click or double-tap a Google Calendar event to mark it done. Single-click to open its edit panel where you can assign a tag. Tagged completed events count toward your time in Analytics.',
    icon: <CalendarDays size={16} strokeWidth={1.5} />,
    category: 'gestures',
    keywords: ['calendar', 'google', 'event', 'complete', 'double', 'tap'],
  },

  // Features
  {
    id: 'library',
    title: 'Task Library',
    description: 'Store reusable task templates in the Library. Drag them onto the timeline to schedule. The source template stays in the Library — great for tasks you do regularly but aren\'t strict routines. Organize with categories.',
    icon: <Archive size={16} strokeWidth={1.5} />,
    category: 'features',
    keywords: ['library', 'template', 'reusable', 'store', 'drag', 'schedule'],
    openAction: 'toggle-library',
    openLabel: 'Open Library',
  },
  {
    id: 'waiting-room',
    title: 'Waiting Room',
    description: 'Tasks not ready to schedule go to the Waiting Room. They stay out of your timeline but won\'t be forgotten. Tap a task in the Waiting Room to pick it up, then tap a time slot to place it. Overdue unscheduled tasks are automatically moved here.',
    icon: <Clock size={16} strokeWidth={1.5} />,
    category: 'features',
    keywords: ['waiting', 'room', 'hold', 'park', 'later', 'defer'],
    openAction: 'toggle-waiting-room',
    openLabel: 'Open Waiting Room',
  },
  {
    id: 'routines',
    title: 'Routines',
    description: 'Toggle routines on/off from the nav bar (clock icon). Routine tasks repeat automatically and appear as a faded overlay when disabled. In Settings, you can choose whether routines keep fixed clock times across timezone changes.',
    icon: <Repeat size={16} strokeWidth={1.5} />,
    category: 'features',
    keywords: ['routine', 'repeat', 'recurring', 'daily', 'toggle', 'automatic'],
  },
  {
    id: 'analytics',
    title: 'Analytics',
    description: 'View time breakdowns by tag, daily trends, activity heatmaps, completion rates, and neglected tags. Filter by time range, tag, priority, and more. Click any tag in the "Time by Tag" chart to drill down into its subtags. Click task names anywhere in Analytics to open the edit panel for retagging.',
    icon: <BarChart3 size={16} strokeWidth={1.5} />,
    category: 'features',
    keywords: ['analytics', 'stats', 'chart', 'graph', 'time', 'breakdown', 'heatmap', 'trend', 'drill', 'subtag', 'neglected'],
    openAction: 'toggle-analytics',
    openLabel: 'Open Analytics',
  },
  {
    id: 'archive',
    title: 'Archive',
    description: 'Completed and deleted tasks are archived automatically. Browse the archive to review past activity, restore tasks, or click task names to re-edit and retag them. Filter by date, search, or completion status.',
    icon: <ArchiveRestore size={16} strokeWidth={1.5} />,
    category: 'features',
    keywords: ['archive', 'history', 'past', 'deleted', 'skipped', 'restore', 'review'],
    openAction: 'toggle-archive',
    openLabel: 'Open Archive',
  },
  {
    id: 'google-cal',
    title: 'Google Calendar sync',
    description: 'Connect in Settings to overlay your Google Calendar events on the timeline. Toggle individual sub-calendars on/off. Events are cached locally so they appear instantly when navigating — a background sync refreshes data automatically. Hit the sync button to force a refresh.',
    icon: <Grid3X3 size={16} strokeWidth={1.5} />,
    category: 'features',
    keywords: ['google', 'calendar', 'sync', 'connect', 'import', 'overlay', 'events'],
    openAction: 'toggle-settings',
    openLabel: 'Open Settings',
  },
  {
    id: 'focus-view',
    title: 'Focus view',
    description: 'Shows only your current or next scheduled task with a live countdown. Hold the ring to mark complete and auto-advance to the next task.',
    icon: <Focus size={16} strokeWidth={1.5} />,
    category: 'features',
    keywords: ['focus', 'current', 'timer', 'countdown', 'now', 'active', 'ring'],
  },
  {
    id: 'dark-mode',
    title: 'Dark mode',
    description: 'Switch between light and dark themes in Settings → Appearance. The dark theme uses a darker color scheme while preserving the industrial design aesthetic.',
    icon: <Moon size={16} strokeWidth={1.5} />,
    category: 'features',
    keywords: ['dark', 'mode', 'theme', 'light', 'appearance', 'night'],
    openAction: 'toggle-settings',
    openLabel: 'Open Settings',
  },
  {
    id: 'tag-manager',
    title: 'Tag Manager',
    description: 'Create, rename, and organize your tags with a parent/subtag hierarchy. Access from the nav bar or overflow menu. Tags created here are available across all tasks.',
    icon: <Tag size={16} strokeWidth={1.5} />,
    category: 'features',
    keywords: ['tag', 'manager', 'create', 'rename', 'organize', 'hierarchy', 'subtag'],
    openAction: 'toggle-tag-manager',
    openLabel: 'Open Tag Manager',
  },
];

export function HelpPanel({ open, onClose, initialSection }: HelpPanelProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Auto-expand a section when opened with initialSection
  useEffect(() => {
    if (open && initialSection) {
      setExpandedId(initialSection);
      setSearch('');
      setActiveCategory(null);
    }
  }, [open, initialSection]);

  const filtered = useMemo(() => {
    let result = tips;
    if (activeCategory) {
      result = result.filter(t => t.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.keywords.some(k => k.includes(q))
      );
    }
    return result;
  }, [search, activeCategory]);

  const grouped = useMemo(() => {
    const map = new Map<string, HelpTip[]>();
    filtered.forEach(tip => {
      const list = map.get(tip.category) || [];
      list.push(tip);
      map.set(tip.category, list);
    });
    return map;
  }, [filtered]);

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
        >
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative bg-card border border-border rounded-t-lg sm:rounded-lg shadow-lg w-full sm:max-w-md max-h-[85vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <HelpCircle size={14} strokeWidth={1.5} className="text-muted-foreground/60" />
                <h2 className="text-sm font-display font-bold text-foreground tracking-tight">HELP</h2>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tips..."
                  autoFocus
                  className="w-full bg-background border border-border/50 rounded-sm pl-8 pr-3 py-2.5 text-[12px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30 min-h-[44px]"
                />
              </div>
            </div>

            {/* Category pills */}
            <div className="flex items-center gap-1.5 px-4 pb-2 overflow-x-auto">
              <button
                onClick={() => setActiveCategory(null)}
                className={`px-2.5 py-1 rounded-sm text-[9px] font-mono tracking-wider transition-colors border whitespace-nowrap ${
                  !activeCategory
                    ? 'border-primary/30 bg-primary/8 text-primary'
                    : 'border-border/40 text-muted-foreground/50 hover:text-foreground/60'
                }`}
              >
                ALL
              </button>
              {Object.entries(CATEGORY_META).map(([key, { label }]) => (
                <button
                  key={key}
                  onClick={() => setActiveCategory(activeCategory === key ? null : key)}
                  className={`px-2.5 py-1 rounded-sm text-[9px] font-mono tracking-wider transition-colors border whitespace-nowrap ${
                    activeCategory === key
                      ? 'border-primary/30 bg-primary/8 text-primary'
                      : 'border-border/40 text-muted-foreground/50 hover:text-foreground/60'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tips list */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Search size={24} className="text-muted-foreground/15 mb-2" />
                  <p className="text-[11px] font-mono text-muted-foreground/40 tracking-wide">
                    NO MATCHING TIPS
                  </p>
                </div>
              )}

              {['navigation', 'tasks', 'gestures', 'features'].map(cat => {
                const items = grouped.get(cat);
                if (!items || items.length === 0) return null;
                const meta = CATEGORY_META[cat];
                return (
                  <div key={cat} className="mb-3">
                    <div className="flex items-center gap-1.5 py-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${meta.color.replace('text-', 'bg-')}`} />
                      <span className={`text-[9px] font-mono tracking-[0.15em] ${meta.color} opacity-70`}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {items.map(tip => (
                        <TipCard key={tip.id} tip={tip} searchQuery={search} forceExpand={expandedId === tip.id} onClose={onClose} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TipCard({ tip, searchQuery, forceExpand, onClose }: { tip: HelpTip; searchQuery: string; forceExpand?: boolean; onClose?: () => void }) {
  const [expanded, setExpanded] = useState(!!searchQuery.trim() || !!forceExpand);

  useEffect(() => {
    if (forceExpand) setExpanded(true);
  }, [forceExpand]);

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="w-full text-left bg-muted/20 border border-border/30 rounded-sm px-3 py-2.5 hover:bg-muted/40 transition-colors group"
    >
      <div className="flex items-center gap-2.5">
        <span className="text-muted-foreground/50 group-hover:text-foreground/60 transition-colors shrink-0">
          {tip.icon}
        </span>
        <span className="text-[12px] font-mono text-foreground/80 font-medium flex-1">
          {tip.title}
        </span>
        <motion.span
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="text-[10px] text-muted-foreground/30 shrink-0"
        >
          ▸
        </motion.span>
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-2 pl-[28px]">
              <p className="text-[11px] font-mono text-muted-foreground/60 leading-relaxed whitespace-pre-line">
                {tip.description}
              </p>
              {tip.openAction && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent(tip.openAction!));
                    onClose?.();
                  }}
                  className="inline-flex items-center gap-1 mt-2 text-[10px] font-mono text-primary/70 hover:text-primary transition-colors tracking-wider"
                >
                  <ExternalLink size={10} strokeWidth={1.5} />
                  {tip.openLabel || 'Open'}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
