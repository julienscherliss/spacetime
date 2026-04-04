import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, Priority } from '@/store/taskStore';
import { useCarryStore } from '@/store/carryStore';
import { Plus, X } from 'lucide-react';

export function AddTaskModal() {
  const [open, setOpen] = useState(false);
  const { addTask } = useTaskStore();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(30);
  const [priority, setPriority] = useState<Priority>(0);

  const handleSubmit = () => {
    if (!title.trim()) return;
    addTask({ title: title.trim(), date, time, duration, priority, type: 'one-time' });
    setTitle('');
    setDate(new Date().toISOString().split('T')[0]);
    setTime('09:00');
    setDuration(30);
    setPriority(0);
    setOpen(false);
  };

  const priorityLabels = ['Flex', 'Semi', 'Fixed', 'Lock'];
  const priorityColors = [
    'border-[hsl(var(--priority-0)/0.3)] text-[hsl(var(--priority-0))]',
    'border-[hsl(var(--priority-1)/0.3)] text-[hsl(var(--priority-1))]',
    'border-[hsl(var(--priority-2)/0.3)] text-[hsl(var(--priority-2))]',
    'border-[hsl(var(--priority-3)/0.3)] text-[hsl(var(--priority-3))]',
  ];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
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
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="What needs to be done?"
                    className="w-full bg-muted/40 border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  />
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
                  <label className="block text-[10px] font-mono tracking-widest text-muted-foreground/50 mb-1">DURATION (MIN)</label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    min={5}
                    step={5}
                    className="w-full bg-muted/40 border border-border rounded-sm px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono tracking-widest text-muted-foreground/50 mb-1.5">PRIORITY</label>
                  <div className="flex gap-1.5">
                    {([0, 1, 2, 3] as Priority[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPriority(p)}
                        className={`flex-1 py-2 rounded-sm text-[11px] font-mono tracking-wider border transition-colors ${
                          priority === p
                            ? `${priorityColors[p]} bg-muted/60`
                            : 'border-border text-muted-foreground/50 hover:border-border'
                        }`}
                      >
                        {priorityLabels[p]}
                      </button>
                    ))}
                  </div>
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
