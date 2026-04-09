import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, Priority } from '@/store/taskStore';
import { useCarryStore } from '@/store/carryStore';
import { Plus, X, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TagAutocomplete } from '@/components/TagAutocomplete';

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
  const isCarrying = useCarryStore((s) => !!s.carried);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('09:00');
  const [duration] = useState(30);
  const [priority, setPriority] = useState<Priority>(0);
  const [category, setCategory] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    const cleanTitle = title.replace(/#\S*$/, '').trim();
    if (!cleanTitle) return;
    addTask({ title: cleanTitle, date, time, duration, priority, type: 'one-time', category: category || undefined });
    setTitle('');
    setDate(new Date().toISOString().split('T')[0]);
    setTime('09:00');
    setPriority(0);
    setCategory('');
    setOpen(false);
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
              className="bg-card border border-border rounded-t-lg sm:rounded-sm p-5 w-full max-w-sm shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-bold text-foreground text-base">New Task</h3>
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground p-1">
                  <X size={16} strokeWidth={1.5} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-mono tracking-widest text-muted-foreground/50 mb-1">TITLE</label>
                  <div className="relative">
                    <input
                      ref={titleInputRef}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="What needs to be done?"
                      className="w-full bg-muted/40 border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !title.match(/#\S+$/)) handleSubmit();
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
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-mono tracking-widest text-muted-foreground/50 mb-1">DATE</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full bg-muted/40 border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono tracking-widest text-muted-foreground/50 mb-1">TIME</label>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full bg-muted/40 border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono tracking-widest text-muted-foreground/50 mb-1.5">PRIORITY</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={`flex items-center gap-1.5 px-3 py-2.5 rounded-sm text-[11px] font-mono tracking-wider border transition-colors ${PRIORITY_COLORS[priority]} bg-muted/40 hover:bg-muted/60`}>
                        {PRIORITY_LABELS[priority]}
                        <ChevronDown size={12} strokeWidth={1.5} />
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
                </div>

                <p className="text-[10px] font-mono text-muted-foreground/35 tracking-wider">
                  To set repeat/routine, edit the task after creation.
                </p>

                <button
                  onClick={handleSubmit}
                  disabled={!title.trim()}
                  className="w-full py-3 rounded-sm bg-primary text-primary-foreground font-mono text-[11px] tracking-widest hover:bg-primary/90 disabled:opacity-20 disabled:cursor-not-allowed transition-colors mt-1"
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
