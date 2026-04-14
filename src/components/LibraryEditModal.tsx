import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLibraryStore, LibraryTask, LibrarySubtask } from '@/store/libraryStore';
import { X, Trash2, Clock, AlertTriangle, Tag, CalendarDays, Plus, Check } from 'lucide-react';
import { TagAutocomplete } from '@/components/TagAutocomplete';
import { TagPickerMenu } from '@/components/TagPickerMenu';
import { DurationPicker } from '@/components/ScrollWheelPicker';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { LinkAttachmentList } from '@/components/LinkAttachmentList';
import { detectNewLinks, removeUrlsFromText, type LinkAttachment } from '@/utils/linkDetection';

function formatDuration(m: number): string {
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (h > 0 && mins > 0) return `${h}h ${mins}m`;
  if (h > 0) return `${h}h`;
  return `${mins}m`;
}

function getDueBadge(dueDate: string): { text: string; overdue: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T12:00:00');
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { text: 'Overdue', overdue: true };
  if (diff === 0) return { text: 'Today', overdue: false };
  if (diff === 1) return { text: 'Tomorrow', overdue: false };
  return { text: `${diff}d`, overdue: false };
}

interface LibraryEditModalProps {
  item: LibraryTask;
  onClose: () => void;
}

function SubtaskRow({ subtask, onToggle, onDelete, onChange }: {
  subtask: LibrarySubtask;
  onToggle: () => void;
  onDelete: () => void;
  onChange: (title: string) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 group py-1">
      <Checkbox
        checked={subtask.completed}
        onCheckedChange={onToggle}
        className="h-3.5 w-3.5 border-muted-foreground/30 data-[state=checked]:bg-primary/50 data-[state=checked]:border-primary/30"
      />
      <input
        value={subtask.title}
        onChange={(e) => onChange(e.target.value)}
        className={`flex-1 bg-transparent text-[13px] font-mono focus:outline-none placeholder:text-muted-foreground/25 ${
          subtask.completed ? 'text-muted-foreground/35 line-through' : 'text-foreground/75'
        }`}
        placeholder="Subtask…"
      />
      <button
        onClick={onDelete}
        className="p-0.5 text-muted-foreground/20 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X size={11} />
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
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [linkAttachments, setLinkAttachments] = useState<LinkAttachment[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [newCatInline, setNewCatInline] = useState('');
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [showDuePicker, setShowDuePicker] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const newSubtaskRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    if (noteRef.current) {
      noteRef.current.style.height = 'auto';
      noteRef.current.style.height = noteRef.current.scrollHeight + 'px';
    }
  }, [note]);
  useEffect(() => () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); }, []);

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
    setSaveStatus('saved');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => onClose(), 400);
  };

  const handleDelete = () => {
    deleteItem(item.id);
    onClose();
  };

  const handleAddCatInline = () => {
    if (!newCatInline.trim()) { setShowNewCatInput(false); return; }
    addCategory(newCatInline.trim());
    setCategory(newCatInline.trim().toLowerCase().replace(/\s+/g, '-'));
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

  const catLabel = categories.find(c => c.value === category)?.label || (category || '');
  const dueBadge = dueDate ? getDueBadge(dueDate) : null;

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
        className="bg-card border border-border/50 rounded-t-lg sm:rounded-lg w-full sm:max-w-md shadow-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Header ─── */}
        <div className="px-5 pt-4 pb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {saveStatus === 'saved' && (
              <motion.span
                initial={{ opacity: 0, x: 4 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-1 text-[9px] font-mono text-primary/60 tracking-wider"
              >
                <Check size={10} /> Saved
              </motion.span>
            )}
          </div>
          <button
            onClick={handleSave}
            className="text-[11px] font-mono tracking-wider text-foreground/60 hover:text-foreground transition-colors"
          >
            Done
          </button>
        </div>

        {/* ─── Metadata chips (top, above title) ─── */}
        <div className="px-5 pb-2 flex items-center gap-1.5 flex-wrap">
          {/* Duration */}
          <Popover open={showDurationPicker} onOpenChange={setShowDurationPicker}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide text-muted-foreground/60 hover:text-foreground bg-muted/40 hover:bg-muted/60 transition-colors">
                <Clock size={11} strokeWidth={1.5} />
                {formatDuration(duration)}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-3 z-[70]" align="start" onClick={(e) => e.stopPropagation()}>
              <DurationPicker duration={duration} onChange={setDuration} />
            </PopoverContent>
          </Popover>

          {/* Due date */}
          <Popover open={showDuePicker} onOpenChange={setShowDuePicker}>
            <PopoverTrigger asChild>
              <button className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide transition-colors ${
                dueBadge?.overdue
                  ? 'text-destructive/80 bg-destructive/10'
                  : dueDate
                    ? 'text-foreground/70 bg-muted/40'
                    : 'text-muted-foreground/40 bg-muted/30 hover:bg-muted/50'
              }`}>
                <CalendarDays size={11} strokeWidth={1.5} />
                {dueBadge ? dueBadge.text : 'Due'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[70]" align="start" onClick={(e) => e.stopPropagation()} onPointerDownOutside={(e) => e.preventDefault()}>
              <CalendarPicker
                mode="single"
                selected={dueDate ? new Date(dueDate + 'T12:00:00') : undefined}
                onSelect={(d) => {
                  if (d) setDueDate(d.toISOString().split('T')[0]);
                  else setDueDate('');
                  setTimeout(() => setShowDuePicker(false), 0);
                }}
                className="p-3 pointer-events-auto"
              />
              <div className="flex items-center gap-1.5 px-3 pb-2">
                {[
                  { label: '1w', days: 7 },
                  { label: '1m', days: 30 },
                  { label: '6m', days: 182 },
                  { label: '1y', days: 365 },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + opt.days);
                      setDueDate(d.toISOString().split('T')[0]);
                      setShowDuePicker(false);
                    }}
                    className="px-2.5 py-1 rounded-sm text-[10px] font-mono tracking-wider text-muted-foreground/60 bg-muted/30 hover:bg-muted/60 hover:text-foreground/70 transition-colors"
                  >
                    {opt.label}
                  </button>
                ))}
                {dueDate && (
                  <button onClick={() => { setDueDate(''); setShowDuePicker(false); }}
                    className="ml-auto text-[10px] font-mono text-muted-foreground/40 hover:text-destructive/60">
                    Clear
                  </button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Category / Tag */}
          <Popover open={showCatPicker} onOpenChange={setShowCatPicker}>
            <PopoverTrigger asChild>
              <button className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide transition-colors ${
                category
                  ? 'text-foreground/70 bg-muted/40 hover:bg-muted/60'
                  : 'text-muted-foreground/40 bg-muted/30 hover:bg-muted/50'
              }`}>
                <Tag size={10} strokeWidth={1.5} />
                {catLabel || 'Tag'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-1 z-[70]" align="start" onClick={(e) => e.stopPropagation()}>
              <TagPickerMenu
                value={category}
                onChange={(v) => setCategory(v)}
                onClose={() => setShowCatPicker(false)}
              />
            </PopoverContent>
          </Popover>

          {/* Urgent */}
          <button
            onClick={() => setIsUrgent(!isUrgent)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide transition-colors ${
              isUrgent
                ? 'text-foreground/80 bg-foreground/[0.07]'
                : 'text-muted-foreground/35 bg-muted/25 hover:bg-muted/40'
            }`}
          >
            <Clock size={10} strokeWidth={1.5} />
            {isUrgent ? 'Urgent' : ''}
          </button>

          {/* Important */}
          <button
            onClick={() => setIsImportant(!isImportant)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide transition-colors ${
              isImportant
                ? 'text-foreground/80 bg-foreground/[0.07]'
                : 'text-muted-foreground/35 bg-muted/25 hover:bg-muted/40'
            }`}
          >
            <AlertTriangle size={10} strokeWidth={1.5} />
            {isImportant ? 'Important' : ''}
          </button>
        </div>

        <div className="px-5 pb-5">
          {/* ─── Title ─── */}
          <div className="relative">
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing…"
              className="w-full bg-transparent font-display font-bold text-foreground text-lg leading-tight focus:outline-none placeholder:text-muted-foreground/25 mb-2"
            />
            <TagAutocomplete
              inputValue={title}
              inputRef={titleRef as React.RefObject<HTMLInputElement>}
              onSelectTag={(cat, cleaned) => {
                setTitle(cleaned);
                setCategory(cat.value);
              }}
            />
          </div>

          {/* ─── Subtitle / Notes (always fully visible) ─── */}
          <textarea
            ref={noteRef}
            value={note}
            onChange={(e) => {
              const val = e.target.value;
              setNote(val);
              const ta = e.target;
              ta.style.height = 'auto';
              ta.style.height = ta.scrollHeight + 'px';
              const newLinks = detectNewLinks(val, linkAttachments);
              if (newLinks.length > 0) {
                setLinkAttachments(prev => [...prev, ...newLinks]);
                setNote(removeUrlsFromText(val, newLinks.map(l => l.url)));
              }
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text');
              setTimeout(() => {
                const newLinks = detectNewLinks(pasted, linkAttachments);
                if (newLinks.length > 0) {
                  setLinkAttachments(prev => [...prev, ...newLinks]);
                  setNote(prev => removeUrlsFromText(prev, newLinks.map(l => l.url)));
                }
              }, 0);
            }}
            placeholder="Add details, context, links…"
            rows={2}
            className="w-full bg-transparent text-[13px] font-mono text-foreground/60 placeholder:text-muted-foreground/20 focus:outline-none resize-none leading-relaxed mb-2"
          />

          {/* ─── Link Attachments ─── */}
          {linkAttachments.length > 0 && (
            <div className="mb-4">
              <LinkAttachmentList links={linkAttachments} onChange={setLinkAttachments} />
            </div>
          )}

          {/* ─── Subtasks ─── */}
          {(subtasks.length > 0 || newSubtaskText) && (
            <div className="mb-4">
              {subtasks.map((st) => (
                <SubtaskRow
                  key={st.id}
                  subtask={st}
                  onToggle={() => setSubtasks(subtasks.map(s => s.id === st.id ? { ...s, completed: !s.completed } : s))}
                  onDelete={() => setSubtasks(subtasks.filter(s => s.id !== st.id))}
                  onChange={(t) => setSubtasks(subtasks.map(s => s.id === st.id ? { ...s, title: t } : s))}
                />
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mb-5">
            <Plus size={12} className="text-muted-foreground/25 shrink-0" />
            <input
              ref={newSubtaskRef}
              value={newSubtaskText}
              onChange={(e) => setNewSubtaskText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addSubtask(); }}
              placeholder="Add subtask…"
              className="flex-1 bg-transparent text-[12px] font-mono text-foreground/60 placeholder:text-muted-foreground/20 focus:outline-none py-1"
            />
          </div>

          {/* ─── Delete ─── */}
          <div className="flex items-center pt-3 border-t border-border/20">
            <div className="flex-1" />
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
              className="p-2.5 rounded-md text-muted-foreground/35 hover:text-destructive transition-colors"
              title="Delete"
            >
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
