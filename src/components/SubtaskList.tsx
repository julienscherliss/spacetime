import { useState, useRef, forwardRef, useImperativeHandle, useEffect, useCallback } from 'react';
import { Plus, GripVertical, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

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
}

const generateId = () => Math.random().toString(36).substring(2, 8);

export const SubtaskList = forwardRef<SubtaskListHandle, SubtaskListProps>(
  ({ subtasks, onChange, compact = false }, ref) => {
    const [input, setInput] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const subtaskRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

    const syncTextareaHeight = useCallback((el: HTMLTextAreaElement | null) => {
      if (!el) return;
      el.style.height = '0px';
      el.style.height = `${el.scrollHeight}px`;
    }, []);

    useEffect(() => {
      Object.values(subtaskRefs.current).forEach(syncTextareaHeight);
      syncTextareaHeight(inputRef.current);
    }, [subtasks, input, syncTextareaHeight]);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      setInputValue: (v: string) => setInput(v),
    }));

    const handleAdd = () => {
      if (!input.trim()) return;
      onChange([...subtasks, { id: generateId(), title: input.trim(), completed: false }]);
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

    if (compact) {
      return (
        <div className="space-y-1.5">
          {subtasks.map((s) => (
            <label key={s.id} className="flex items-start gap-2 cursor-pointer group min-w-0">
              <Checkbox
                checked={s.completed}
                onCheckedChange={() => handleToggle(s.id)}
                className="h-3.5 w-3.5 mt-0.5 shrink-0"
              />
              <span
                className={`flex-1 min-w-0 text-[11px] font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
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
        {subtasks.map((s) => (
          <div key={s.id} className="flex items-start gap-2 group min-h-[36px] min-w-0">
            <GripVertical size={10} className="text-muted-foreground/15 shrink-0 mt-2.5" />
            <Checkbox
              checked={s.completed}
              onCheckedChange={() => handleToggle(s.id)}
              className="h-4 w-4 mt-2 shrink-0"
            />
            <textarea
              ref={(el) => {
                subtaskRefs.current[s.id] = el;
                syncTextareaHeight(el);
              }}
              value={s.title}
              wrap="soft"
              rows={1}
              onChange={(e) => {
                handleTitleChange(s.id, e.target.value);
                syncTextareaHeight(e.currentTarget);
              }}
              onInput={(e) => syncTextareaHeight(e.currentTarget)}
              className={`flex-1 min-w-0 w-full bg-transparent text-[12px] font-mono leading-[1.4] whitespace-pre-wrap break-words [overflow-wrap:anywhere] focus:outline-none resize-none overflow-hidden py-2 ${
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
        <div className="flex items-start gap-2 min-h-[36px] min-w-0">
          <Plus size={10} className="text-muted-foreground/20 ml-[10px] shrink-0 mt-2.5" />
          <textarea
            ref={inputRef}
            value={input}
            wrap="soft"
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              syncTextareaHeight(e.currentTarget);
            }}
            onInput={(e) => syncTextareaHeight(e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="Add subtask..."
            className="flex-1 min-w-0 w-full bg-transparent text-[12px] font-mono leading-[1.4] whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-foreground/50 placeholder:text-muted-foreground/20 focus:outline-none resize-none overflow-hidden py-2"
          />
        </div>
      </div>
    );
  }
);

SubtaskList.displayName = 'SubtaskList';
