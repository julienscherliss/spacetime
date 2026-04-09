import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Pencil, X, Check, Globe } from 'lucide-react';
import type { LinkAttachment } from '@/utils/linkDetection';

interface LinkAttachmentListProps {
  links: LinkAttachment[];
  onChange: (links: LinkAttachment[]) => void;
  readonly?: boolean;
}

function LinkChip({
  link,
  onUpdate,
  onDelete,
  readonly,
}: {
  link: LinkAttachment;
  onUpdate: (updates: Partial<LinkAttachment>) => void;
  onDelete: () => void;
  readonly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(link.displayName);
  const [editUrl, setEditUrl] = useState(link.url);

  const handleSave = () => {
    onUpdate({
      displayName: editName.trim() || link.displayName,
      url: editUrl.trim() || link.url,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <motion.div
        layout
        className="border border-primary/20 rounded-md p-2.5 bg-muted/30 space-y-1.5"
      >
        <div>
          <label className="text-[8px] font-mono tracking-widest text-muted-foreground/40 mb-0.5 block">NAME</label>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full bg-transparent text-[11px] font-mono text-foreground focus:outline-none border-b border-border/30 pb-1"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          />
        </div>
        <div>
          <label className="text-[8px] font-mono tracking-widest text-muted-foreground/40 mb-0.5 block">URL</label>
          <input
            value={editUrl}
            onChange={(e) => setEditUrl(e.target.value)}
            className="w-full bg-transparent text-[10px] font-mono text-muted-foreground/60 focus:outline-none border-b border-border/30 pb-1"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          />
        </div>
        <div className="flex justify-end gap-1.5 pt-1">
          <button onClick={() => setEditing(false)} className="p-1 text-muted-foreground/40 hover:text-foreground">
            <X size={10} />
          </button>
          <button onClick={handleSave} className="p-1 text-primary/60 hover:text-primary">
            <Check size={10} />
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15 }}
      className="group flex items-center gap-2 py-1.5 px-2.5 rounded-md border border-border/30 bg-muted/20 hover:bg-muted/35 transition-colors"
    >
      {/* Domain favicon-like icon */}
      <div className="w-5 h-5 rounded-sm bg-muted/50 border border-border/20 flex items-center justify-center shrink-0">
        <Globe size={10} className="text-muted-foreground/50" strokeWidth={1.5} />
      </div>

      {/* Link info — tap opens URL */}
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[11px] font-mono text-foreground/70 truncate leading-tight">
          {link.displayName}
        </div>
        <div className="text-[9px] font-mono text-muted-foreground/35 truncate leading-tight">
          {link.domain}
        </div>
      </a>

      {/* External link indicator */}
      <ExternalLink size={9} className="text-muted-foreground/25 shrink-0" strokeWidth={1.5} />

      {/* Edit/delete controls */}
      {!readonly && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="p-1 text-muted-foreground/30 hover:text-foreground transition-colors"
          >
            <Pencil size={9} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 text-muted-foreground/30 hover:text-destructive transition-colors"
          >
            <X size={9} />
          </button>
        </div>
      )}
    </motion.div>
  );
}

export function LinkAttachmentList({ links, onChange, readonly }: LinkAttachmentListProps) {
  if (links.length === 0) return null;

  const handleUpdate = (id: string, updates: Partial<LinkAttachment>) => {
    onChange(links.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const handleDelete = (id: string) => {
    onChange(links.filter(l => l.id !== id));
  };

  return (
    <div className="space-y-1">
      <AnimatePresence mode="popLayout">
        {links.map((link) => (
          <LinkChip
            key={link.id}
            link={link}
            onUpdate={(u) => handleUpdate(link.id, u)}
            onDelete={() => handleDelete(link.id)}
            readonly={readonly}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
