import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useLibraryStore, LibraryTask, LibrarySubtask } from '@/store/libraryStore';
import { X, Trash2, Clock, AlertTriangle, Tag, CalendarDays, Plus } from 'lucide-react';
import { DurationPicker } from '@/components/ScrollWheelPicker';
import { Checkbox } from '@/components/ui/checkbox';

interface LibraryEditModalProps {
  item: LibraryTask;
  onClose: () => void;
}

function PriorityToggle({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-md border text-[11px] font-mono tracking-wider transition-all min-h-[42px] ${
        active
          ? 'border-foreground/25 bg-foreground/[0.06] text-foreground font-medium'
          : 'border-border/60 text-muted-foreground/50 hover:text-foreground hover:border-border'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SubtaskRow({ subtask, onToggle, onDelete, onChange }: {
  subtask: LibrarySubtask;
  onToggle: () => void;
  onDelete: () => void;
  onChange: (title: string) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 group py-1.5">
      <Checkbox
        checked={subtask.completed}
        onCheckedChange={onToggle}
        className="h-4 w-4 border-muted-foreground/40 data-[state=checked]:bg-primary/60 data-[state=checked]:border-primary/40"
      />
      <input
        value={subtask.title}
        onChange={(e) => onChange(e.target.value)}
        className={`flex-1 bg-transparent text-[13px] font-mono focus:outline-none placeholder:text-muted-foreground/30 ${
          subtask.completed ? 'text-muted-foreground/40 line-through' : 'text-foreground/80'
        }`}
        placeholder="Subtask…"
      />
      <button
        onClick={onDelete}
        className="p-1 text-muted-foreground/25 hover:text-destructive opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function LibraryEditModal({ item, onClose }: LibraryEditModalProps) {
  const { updateItem, deleteItem, categories, addCategory } = useLibraryStore();
  const [title, setTitle] = useState(item.title);
  const [note, setNote] = useState(item.note || '');
  const [duration, setDuration] = useState(item.defaultDuration);
  const [category, setCategory] = useState(item.category || '');
  const [isUrgent, setIsUrgent] = useState(item.isUrgent ?? false);
  const [isImportant, setIsImportant] = useState(item.isImportant ?? false);
  const [dueDate, setDueDate] = useState(item.dueDate || '');
  const [subtasks, setSubtasks] = useState<LibrarySubtask[]>(item.subtasks || []);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [newCatInline, setNewCatInline] = useState('');
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const newSubtaskRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const handleSave = () => {
    updateItem(item.id, {
      title: title.trim() || item.title,
      note,
      defaultDuration: duration,
      category,
      isUrgent,
      isImportant,
      dueDate: dueDate || null,
      subtasks,
    });
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

  const addSubtask = () => {
    if (!newSubtaskText.trim()) return;
    setSubtasks([...subtasks, { id: crypto.randomUUID(), title: newSubtaskText.trim(), completed: false }]);
    setNewSubtaskText('');
    newSubtaskRef.current?.focus();
  };

  const toggleSubtask = (id: string) => {
    setSubtasks(subtasks.map(s => s.id === id ? { ...s, completed: !s.completed } : s));
  };

  const deleteSubtask = (id: string) => {
    setSubtasks(subtasks.filter(s => s.id !== id));
  };

  const updateSubtaskTitle = (id: string, title: string) => {
    setSubtasks(subtasks.map(s => s.id === id ? { ...s, title } : s));
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
        className="bg-card border border-border/60 rounded-t-lg sm:rounded-lg w-full sm:max-w-sm shadow-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-2.5 border-b border-border/40 flex items-center justify-between">
          <span className="text-[11px] font-mono text-muted-foreground/70 font-medium tracking-wide">Edit item</span>
          <button onClick={handleSave} className="p-1 text-muted-foreground/50 hover:text-foreground transition-colors">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Title */}
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Item name…"
            className="w-full bg-transparent font-display font-bold text-foreground text-base leading-tight focus:outline-none placeholder:text-muted-foreground/30"
          />

          {/* Category */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <button
                onClick={() => setShowCatPicker(!showCatPicker)}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-md border border-border/60 text-[11px] font-mono text-muted-foreground/70 hover:text-foreground hover:border-border transition-colors min-h-[42px]"
              >
                <Tag size={11} />
                {catLabel}
              </button>
              {showCatPicker && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-md shadow-lg py-1 w-40">
                  <button
                    onClick={() => { setCategory(''); setShowCatPicker(false); }}
                    className={`w-full text-left px-3 py-2.5 text-[11px] font-mono min-h-[40px] ${!category ? 'text-foreground bg-muted/50 font-medium' : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/30'}`}
                  >
                    No category
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => { setCategory(cat.value); setShowCatPicker(false); }}
                      className={`w-full text-left px-3 py-2.5 text-[11px] font-mono min-h-[40px] ${category === cat.value ? 'text-foreground bg-muted/50 font-medium' : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted/30'}`}
                    >
                      {cat.label}
                    </button>
                  ))}
                  <div className="border-t border-border/40 mt-1 pt-1">
                    {showNewCatInput ? (
                      <div className="px-3 py-2">
                        <input
                          value={newCatInline}
                          onChange={(e) => setNewCatInline(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddCatInline(); if (e.key === 'Escape') setShowNewCatInput(false); }}
                          onBlur={handleAddCatInline}
                          placeholder="Category name…"
                          className="w-full bg-transparent text-[11px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none border-b border-primary/40"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowNewCatInput(true)}
                        className="w-full text-left px-3 py-2.5 text-[11px] font-mono text-primary/70 hover:text-primary flex items-center gap-2 min-h-[40px]"
                      >
                        <Tag size={10} /> New…
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Duration picker */}
          <div>
            <label className="block text-[9px] font-mono tracking-widest text-muted-foreground/60 mb-2 font-medium">DURATION</label>
            <DurationPicker duration={duration} onChange={setDuration} />
          </div>

          {/* Due date */}
          <div className="flex items-center gap-2">
            <CalendarDays size={13} className="text-muted-foreground/50 shrink-0" />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-transparent text-[12px] font-mono text-foreground/80 focus:outline-none border border-border/60 rounded-md px-2.5 py-2.5 min-h-[42px]"
            />
            {dueDate && (
              <button
                onClick={() => setDueDate('')}
                className="text-[9px] font-mono text-muted-foreground/50 hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {/* Priority toggles - independent */}
          <div>
            <label className="block text-[9px] font-mono tracking-widest text-muted-foreground/60 mb-2 font-medium">PRIORITY</label>
            <div className="flex items-center gap-2">
              <PriorityToggle
                active={isUrgent}
                icon={<Clock size={13} strokeWidth={1.8} />}
                label="Urgent"
                onClick={() => setIsUrgent(!isUrgent)}
              />
              <PriorityToggle
                active={isImportant}
                icon={<AlertTriangle size={13} strokeWidth={1.8} />}
                label="Important"
                onClick={() => setIsImportant(!isImportant)}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[9px] font-mono tracking-widest text-muted-foreground/60 mb-2 font-medium">NOTES</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add details, context, links…"
              rows={3}
              className="w-full bg-muted/30 border border-border/50 rounded-md px-3 py-2.5 text-[13px] font-mono text-foreground/80 placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30 resize-none leading-relaxed"
            />
          </div>

          {/* Subtasks */}
          <div>
            <label className="block text-[9px] font-mono tracking-widest text-muted-foreground/60 mb-2 font-medium">SUBTASKS</label>
            <div className="space-y-0.5">
              {subtasks.map((st) => (
                <SubtaskRow
                  key={st.id}
                  subtask={st}
                  onToggle={() => toggleSubtask(st.id)}
                  onDelete={() => deleteSubtask(st.id)}
                  onChange={(t) => updateSubtaskTitle(st.id, t)}
                />
              ))}
            </div>
            <div className="flex items-center gap-2.5 mt-2">
              <Plus size={13} className="text-muted-foreground/35 shrink-0" />
              <input
                ref={newSubtaskRef}
                value={newSubtaskText}
                onChange={(e) => setNewSubtaskText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addSubtask(); }}
                placeholder="Add subtask…"
                className="flex-1 bg-transparent text-[13px] font-mono text-foreground/80 placeholder:text-muted-foreground/30 focus:outline-none py-1.5"
              />
            </div>
          </div>

          {/* Delete */}
          <div className="flex items-center pt-3 border-t border-border/30">
            <div className="flex-1" />
            <button
              onClick={handleDelete}
              className="p-2.5 rounded-md border border-border/50 text-muted-foreground/50 hover:text-destructive hover:border-destructive/30 transition-colors min-h-[44px]"
            >
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
