import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, X, Pencil } from 'lucide-react';
import { useClientStore, type Client } from '@/store/clientStore';

interface Props {
  clientId: string | null;
  /** Called when the user picks an existing client or creates a new one. */
  onChange: (client: Client | null) => void;
  placeholder?: string;
  /** Show a small "manage" pencil that opens an inline edit popover for the selected client */
  allowEdit?: boolean;
}

/**
 * Searchable client picker with "create new" support.
 * - Type to filter; arrow keys to navigate; Enter picks highlighted or creates a new client.
 * - Shows the selected client's name as a chip; click X to clear.
 */
export function ClientPicker({ clientId, onChange, placeholder = 'Search or add client…', allowEdit = false }: Props) {
  const clients = useClientStore(s => s.clients);
  const loaded = useClientStore(s => s.loaded);
  const load = useClientStore(s => s.load);
  const createClient = useClientStore(s => s.createClient);
  const updateClient = useClientStore(s => s.updateClient);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

  const selected = useMemo(() => clients.find(c => c.id === clientId) || null, [clients, clientId]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open && !editing) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditing(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, editing]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients
      .filter(c => !c.archived)
      .filter(c => !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [clients, query]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? clients.find(c => c.name.toLowerCase() === q) : null;
  }, [clients, query]);

  useEffect(() => { setHighlight(0); }, [query, open]);

  const pick = (c: Client) => {
    onChange(c);
    setOpen(false);
    setQuery('');
  };

  const create = async () => {
    const name = query.trim();
    if (!name) return;
    const c = await createClient({ name });
    if (c) pick(c);
  };

  const startEdit = () => {
    if (!selected) return;
    setEditName(selected.name);
    setEditEmail(selected.email);
    setEditAddress(selected.address);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!selected) return;
    await updateClient(selected.id, { name: editName, email: editEmail, address: editAddress });
    setEditing(false);
  };

  // Selected chip view
  if (selected && !open && !editing) {
    return (
      <div ref={wrapRef} className="flex-1 relative">
        <div className="flex items-center gap-1.5 bg-background/60 border border-border/30 rounded px-2 py-1 min-h-[26px]">
          <span className="text-[11px] font-mono text-foreground truncate flex-1">{selected.name}</span>
          {selected.email && (
            <span className="text-[9px] font-mono text-muted-foreground/50 truncate">{selected.email}</span>
          )}
          {allowEdit && (
            <button
              type="button"
              onClick={startEdit}
              className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors"
              title="Edit client"
            >
              <Pencil size={10} />
            </button>
          )}
          <button
            type="button"
            onClick={() => { setOpen(true); setQuery(''); setTimeout(() => inputRef.current?.focus(), 0); }}
            className="text-[9px] font-mono text-muted-foreground/50 hover:text-foreground tracking-wide px-1"
            title="Change client"
          >
            CHANGE
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="p-0.5 rounded text-muted-foreground/50 hover:text-destructive hover:bg-muted/40 transition-colors"
            title="Clear"
          >
            <X size={11} />
          </button>
        </div>
      </div>
    );
  }

  // Editing the currently-selected client
  if (editing && selected) {
    return (
      <div ref={wrapRef} className="flex-1 relative">
        <div className="border border-border/40 rounded bg-card p-2 space-y-1.5">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Client name"
            className="w-full bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
          />
          <input
            type="text"
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
            placeholder="Email (optional)"
            className="w-full bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
          />
          <textarea
            value={editAddress}
            onChange={(e) => setEditAddress(e.target.value)}
            placeholder="Address (optional)"
            rows={2}
            className="w-full bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50 resize-none"
          />
          <div className="flex items-center gap-1.5 justify-end">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-2 py-1 rounded text-[9px] font-mono tracking-[0.12em] border border-border/40 text-muted-foreground hover:text-foreground transition-colors"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={saveEdit}
              className="px-2 py-1 rounded text-[9px] font-mono tracking-[0.12em] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1"
            >
              <Check size={10} /> SAVE
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Search / create
  return (
    <div ref={wrapRef} className="flex-1 relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          const total = suggestions.length + (!exactMatch && query.trim() ? 1 : 0);
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight(i => Math.min(i + 1, total - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight(i => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlight < suggestions.length) pick(suggestions[highlight]);
            else if (!exactMatch && query.trim()) create();
          } else if (e.key === 'Escape') {
            setOpen(false);
            if (selected) setQuery('');
          }
        }}
        placeholder={placeholder}
        className="w-full bg-transparent border border-border/30 rounded px-2 py-1 text-[11px] font-mono text-foreground focus:outline-none focus:border-primary/50"
      />
      {open && (suggestions.length > 0 || query.trim()) && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-border/50 rounded-md shadow-lg py-1 max-h-56 overflow-y-auto">
          {suggestions.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onMouseEnter={() => setHighlight(i)}
              onPointerDown={(e) => { e.preventDefault(); pick(c); }}
              className={`w-full text-left px-2.5 py-1.5 text-[11px] font-mono transition-colors flex items-baseline justify-between gap-2 ${
                i === highlight ? 'bg-muted/50 text-foreground' : 'text-muted-foreground/80 hover:bg-muted/30 hover:text-foreground'
              }`}
            >
              <span className="truncate">{c.name}</span>
              {c.email && <span className="text-[9px] text-muted-foreground/50 truncate">{c.email}</span>}
            </button>
          ))}
          {!exactMatch && query.trim() && (
            <button
              type="button"
              onMouseEnter={() => setHighlight(suggestions.length)}
              onPointerDown={(e) => { e.preventDefault(); create(); }}
              className={`w-full text-left px-2.5 py-1.5 text-[11px] font-mono transition-colors flex items-center gap-1.5 border-t border-border/20 ${
                highlight === suggestions.length ? 'bg-primary/10 text-primary' : 'text-muted-foreground/80 hover:bg-muted/30 hover:text-foreground'
              }`}
            >
              <Plus size={11} />
              <span>Add new client "<span className="text-foreground">{query.trim()}</span>"</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}