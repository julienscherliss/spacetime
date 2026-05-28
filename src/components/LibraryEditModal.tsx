import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLibraryStore, LibraryTask, LibrarySubtask } from '@/store/libraryStore';
import { X, Trash2, Clock, AlertTriangle, Tag, CalendarDays, Plus, Check, Paperclip, Upload, FileText } from 'lucide-react';
import { AttachmentLightbox } from '@/components/AttachmentLightbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TagAutocomplete } from '@/components/TagAutocomplete';
import { TagPickerMenu } from '@/components/TagPickerMenu';
import { DurationPicker } from '@/components/ScrollWheelPicker';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { DescriptionWithLinks } from '@/components/DescriptionWithLinks';
import { autosizeTextarea } from '@/lib/autosizeTextarea';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatLocalDate, getLocalDayDiff, parseLocalDate } from '@/lib/dateOnly';
import { parseSubtaskText } from '@/lib/parseSubtaskText';

function formatDuration(m: number): string {
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (h > 0 && mins > 0) return `${h}h ${mins}m`;
  if (h > 0) return `${h}h`;
  return `${mins}m`;
}

function getDueBadge(dueDate: string): { text: string; overdue: boolean } {
  const diff = getLocalDayDiff(dueDate);
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
    <div className="flex items-start gap-2.5 group py-1 min-w-0 w-full">
      <Checkbox
        checked={subtask.completed}
        onCheckedChange={onToggle}
        className="h-3.5 w-3.5 mt-1 border-muted-foreground/30 data-[state=checked]:bg-primary/50 data-[state=checked]:border-primary/30 shrink-0"
      />
      <textarea
        ref={(el) => autosizeTextarea(el)}
        value={subtask.title}
        rows={1}
        wrap="soft"
        onChange={(e) => {
          onChange(e.target.value);
          autosizeTextarea(e.currentTarget);
        }}
        onInput={(e) => autosizeTextarea(e.currentTarget)}
        className={`block flex-1 min-w-0 w-full bg-transparent text-[13px] font-mono leading-[1.4] whitespace-pre-wrap [overflow-wrap:anywhere] focus:outline-none resize-none overflow-hidden placeholder:text-muted-foreground/25 py-1 ${
          subtask.completed ? 'text-muted-foreground/35 line-through' : 'text-foreground/75'
        }`}
        placeholder="Subtask…"
      />
      <button
        onClick={onDelete}
        className="p-0.5 mt-1 text-muted-foreground/20 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
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
  const [attachments, setAttachments] = useState<{ name: string; url: string; type: string }[]>(item.attachments || []);
  const [isUploading, setIsUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [newCatInline, setNewCatInline] = useState('');
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [showDuePicker, setShowDuePicker] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const newSubtaskRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const isTouch =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)').matches ||
        window.innerWidth < 768);
    if (!isTouch) titleRef.current?.focus();
  }, []);
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
      attachments,
    });
    setSaveStatus('saved');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => onClose(), 400);
  };

  const MAX_FILE_SIZE = 25 * 1024 * 1024;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`${file.name} exceeds 25MB limit`);
          continue;
        }
        const filePath = `${user.id}/library/${item.id}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from('task-attachments').upload(filePath, file);
        if (error) throw error;
        const { data: signedData } = await supabase.storage.from('task-attachments').createSignedUrl(filePath, 60 * 60 * 24 * 365);
        const url = signedData?.signedUrl || filePath;
        setAttachments(prev => [...prev, { name: file.name, url, type: file.type, path: filePath }]);
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = async (index: number) => {
    const att = attachments[index];
    const storagePath = (att as any).path || (() => {
      const pathMatch = att.url.match(/task-attachments\/(.+?)(?:\?|$)/);
      return pathMatch ? pathMatch[1] : null;
    })();
    if (storagePath) {
      await supabase.storage.from('task-attachments').remove([storagePath]);
    }
    setAttachments(prev => prev.filter((_, i) => i !== index));
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
    const parts = parseSubtaskText(newSubtaskText);
    if (parts.length === 0) return;
    setSubtasks([
      ...subtasks,
      ...parts.map((title) => ({ id: crypto.randomUUID(), title, completed: false })),
    ]);
    setNewSubtaskText('');
    newSubtaskRef.current?.focus();
  };

  const handleSubtaskPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    const ta = e.currentTarget;
    const start = ta.selectionStart ?? newSubtaskText.length;
    const end = ta.selectionEnd ?? newSubtaskText.length;
    const nextValue = newSubtaskText.slice(0, start) + text + newSubtaskText.slice(end);
    const parts = parseSubtaskText(nextValue);
    if (parts.length <= 1) return;
    e.preventDefault();
    setSubtasks([
      ...subtasks,
      ...parts.map((title) => ({ id: crypto.randomUUID(), title, completed: false })),
    ]);
    setNewSubtaskText('');
  };

  const catLabel = categories.find(c => c.value === category)?.label || (category || '');
  const dueBadge = dueDate ? getDueBadge(dueDate) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-background/60 backdrop-blur-[2px]"
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
            <PopoverContent className="w-56 p-3 z-[10000]" align="start" onClick={(e) => e.stopPropagation()}>
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
            <PopoverContent data-date-autocomplete className="w-auto p-0 z-[9999]" align="start" onClick={(e) => e.stopPropagation()} onPointerDownOutside={(e) => e.preventDefault()}>
              <CalendarPicker
                mode="single"
                selected={dueDate ? parseLocalDate(dueDate) : undefined}
                onSelect={(d) => {
                  if (d) setDueDate(formatLocalDate(d));
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
                    onClick={(e) => {
                      e.stopPropagation();
                      const d = new Date();
                      d.setDate(d.getDate() + opt.days);
                      setDueDate(formatLocalDate(d));
                      setTimeout(() => setShowDuePicker(false), 0);
                    }}
                    className="px-2.5 py-1 rounded-sm text-[10px] font-mono tracking-wider text-muted-foreground/60 bg-muted/30 hover:bg-muted/60 hover:text-foreground/70 transition-colors"
                  >
                    {opt.label}
                  </button>
                ))}
                {dueDate && (
                  <button onClick={(e) => { e.stopPropagation(); setDueDate(''); setTimeout(() => setShowDuePicker(false), 0); }}
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
            <PopoverContent className="w-44 p-1 z-[10000]" align="start" onClick={(e) => e.stopPropagation()}>
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
          <DescriptionWithLinks
            value={note}
            onChange={setNote}
            placeholder="Add details, context, links…"
          />

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
          <div className="flex items-start gap-2 mb-5 min-w-0 w-full">
            <Plus size={12} className="text-muted-foreground/25 shrink-0 mt-1.5" />
            <textarea
              ref={(el) => {
                newSubtaskRef.current = el;
                autosizeTextarea(el);
              }}
              value={newSubtaskText}
              rows={1}
              wrap="soft"
              onChange={(e) => {
                setNewSubtaskText(e.target.value);
                autosizeTextarea(e.currentTarget);
              }}
              onInput={(e) => autosizeTextarea(e.currentTarget)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addSubtask(); } }}
              onPaste={handleSubtaskPaste}
              placeholder="Add subtask…"
              className="block flex-1 min-w-0 w-full bg-transparent text-[12px] font-mono leading-[1.4] whitespace-pre-wrap [overflow-wrap:anywhere] text-foreground/60 placeholder:text-muted-foreground/20 focus:outline-none resize-none overflow-hidden py-1"
            />
          </div>

          {/* ─── Attachments ─── */}
          {attachments.length > 0 && (
            <div className="mb-3">
              {attachments.some(a => a.type.startsWith('image/')) && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {attachments.map((att, i) => {
                    if (!att.type.startsWith('image/')) return null;
                    return (
                      <div key={i} className="relative group">
                        <button onClick={(e) => { e.stopPropagation(); setLightboxIndex(i); }}>
                          <img src={att.url} alt={att.name} className="w-16 h-16 object-cover rounded-md border border-border/30 hover:border-primary/30 transition-colors cursor-zoom-in" />
                        </button>
                        <button onClick={() => removeAttachment(i)} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-card border border-border/50 flex items-center justify-center text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                          <X size={8} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {attachments.filter(a => !a.type.startsWith('image/')).map((att, i) => {
                const realIndex = attachments.indexOf(att);
                return (
                  <div key={i} className="flex items-center gap-2 py-1.5 group">
                    <FileText size={11} className="text-muted-foreground/40 shrink-0" />
                    <button onClick={(e) => { e.stopPropagation(); setLightboxIndex(realIndex); }} className="flex-1 text-left text-[10px] font-mono text-foreground/60 hover:text-foreground truncate">
                      {att.name}
                    </button>
                    <button onClick={() => removeAttachment(realIndex)} className="p-0.5 text-muted-foreground/20 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 text-[9px] font-mono tracking-wider text-muted-foreground/30 hover:text-foreground transition-colors mb-3 disabled:opacity-50"
          >
            {isUploading ? (
              <><Upload size={10} strokeWidth={1.5} className="animate-pulse" /> Uploading…</>
            ) : (
              <><Paperclip size={10} strokeWidth={1.5} /> Add attachment</>
            )}
          </button>

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
      {lightboxIndex !== null && (
        <AttachmentLightbox
          attachments={attachments}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </motion.div>
  );
}
