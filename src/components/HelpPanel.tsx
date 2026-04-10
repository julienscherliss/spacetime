import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Search, Mouse, Smartphone, GripVertical, Focus, List,
  CalendarDays, Grid3X3, Archive, Clock, BarChart3, Repeat,
  Settings, Plus, ArrowUpDown, Tag, CheckCheck, Layers, Undo2,
  HelpCircle, Hand, Timer, MoveHorizontal, ArchiveRestore,
} from 'lucide-react';

interface HelpPanelProps {
  open: boolean;
  onClose: () => void;
}

interface HelpTip {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  category: 'navigation' | 'tasks' | 'gestures' | 'features';
  keywords: string[];
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
    description: 'Use the tab bar to switch between Focus, Day, Week, and Month views. Tap Day twice to toggle between timeline and list layout.',
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
    description: 'On mobile, tap the ··· button (top right) to access Library, Waiting Room, Archive, Analytics, and Settings.',
    icon: <Layers size={16} strokeWidth={1.5} />,
    category: 'navigation',
    keywords: ['menu', 'more', 'overflow', 'mobile', 'dots', 'settings'],
  },

  // Tasks
  {
    id: 'add-task',
    title: 'Add a new task',
    description: 'Tap the + button at the bottom of the screen, or tap an empty slot on the timeline to create a task at that time.',
    icon: <Plus size={16} strokeWidth={1.5} />,
    category: 'tasks',
    keywords: ['add', 'create', 'new', 'task', 'plus', 'button'],
  },
  {
    id: 'edit-task',
    title: 'Edit a task',
    description: 'Single-click or tap a task block to open the edit panel. Change the title, duration, tag, notes, and more.',
    icon: <Settings size={16} strokeWidth={1.5} />,
    category: 'tasks',
    keywords: ['edit', 'click', 'tap', 'panel', 'modify', 'change', 'details'],
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
    description: 'Tasks have 4 priority levels: FLEX (move freely), SEMI (within week), FIXED (within day), and LOCK (cannot move). Moving a task escalates its priority by one level.',
    icon: <ArrowUpDown size={16} strokeWidth={1.5} />,
    category: 'tasks',
    keywords: ['priority', 'flex', 'semi', 'fixed', 'lock', 'escalate', 'level', 'move'],
  },
  {
    id: 'tags',
    title: 'Tag your tasks',
    description: 'Assign a category tag in the edit panel. Tags are used in Analytics to track how you spend your time across different areas.',
    icon: <Tag size={16} strokeWidth={1.5} />,
    category: 'tasks',
    keywords: ['tag', 'category', 'label', 'color', 'organize', 'analytics'],
  },

  // Gestures
  {
    id: 'drag-desktop',
    title: 'Drag to reschedule (desktop)',
    description: 'Click and drag a task block to move it to a new time slot. Drag between days in Week view to reschedule across days.',
    icon: <Mouse size={16} strokeWidth={1.5} />,
    category: 'gestures',
    keywords: ['drag', 'move', 'reschedule', 'desktop', 'mouse', 'click'],
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
    description: 'Drag the bottom edge of a task block to make it longer or shorter. The duration updates in real time.',
    icon: <GripVertical size={16} strokeWidth={1.5} />,
    category: 'gestures',
    keywords: ['resize', 'duration', 'longer', 'shorter', 'drag', 'edge', 'bottom', 'handle'],
  },
  {
    id: 'complete-cal',
    title: 'Complete calendar events',
    description: 'Double-click or double-tap a Google Calendar event to mark it done. Tag it first so completed time counts in Analytics.',
    icon: <CalendarDays size={16} strokeWidth={1.5} />,
    category: 'gestures',
    keywords: ['calendar', 'google', 'event', 'complete', 'double', 'tap'],
  },

  // Features
  {
    id: 'library',
    title: 'Task Library',
    description: 'Store reusable task templates in the Library. Drag them onto the timeline to schedule. Great for tasks you do regularly but aren\'t strict routines.',
    icon: <Archive size={16} strokeWidth={1.5} />,
    category: 'features',
    keywords: ['library', 'template', 'reusable', 'store', 'drag', 'schedule'],
  },
  {
    id: 'waiting-room',
    title: 'Waiting Room',
    description: 'Tasks not ready to schedule go to the Waiting Room. They stay out of your timeline but won\'t be forgotten. Move them back when you\'re ready.',
    icon: <Clock size={16} strokeWidth={1.5} />,
    category: 'features',
    keywords: ['waiting', 'room', 'hold', 'park', 'later', 'defer'],
  },
  {
    id: 'routines',
    title: 'Routines',
    description: 'Toggle routines on/off from the nav bar. Routine tasks repeat automatically and can optionally keep fixed times across timezone changes.',
    icon: <Repeat size={16} strokeWidth={1.5} />,
    category: 'features',
    keywords: ['routine', 'repeat', 'recurring', 'daily', 'toggle', 'automatic'],
  },
  {
    id: 'analytics',
    title: 'Analytics',
    description: 'View time breakdowns by tag, daily trends, activity heatmaps, and completion rates. Filter by time range, tag, priority, and more.',
    icon: <BarChart3 size={16} strokeWidth={1.5} />,
    category: 'features',
    keywords: ['analytics', 'stats', 'chart', 'graph', 'time', 'breakdown', 'heatmap', 'trend'],
  },
  {
    id: 'archive',
    title: 'Archive',
    description: 'Completed, skipped, and deleted tasks are archived. Browse the archive to review past activity or restore tasks.',
    icon: <ArchiveRestore size={16} strokeWidth={1.5} />,
    category: 'features',
    keywords: ['archive', 'history', 'past', 'deleted', 'skipped', 'restore', 'review'],
  },
  {
    id: 'google-cal',
    title: 'Google Calendar sync',
    description: 'Connect in Settings to overlay your Google Calendar events on the timeline. Toggle individual sub-calendars on/off. Hit the sync button to refresh.',
    icon: <Grid3X3 size={16} strokeWidth={1.5} />,
    category: 'features',
    keywords: ['google', 'calendar', 'sync', 'connect', 'import', 'overlay', 'events'],
  },
  {
    id: 'focus-view',
    title: 'Focus view',
    description: 'Shows only your current or next scheduled task with a live countdown. Hold the ring to mark complete and auto-advance to the next task.',
    icon: <Focus size={16} strokeWidth={1.5} />,
    category: 'features',
    keywords: ['focus', 'current', 'timer', 'countdown', 'now', 'active', 'ring'],
  },
];

export function HelpPanel({ open, onClose }: HelpPanelProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

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
                        <TipCard key={tip.id} tip={tip} searchQuery={search} />
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

function TipCard({ tip, searchQuery }: { tip: HelpTip; searchQuery: string }) {
  const [expanded, setExpanded] = useState(!!searchQuery.trim());

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
            <p className="text-[11px] font-mono text-muted-foreground/60 leading-relaxed mt-2 pl-[28px]">
              {tip.description}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
