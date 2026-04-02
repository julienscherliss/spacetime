import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTaskStore, Priority, TaskType } from '@/store/taskStore';
import { Plus, X } from 'lucide-react';

export function AddTaskModal() {
  const [open, setOpen] = useState(false);
  const { addTask } = useTaskStore();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(30);
  const [priority, setPriority] = useState<Priority>(0);
  const [type, setType] = useState<TaskType>('one-time');

  const handleSubmit = () => {
    if (!title.trim()) return;
    addTask({ title: title.trim(), date, time, duration, priority, type });
    setTitle('');
    setDate(new Date().toISOString().split('T')[0]);
    setTime('09:00');
    setDuration(30);
    setPriority(0);
    setType('one-time');
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <Plus size={18} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-card border border-border rounded-xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-display font-bold text-foreground text-lg">New Task</h3>
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-mono tracking-widest text-muted-foreground mb-1.5">TITLE</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="What needs to be done?"
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono tracking-widest text-muted-foreground mb-1.5">DATE</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono tracking-widest text-muted-foreground mb-1.5">TIME</label>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono tracking-widest text-muted-foreground mb-1.5">DURATION (MIN)</label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    min={5}
                    step={5}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono tracking-widest text-muted-foreground mb-2">PRIORITY</label>
                  <div className="flex gap-2">
                    {([0, 1, 2, 3] as Priority[]).map((p) => {
                      const labels = ['Flexible', 'Semi', 'Fixed', 'Locked'];
                      const colors = ['priority-0', 'priority-1', 'priority-2', 'priority-3'];
                      return (
                        <button
                          key={p}
                          onClick={() => setPriority(p)}
                          className={`flex-1 py-2 rounded-lg text-[10px] font-mono tracking-wider border transition-colors ${
                            priority === p
                              ? `bg-${colors[p]}/20 border-${colors[p]}/50 text-${colors[p]}`
                              : 'bg-secondary border-border text-muted-foreground hover:border-border/80'
                          }`}
                        >
                          {labels[p]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono tracking-widest text-muted-foreground mb-2">TYPE</label>
                  <div className="flex gap-2">
                    {(['one-time', 'recurring'] as TaskType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setType(t)}
                        className={`flex-1 py-2 rounded-lg text-xs font-mono tracking-wider border transition-colors ${
                          type === t
                            ? 'bg-primary/10 border-primary/30 text-primary'
                            : 'bg-secondary border-border text-muted-foreground'
                        }`}
                      >
                        {t === 'one-time' ? 'One-time' : 'Recurring'}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={!title.trim()}
                  className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-mono text-sm tracking-wider hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors mt-2"
                >
                  CREATE TASK
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
