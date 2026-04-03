import { useState, useRef } from 'react';
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
  compact?: boolean; // for focus view
}

const generateId = () => Math.random().toString(36).substring(2, 8);

export function SubtaskList({ subtasks, onChange, compact = false }: SubtaskListProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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
          <label key={s.id} className="flex items-center gap-2 cursor-pointer group">
            <Checkbox
              checked={s.completed}
              onCheckedChange={() => handleToggle(s.id)}
              className="h-3.5 w-3.5"
            />
            <span className={`text-[11px] font-mono ${s.completed ? 'line-through text-muted-foreground/40' : 'text-foreground/70'}`}>
              {s.title}
            </span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {subtasks.map((s) => (
        <div key={s.id} className="flex items-center gap-1.5 group">
          <GripVertical size={9} className="text-muted-foreground/15 shrink-0" />
          <Checkbox
            checked={s.completed}
            onCheckedChange={() => handleToggle(s.id)}
            className="h-3 w-3"
          />
          <input
            value={s.title}
            onChange={(e) => handleTitleChange(s.id, e.target.value)}
            className={`flex-1 bg-transparent text-[10px] font-mono focus:outline-none ${
              s.completed ? 'line-through text-muted-foreground/30' : 'text-foreground/70'
            }`}
          />
          <button
            onClick={() => handleDelete(s.id)}
            className="p-0.5 text-muted-foreground/20 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X size={9} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <Plus size={9} className="text-muted-foreground/20 ml-[9px] shrink-0" />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder="Add subtask..."
          className="flex-1 bg-transparent text-[10px] font-mono text-foreground/50 placeholder:text-muted-foreground/20 focus:outline-none"
        />
      </div>
    </div>
  );
}
