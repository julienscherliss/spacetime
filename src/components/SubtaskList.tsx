import { useState, useRef, forwardRef, useImperativeHandle, useEffect, useCallback } from 'react';
import { Plus, GripVertical, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { autosizeTextarea } from '@/lib/autosizeTextarea';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

interface SubtaskListProps {
  subtasks: Subtask[];
  onChange: (subtasks: Subtask[]) => void;
  compact?: boolean;
}

export interface SubtaskListHandle {
  focus: () => void;
  setInputValue: (v: string) => void;
  flushPendingInput: () => Subtask[];
}

const generateId = () => Math.random().toString(36).substring(2, 8);

export const SubtaskList = forwardRef<SubtaskListHandle, SubtaskListProps>(
  ({ subtasks, onChange, compact = false }, ref) => {
    const [input, setInput] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const subtaskRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

    // Drag state
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [overIndex, setOverIndex] = useState<number | null>(null);

    useEffect(() => {
      Object.values(subtaskRefs.current).forEach(autosizeTextarea);
      autosizeTextarea(inputRef.current);
    }, [subtasks, input]);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      setInputValue: (v: string) => setInput(v),
      flushPendingInput: () => {
        const trimmed = input.trim();
        if (!trimmed) return subtasks;
        const next = [...subtasks, { id: generateId(), title: trimmed, completed: false }];
        onChange(next);
        setInput('');
        return next;
      },
    }));

    const handleAdd = () => {
      if (!input.trim()) return;
      const newId = generateId();
      onChange([...subtasks, { id: newId, title: input.trim(), completed: false }]);
      setInput('');
      inputRef.current?.focus();
    };

    const handleToggle = (id: string) => {
      onChange(subtasks.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s)));
    };

    const handleDelete = (id: string) => {
      onChange(subtasks.filter((s) => s.id !== id));
    };

    const handleTitleChange = (id: string, title: string) => {
      onChange(subtasks.map((s) => (s.id === id ? { ...s, title } : s)));
    };

    const handleSubtaskKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, index: number) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const current = subtasks[index];
        if (!current.title.trim()) {
          // Empty subtask — delete it and focus input
          onChange(subtasks.filter((_, i) => i !== index));
          setTimeout(() => inputRef.current?.focus(), 0);
          return;
        }
        // Insert a new subtask after the current one
        const newId = generateId();
        const newSubtasks = [...subtasks];
        newSubtasks.splice(index + 1, 0, { id: newId, title: '', completed: false });
        onChange(newSubtasks);
        // Focus the new subtask
        setTimeout(() => {
          subtaskRefs.current[newId]?.focus();
        }, 0);
      } else if (e.key === 'Backspace' && subtasks[index].title === '') {
        e.preventDefault();
        onChange(subtasks.filter((_, i) => i !== index));
        // Focus previous subtask or input
        setTimeout(() => {
          if (index > 0) {
            const prevId = subtasks[index - 1].id;
            subtaskRefs.current[prevId]?.focus();
          } else {
            inputRef.current?.focus();
          }
        }, 0);
      }
    };

    // Drag handlers
    const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
      setDragIndex(index);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setOverIndex(index);
    }, []);

    const handleDragEnd = useCallback(() => {
      setDragIndex(null);
      setOverIndex(null);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = dragIndex;
      if (fromIndex === null || fromIndex === toIndex) {
        handleDragEnd();
        return;
      }
      const reordered = [...subtasks];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      onChange(reordered);
      handleDragEnd();
    }, [dragIndex, subtasks, onChange, handleDragEnd]);

    if (compact) {
      return (
        <div className="space-y-1.5">
          {subtasks.map((s) => (
            <label key={s.id} className="flex items-start gap-2 cursor-pointer group min-w-0 w-full">
              <Checkbox
                checked={s.completed}
                onCheckedChange={() => handleToggle(s.id)}
                className="h-3.5 w-3.5 mt-0.5 shrink-0"
              />
              <span
                className={`flex-1 min-w-0 w-full text-[11px] font-mono whitespace-pre-wrap [overflow-wrap:anywhere] ${
                  s.completed ? 'line-through text-muted-foreground/40' : 'text-foreground/70'
                }`}
              >
                {s.title}
              </span>
            </label>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-1.5">
        {subtasks.map((s, i) => (
          <div
            key={s.id}
            draggable
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={(e) => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
            className={`flex items-start gap-2 group min-h-[36px] min-w-0 w-full transition-opacity ${
              dragIndex === i ? 'opacity-30' : ''
            } ${overIndex === i && dragIndex !== i ? 'border-t border-primary/40' : ''}`}
          >
            <div className="cursor-grab active:cursor-grabbing shrink-0 mt-2.5 touch-none">
              <GripVertical size={10} className="text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors" />
            </div>
            <Checkbox
              checked={s.completed}
              onCheckedChange={() => handleToggle(s.id)}
              className="h-4 w-4 mt-2 shrink-0"
            />
            <textarea
              ref={(el) => {
                subtaskRefs.current[s.id] = el;
                autosizeTextarea(el);
              }}
              value={s.title}
              wrap="soft"
              rows={1}
              onChange={(e) => {
                handleTitleChange(s.id, e.target.value);
                autosizeTextarea(e.currentTarget);
              }}
              onInput={(e) => autosizeTextarea(e.currentTarget)}
              onKeyDown={(e) => handleSubtaskKeyDown(e, i)}
              className={`block flex-1 min-w-0 w-full bg-transparent text-[12px] font-mono leading-[1.4] whitespace-pre-wrap [overflow-wrap:anywhere] focus:outline-none resize-none overflow-hidden py-2 ${
                s.completed ? 'line-through text-muted-foreground/30' : 'text-foreground/70'
              }`}
            />
            <button
              onClick={() => handleDelete(s.id)}
              className="p-1 mt-1.5 text-muted-foreground/20 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <X size={11} />
            </button>
          </div>
        ))}
        <div className="flex items-start gap-2 min-h-[36px] min-w-0 w-full">
           <Plus size={10} className="ml-[10px] shrink-0 mt-2.5 text-accent" />
          <textarea
            ref={inputRef}
            value={input}
            wrap="soft"
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              autosizeTextarea(e.currentTarget);
            }}
            onInput={(e) => autosizeTextarea(e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder=""
            className="block flex-1 min-w-0 w-full bg-transparent text-[12px] font-mono leading-[1.4] whitespace-pre-wrap [overflow-wrap:anywhere] text-foreground/50 placeholder:text-muted-foreground/60 focus:outline-none resize-none overflow-hidden py-2"
          />
        </div>
      </div>
    );
  }
);

SubtaskList.displayName = 'SubtaskList';
