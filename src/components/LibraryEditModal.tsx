import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useLibraryStore, LibraryTask, TaskUrgency } from '@/store/libraryStore';
import { X, Trash2, Inbox, Clock, AlertTriangle, Tag, CalendarDays } from 'lucide-react';
import { useTaskStore } from '@/store/taskStore';

interface LibraryEditModalProps {
  item: LibraryTask;
  onClose: () => void;
}

function UrgencyToggle({ value, onChange }: { value: TaskUrgency; onChange: (v: TaskUrgency) => void }) {
  const opts: { key: TaskUrgency; icon: React.ReactNode; label: string }[] = [
    { key: 'none', icon: null, label: 'None' },
    { key: 'urgent', icon: <Clock size={13} strokeWidth={1.8} />, label: 'Urgent' },
    { key: 'important', icon: <AlertTriangle size={13} strokeWidth={1.8} />, label: 'Important' },
  ];
  return (
    <div className="flex items-center gap-1">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key === value ? 'none' : o.key)}
          className={`flex items-center gap-1.5 px-2.5 py-2 rounded-sm border text-[10px] font-mono tracking-wider transition-colors min-h-[40px] ${
            value === o.key && o.key !== 'none'
              ? o.key === 'urgent'
                ? 'border-[hsl(var(--priority-1)/0.4)] bg-[hsl(var(--priority-1)/0.06)] text-[hsl(var(--priority-1))]'
                : 'border-[hsl(var(--priority-2)/0.4)] bg-[hsl(var(--priority-2)/0.06)] text-[hsl(var(--priority-2))]'
              : 'border-border text-muted-foreground/40 hover:text-foreground'
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LibraryEditModal({ item, onClose }: LibraryEditModalProps) {
  const { updateItem, deleteItem, categories, addCategory } = useLibraryStore();
  const [title, setTitle] = useState(item.title);
  const [note, setNote] = useState(item.note || '');
  const [duration, setDuration] = useState(item.defaultDuration);
  const [category, setCategory] = useState(item.category || '');
  const [urgency, setUrgency] = useState<TaskUrgency>(item.urgency || 'none');
  const [dueDate, setDueDate] = useState(item.dueDate || '');
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [newCatInline, setNewCatInline] = useState('');
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const handleSave = () => {
    updateItem(item.id, {
      title: title.trim() || item.title,
      note,
      defaultDuration: duration,
      category,
      urgency,
      dueDate: dueDate || null,
    });
    onClose();
  };

  const handleMoveToWaiting = () => {
    useTaskStore.getState().addTask({
      title: item.title,
      description: item.note || undefined,
      date: new Date().toISOString().split('T')[0],
      type: 'one-time',
      priority: 0,
      duration: item.defaultDuration,
      inWaitingRoom: true,
    });
    deleteItem(item.id);
    onClose();
  };

  const handleDelete = () => {
    deleteItem(item.id);
    onClose();
  };

  const handleAddCatInline = () => {
    if (!newCatInline.trim()) { setShowNewCatInput(false); return; }
    addCategory(newCatInline.trim());
    const val = newCatInline.trim().toLowerCase().replace(/\s+/g, '-');
    setCategory(val);
    setNewCatInline('');
    setShowNewCatInput(false);
    setShowCatPicker(false);
  };

  const catLabel = categories.find(c => c.value === category)?.label || (category ? category : 'No category');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-background/60 backdrop-blur-[2px]"
      onClick={handleSave}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="bg-card border border-border rounded-t-lg sm:rounded-sm w-full sm:max-w-sm shadow-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-3 pb-2 border-b border-border/30 flex items-center justify-between">
          <span className="text-[11px] font-mono text-muted-foreground/50">Edit item</span>
          <button onClick={handleSave} className="p-1 text-muted-foreground/40 hover:text-foreground transition-colors">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Title */}
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Item name…"
            className="w-full bg-transparent font-display font-bold text-foreground text-base leading-tight focus:outline-none placeholder:text-muted-foreground/20"
          />

          {/* Category & duration row */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <button
                onClick={() => setShowCatPicker(!showCatPicker)}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-sm border border-border text-[11px] font-mono text-muted-foreground/60 hover:text-foreground transition-colors min-h-[40px]"
              >
                <Tag size={11} />
                {catLabel}
              </button>
              {showCatPicker && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-sm shadow-md py-1 w-36">
                  <button
                    onClick={() => { setCategory(''); setShowCatPicker(false); }}
                    className={`w-full text-left px-3 py-2 text-[11px] font-mono min-h-[40px] ${!category ? 'text-foreground bg-muted/50' : 'text-muted-foreground/50 hover:text-foreground'}`}
                  >
                    No category
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => { setCategory(cat.value); setShowCatPicker(false); }}
                      className={`w-full text-left px-3 py-2 text-[11px] font-mono min-h-[40px] ${category === cat.value ? 'text-foreground bg-muted/50' : 'text-muted-foreground/50 hover:text-foreground'}`}
                    >
                      {cat.label}
                    </button>
                  ))}
                  <div className="border-t border-border/30 mt-1 pt-1">
                    {showNewCatInput ? (
                      <div className="px-3 py-2">
                        <input
                          value={newCatInline}
                          onChange={(e) => setNewCatInline(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddCatInline(); if (e.key === 'Escape') setShowNewCatInput(false); }}
                          onBlur={handleAddCatInline}
                          placeholder="Category name…"
                          className="w-full bg-transparent text-[11px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none border-b border-primary/30"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowNewCatInput(true)}
                        className="w-full text-left px-3 py-2 text-[11px] font-mono text-primary/60 hover:text-primary flex items-center gap-2 min-h-[40px]"
                      >
                        <Tag size={10} /> New…
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-sm border border-border min-h-[40px]">
              <Clock size={11} className="text-muted-foreground/40" />
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Math.max(5, Number(e.target.value)))}
                min={5}
                step={5}
                className="w-12 bg-transparent text-[11px] font-mono text-foreground text-center focus:outline-none"
              />
              <span className="text-[10px] font-mono text-muted-foreground/40">min</span>
            </div>
          </div>

          {/* Due date */}
          <div className="flex items-center gap-2">
            <CalendarDays size={12} className="text-muted-foreground/40 shrink-0" />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-transparent text-[11px] font-mono text-foreground/70 focus:outline-none border border-border rounded-sm px-2 py-2 min-h-[40px]"
            />
            {dueDate && (
              <button
                onClick={() => setDueDate('')}
                className="text-[9px] font-mono text-muted-foreground/40 hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {/* Urgency */}
          <div>
            <label className="block text-[9px] font-mono tracking-widest text-muted-foreground/40 mb-1.5">PRIORITY</label>
            <UrgencyToggle value={urgency} onChange={setUrgency} />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[9px] font-mono tracking-widest text-muted-foreground/40 mb-1.5">NOTES</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add details, context, links…"
              rows={3}
              className="w-full bg-muted/30 border border-border/50 rounded-sm px-3 py-2.5 text-[12px] font-mono text-foreground/70 placeholder:text-muted-foreground/20 focus:outline-none focus:border-primary/20 resize-none leading-relaxed"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 pt-2 border-t border-border/20">
            <button
              onClick={handleMoveToWaiting}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-sm border border-border text-[10px] font-mono tracking-wider text-muted-foreground/50 hover:text-foreground hover:border-primary/20 transition-colors min-h-[44px]"
            >
              <Inbox size={12} strokeWidth={1.5} />
              WAITING ROOM
            </button>
            <div className="flex-1" />
            <button
              onClick={handleDelete}
              className="p-2.5 rounded-sm border border-border text-muted-foreground/40 hover:text-destructive hover:border-destructive/20 transition-colors min-h-[44px]"
            >
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
