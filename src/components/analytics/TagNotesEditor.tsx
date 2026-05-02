import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  tag: string;
}

export function TagNotesEditor({ tag }: Props) {
  const [notes, setNotes] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const userIdRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) { setLoaded(true); return; }
      userIdRef.current = uid;
      const { data } = await supabase
        .from('tag_notes')
        .select('notes')
        .eq('user_id', uid)
        .eq('tag_value', tag)
        .maybeSingle();
      if (cancelled) return;
      setNotes(data?.notes ?? '');
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [tag]);

  const scheduleSave = (value: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving('saving');
    saveTimer.current = setTimeout(async () => {
      const uid = userIdRef.current;
      if (!uid) return;
      await supabase.from('tag_notes').upsert(
        { user_id: uid, tag_value: tag, notes: value },
        { onConflict: 'user_id,tag_value' }
      );
      setSaving('saved');
      setTimeout(() => setSaving('idle'), 1200);
    }, 600);
  };

  return (
    <div className="border border-border/40 rounded-md p-4 bg-card/30">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Lock size={10} className="text-muted-foreground/40" />
          <h3 className="text-[9px] font-mono text-muted-foreground/60 tracking-[0.15em]">
            PRIVATE NOTES
          </h3>
        </div>
        <span className="text-[9px] font-mono text-muted-foreground/40">
          {saving === 'saving' ? 'SAVING…' : saving === 'saved' ? 'SAVED' : 'ONLY YOU'}
        </span>
      </div>
      <textarea
        value={notes}
        disabled={!loaded}
        onChange={e => { setNotes(e.target.value); scheduleSave(e.target.value); }}
        placeholder="Notes for your eyes only — context, reminders, ideas about this tag…"
        rows={4}
        className="w-full bg-transparent text-[12px] font-mono text-foreground/90 placeholder:text-muted-foreground/30 focus:outline-none resize-y leading-relaxed"
      />
    </div>
  );
}
