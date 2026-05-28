import { useEffect, useState } from 'react';
import { FileText, ImageOff } from 'lucide-react';
import { resolveAttachmentUrl } from '@/lib/attachmentUrl';

interface Att { name: string; url?: string; type: string; path?: string }

export function AttachmentThumb({ att, onClick }: { att: Att; onClick?: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setSrc(null);
    resolveAttachmentUrl(att).then((url) => {
      if (!active) return;
      if (url) setSrc(url);
      else setFailed(true);
    });
    return () => { active = false; };
  }, [att.path, att.url]);

  if (failed) {
    return (
      <div
        onClick={onClick}
        title={att.name}
        className="w-16 h-16 flex flex-col items-center justify-center rounded-md border border-border/30 bg-muted/20 text-muted-foreground/40 cursor-default"
      >
        <ImageOff size={14} strokeWidth={1.5} />
        <span className="mt-1 text-[8px] font-mono truncate max-w-[3.5rem] px-1">{att.name}</span>
      </div>
    );
  }

  if (!src) {
    return <div className="w-16 h-16 rounded-md border border-border/30 bg-muted/10 animate-pulse" />;
  }

  return (
    <button onClick={onClick} className="block">
      <img
        src={src}
        alt={att.name}
        onError={() => setFailed(true)}
        className="w-16 h-16 object-cover rounded-md border border-border/30 hover:border-primary/30 transition-colors cursor-zoom-in"
      />
    </button>
  );
}

export function AttachmentFileRow({ att, onClick, onRemove }: { att: Att; onClick?: () => void; onRemove?: () => void }) {
  return (
    <div className="flex items-center gap-2 py-1.5 group">
      <FileText size={11} className="text-muted-foreground/40 shrink-0" />
      <button
        onClick={onClick}
        className="flex-1 text-left text-[10px] font-mono text-foreground/60 hover:text-foreground truncate"
      >
        {att.name}
      </button>
      {onRemove && (
        <button onClick={onRemove} className="p-0.5 text-muted-foreground/20 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
          ×
        </button>
      )}
    </div>
  );
}