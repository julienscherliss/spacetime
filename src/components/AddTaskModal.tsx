import { useState, useRef } from 'react';
import { incrementEntryCount } from '@/hooks/useEntryHint';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, Priority } from '@/store/taskStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useCarryStore } from '@/store/carryStore';
import { Plus, X, Clock, Tag, CalendarDays } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { TagAutocomplete } from '@/components/TagAutocomplete';
import { DateAutocomplete } from '@/components/DateAutocomplete';
import { IconPicker } from '@/components/IconPicker';
import { getIconByName } from '@/lib/iconLibrary';
import { resolveCategoryIcon } from '@/lib/resolveTaskIcon';
import { Sparkles } from 'lucide-react';

const PRIORITY_LABELS = ['Flex', 'Semi', 'Fixed', 'Lock'] as const;
const PRIORITY_COLORS = [
  'border-[hsl(var(--priority-0)/0.3)] text-[hsl(var(--priority-0))]',
  'border-[hsl(var(--priority-1)/0.3)] text-[hsl(var(--priority-1))]',
  'border-[hsl(var(--priority-2)/0.3)] text-[hsl(var(--priority-2))]',
  'border-[hsl(var(--priority-3)/0.3)] text-[hsl(var(--priority-3))]',
];

export function AddTaskModal() {
  const [open, setOpen] = useState(false);
  const { addTask } = useTaskStore();
  const categories = useLibraryStore((s) => s.categories);
  const addCategory = useLibraryStore((s) => s.addCategory);
  const isCarrying = useCarryStore((s) => !!s.carried);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('09:00');
  const [duration] = useState(30);
  const [priority, setPriority] = useState<Priority>(0);
  const [category, setCategory] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatInline, setNewCatInline] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    const cleanTitle = title.replace(/#\S*$/, '').replace(/@\S*$/, '').replace(/\/\/\S*$/, '').trim();
    if (!cleanTitle) return;
    addTask({
      title: cleanTitle,
      date,
      time,
      duration,
      priority,
      type: 'one-time',
      category: category || undefined,
      icon: icon || undefined,
    });
    incrementEntryCount();
    setTitle('');
    setDate(new Date().toISOString().split('T')[0]);
    setTime('09:00');
    setPriority(0);
    setCategory('');
    setIcon(null);
    setOpen(false);
  };

  const handleAddCatInline = () => {
    if (!newCatInline.trim()) { setShowNewCatInput(false); return; }
    addCategory(newCatInline.trim());
    setCategory(newCatInline.trim().toLowerCase().replace(/\s+/g, '-'));
    setNewCatInline('');
    setShowNewCatInput(false);
    setShowCatPicker(false);
  };

  const catLabel = categories.find(c => c.value === category)?.label || (category || '');
  const inheritedIcon = resolveCategoryIcon(category, categories);
  const ResolvedIcon = getIconByName(icon) ?? inheritedIcon;

  const formatDateLabel = () => {
    const d = new Date(date + 'T12:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <>
      <button
        onClick={() => !isCarrying && setOpen(true)}
        disabled={isCarrying}
        className="p-2 rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Plus size={16} strokeWidth={1.5} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/60 backdrop-blur-[2px] p-0 sm:p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="bg-card border border-border rounded-t-lg sm:rounded-sm w-full max-w-sm shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Metadata chips row */}
              <div className="px-5 pt-4 pb-2 flex items-center gap-1.5 flex-wrap">
                {/* Priority */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide border transition-colors ${PRIORITY_COLORS[priority]} bg-muted/40 hover:bg-muted/60`}>
                      {PRIORITY_LABELS[priority]}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-36 p-1 z-[70]" align="start">
                    {([0, 1, 2, 3] as Priority[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPriority(p)}
                        className={`w-full text-left px-3 py-2 text-[11px] font-mono rounded-sm transition-colors ${
                          priority === p
                            ? `${PRIORITY_COLORS[p]} bg-muted/50`
                            : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/30'
                        }`}
                      >
                        {PRIORITY_LABELS[p]}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>

                {/* Date */}
                <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide text-foreground/70 bg-muted/40 hover:bg-muted/60 transition-colors">
                      <CalendarDays size={11} strokeWidth={1.5} />
                      {formatDateLabel()}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[70]" align="start" onClick={(e) => e.stopPropagation()}>
                    <Calendar
                      mode="single"
                      selected={new Date(date + 'T12:00:00')}
                      onSelect={(d) => {
                        if (d) setDate(d.toISOString().split('T')[0]);
                        setShowDatePicker(false);
                      }}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>

                {/* Time */}
                <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide text-foreground/70 bg-muted/40">
                  <Clock size={11} strokeWidth={1.5} />
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="bg-transparent focus:outline-none text-[10px] font-mono w-[4.5rem]"
                  />
                </div>

                {/* Tag */}
                <Popover open={showCatPicker} onOpenChange={setShowCatPicker}>
                  <PopoverTrigger asChild>
                    <button className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide transition-colors ${
                      category
                        ? 'text-foreground/70 bg-muted/40 hover:bg-muted/60'
                        : 'text-muted-foreground/40 bg-muted/30 hover:bg-muted/50'
                    }`}>
                      {(() => {
                        const TagI = getIconByName(categories.find(c => c.value === category)?.icon);
                        return TagI ? <TagI size={10} strokeWidth={1.5} /> : <Tag size={10} strokeWidth={1.5} />;
                      })()}
                      {catLabel || 'Tag'}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-40 p-1 z-[70]" align="start" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => { setCategory(''); setShowCatPicker(false); }}
                      className={`w-full text-left px-3 py-2 text-[11px] font-mono rounded-sm ${!category ? 'text-foreground bg-muted/50' : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/30'}`}
                    >
                      No tag
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.value}
                        onClick={() => { setCategory(cat.value); setShowCatPicker(false); }}
                        className={`w-full text-left px-3 py-2 text-[11px] font-mono rounded-sm ${category === cat.value ? 'text-foreground bg-muted/50' : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/30'}`}
                      >
                        {cat.label}
                      </button>
                    ))}
                    <div className="border-t border-border/30 mt-1 pt-1">
                      {showNewCatInput ? (
                        <div className="px-3 py-1.5">
                          <input
                            value={newCatInline}
                            onChange={(e) => setNewCatInline(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddCatInline(); if (e.key === 'Escape') setShowNewCatInput(false); }}
                            onBlur={handleAddCatInline}
                            placeholder="New tag…"
                            className="w-full bg-transparent text-[11px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none border-b border-primary/30"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowNewCatInput(true)}
                          className="w-full text-left px-3 py-2 text-[11px] font-mono text-primary/60 hover:text-primary flex items-center gap-1.5"
                        >
                          <Plus size={10} /> New…
                        </button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Icon */}
                <Popover open={showIconPicker} onOpenChange={setShowIconPicker}>
                  <PopoverTrigger asChild>
                    <button className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide transition-colors ${
                      icon
                        ? 'text-foreground/80 bg-muted/40 hover:bg-muted/60'
                        : 'text-muted-foreground/40 bg-muted/30 hover:bg-muted/50'
                    }`}>
                      {ResolvedIcon
                        ? <ResolvedIcon size={11} strokeWidth={1.5} />
                        : <Sparkles size={10} strokeWidth={1.5} />}
                      {icon ? 'Icon' : (inheritedIcon ? 'Inherit' : 'Icon')}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 z-[70]" align="start" onClick={(e) => e.stopPropagation()}>
                    <IconPicker
                      value={icon}
                      suggestFor={`${title} ${catLabel}`}
                      clearLabel={inheritedIcon ? 'Inherit from tag' : 'No icon'}
                      onChange={(name) => setIcon(name)}
                      onClose={() => setShowIconPicker(false)}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Title input */}
              <div className="px-5 pb-2">
                <div className="relative">
                  <input
                    ref={titleInputRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="What needs to be done?"
                    className="w-full bg-transparent font-display font-bold text-foreground text-lg leading-tight focus:outline-none placeholder:text-muted-foreground/25"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !title.match(/#\S+$/) && !title.match(/@\S*$/)) handleSubmit();
                    }}
                  />
                  <TagAutocomplete
                    inputValue={title}
                    inputRef={titleInputRef as React.RefObject<HTMLInputElement>}
                    onSelectTag={(cat, cleaned) => {
                      setTitle(cleaned);
                      setCategory(cat.value);
                    }}
                  />
                  <DateAutocomplete
                    inputValue={title}
                    inputRef={titleInputRef as React.RefObject<HTMLInputElement>}
                    onSelectDate={(dateStr, cleaned) => {
                      setTitle(cleaned);
                      setDate(dateStr);
                    }}
                  />
                </div>
              </div>

              {/* Hint + Submit */}
              <div className="px-5 pb-5 pt-2">
                <p className="text-[10px] font-mono text-muted-foreground/35 tracking-wider mb-3">
                  To set repeat/routine, edit the task after creation.
                </p>

                <button
                  onClick={handleSubmit}
                  disabled={!title.trim()}
                  className="w-full py-3 rounded-sm bg-primary text-primary-foreground font-mono text-[11px] tracking-widest hover:bg-primary/90 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  CREATE
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
