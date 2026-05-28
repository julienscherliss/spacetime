import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Bug, Sparkles, HelpCircle, MessageSquare, ChevronDown, ChevronUp,
  Trash2, ExternalLink, Mail, Copy, Loader2, Image as ImageIcon, Filter,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Resolves a feedback-screenshots reference to a displayable URL. New entries
// store the storage path (private bucket → signed URL); legacy entries stored
// a full public URL.
function ScreenshotPreview({ reference }: { reference: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (/^https?:\/\//i.test(reference)) {
      setUrl(reference);
      return;
    }
    supabase.storage
      .from('feedback-screenshots')
      .createSignedUrl(reference, 60 * 10)
      .then(({ data }) => { if (!cancelled) setUrl(data?.signedUrl ?? null); });
    return () => { cancelled = true; };
  }, [reference]);
  if (!url) return <div className="text-[11px] font-mono text-muted-foreground p-3">Loading…</div>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block border border-border/40 rounded-md overflow-hidden bg-muted/30 hover:border-border transition-colors">
      <img src={url} alt="Screenshot" className="w-full max-h-64 object-contain" />
    </a>
  );
}

interface FeedbackRow {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  followup_email: string | null;
  type: 'bug' | 'feature' | 'confusion' | 'general';
  title: string | null;
  message: string;
  expected_behavior: string | null;
  location_context: string | null;
  screenshot_url: string | null;
  current_route: string | null;
  app_version: string | null;
  platform: string | null;
  browser: string | null;
  os: string | null;
  screen_size: string | null;
  metadata: any;
  admin_response: string | null;
  internal_notes: string | null;
  status: 'unreviewed' | 'in_process' | 'resolved' | 'closed' | 'duplicate' | 'need_more_info';
  priority: 'low' | 'medium' | 'high';
  reviewed_at: string | null;
  resolved_at: string | null;
  response_sent_at: string | null;
}

const TYPE_META: Record<string, { icon: typeof Bug; tone: string; label: string }> = {
  bug:        { icon: Bug,           tone: 'text-destructive',          label: 'BUG' },
  feature:    { icon: Sparkles,      tone: 'text-primary',              label: 'FEATURE' },
  confusion:  { icon: HelpCircle,    tone: 'text-yellow-600',           label: 'CONFUSION' },
  general:    { icon: MessageSquare, tone: 'text-muted-foreground',     label: 'GENERAL' },
};

const STATUS_OPTIONS: { value: FeedbackRow['status']; label: string }[] = [
  { value: 'unreviewed', label: 'Unreviewed' },
  { value: 'in_process', label: 'In process' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'need_more_info', label: 'Need info' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'closed', label: 'Closed' },
];

const PRIORITY_OPTIONS: FeedbackRow['priority'][] = ['low', 'medium', 'high'];

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function FeedbackAdminTab() {
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setItems((data || []) as FeedbackRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (statusFilter !== 'all' && it.status !== statusFilter) return false;
      if (typeFilter !== 'all' && it.type !== typeFilter) return false;
      if (priorityFilter !== 'all' && it.priority !== priorityFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${it.message} ${it.expected_behavior || ''} ${it.location_context || ''} ${it.current_route || ''} ${it.followup_email || ''} ${it.platform || ''} ${it.browser || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, statusFilter, typeFilter, priorityFilter]);

  const counts = useMemo(() => {
    const c = { unreviewed: 0, in_process: 0, resolved: 0, total: items.length };
    items.forEach((i) => {
      if (i.status === 'unreviewed') c.unreviewed++;
      else if (i.status === 'in_process') c.in_process++;
      else if (i.status === 'resolved') c.resolved++;
    });
    return c;
  }, [items]);

  const updateItem = async (id: string, patch: Partial<FeedbackRow>) => {
    const final: any = { ...patch };
    if (patch.status === 'resolved' && !patch.resolved_at) final.resolved_at = new Date().toISOString();
    if (patch.status && patch.status !== 'unreviewed') final.reviewed_at = final.reviewed_at || new Date().toISOString();
    const { error } = await supabase.from('feedback').update(final).eq('id', id);
    if (error) {
      toast.error(error.message);
    } else {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...final } : it)));
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Delete this feedback permanently?')) return;
    const { error } = await supabase.from('feedback').delete().eq('id', id);
    if (error) toast.error(error.message);
    else setItems((prev) => prev.filter((it) => it.id !== id));
  };

  return (
    <div className="space-y-3">
      {/* Counts */}
      <div className="grid grid-cols-3 gap-2.5">
        <CountCard label="UNREVIEWED" value={counts.unreviewed} accent={counts.unreviewed > 0} />
        <CountCard label="IN PROCESS" value={counts.in_process} />
        <CountCard label="RESOLVED" value={counts.resolved} />
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search messages, routes, emails…"
            className="w-full bg-muted/30 border border-border/40 rounded-md pl-7 pr-3 py-1.5 text-[10px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40"
          />
        </div>
        <button
          onClick={() => setShowFilters((s) => !s)}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-[9px] font-mono tracking-wider border transition-colors ${
            showFilters || statusFilter !== 'all' || typeFilter !== 'all' || priorityFilter !== 'all'
              ? 'border-primary/40 text-primary bg-primary/5'
              : 'border-border/40 text-muted-foreground hover:text-foreground'
          }`}
        >
          <Filter size={10} />
          FILTERS
        </button>
      </div>

      {showFilters && (
        <div className="grid grid-cols-3 gap-2 pb-1">
          <FilterSelect label="STATUS" value={statusFilter} onChange={setStatusFilter} options={[{ value: 'all', label: 'All' }, ...STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))]} />
          <FilterSelect label="TYPE" value={typeFilter} onChange={setTypeFilter} options={[{ value: 'all', label: 'All' }, ...Object.entries(TYPE_META).map(([k, m]) => ({ value: k, label: m.label }))]} />
          <FilterSelect label="PRIORITY" value={priorityFilter} onChange={setPriorityFilter} options={[{ value: 'all', label: 'All' }, ...PRIORITY_OPTIONS.map((p) => ({ value: p, label: p.toUpperCase() }))]} />
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={14} className="animate-spin text-muted-foreground/40" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-[10px] font-mono text-muted-foreground/40 tracking-[0.18em]">
          {items.length === 0 ? 'NO FEEDBACK YET' : 'NO MATCHES'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((it) => (
            <FeedbackItem
              key={it.id}
              item={it}
              expanded={expandedId === it.id}
              onToggle={() => setExpandedId(expandedId === it.id ? null : it.id)}
              onUpdate={(patch) => updateItem(it.id, patch)}
              onDelete={() => deleteItem(it.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CountCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`border rounded-lg p-3 ${accent && value > 0 ? 'border-primary/30 bg-primary/5' : 'border-border/30 bg-card/50'}`}>
      <div className="text-[7px] font-mono text-muted-foreground/40 tracking-[0.15em] mb-1.5">{label}</div>
      <div className={`text-xl font-display font-bold leading-none ${accent && value > 0 ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <div className="text-[7px] font-mono text-muted-foreground/35 tracking-[0.15em] mb-1">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-muted/30 border border-border/40 rounded-md px-2 py-1.5 text-[10px] font-mono text-foreground focus:outline-none"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function FeedbackItem({
  item,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
}: {
  item: FeedbackRow;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<FeedbackRow>) => void;
  onDelete: () => void;
}) {
  const meta = TYPE_META[item.type];
  const Icon = meta.icon;
  const [response, setResponse] = useState(item.admin_response || '');
  const [notes, setNotes] = useState(item.internal_notes || '');
  const [savingResponse, setSavingResponse] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const isUnreviewed = item.status === 'unreviewed';

  const summary = item.message.length > 80 ? item.message.slice(0, 80) + '…' : item.message;

  const saveResponse = async () => {
    setSavingResponse(true);
    await onUpdate({ admin_response: response });
    setSavingResponse(false);
    toast.success('Response saved');
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    await onUpdate({ internal_notes: notes });
    setSavingNotes(false);
    toast.success('Notes saved');
  };

  const copyEmail = () => {
    if (!item.followup_email) return;
    navigator.clipboard.writeText(item.followup_email);
    toast.success('Email copied');
  };

  const mailtoHref = item.followup_email
    ? `mailto:${item.followup_email}?subject=${encodeURIComponent('Re: Your Spacetime feedback')}&body=${encodeURIComponent((response || '') + '\n\n— Spacetime\n\n---\nYour message:\n' + item.message)}`
    : null;

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${
      isUnreviewed ? 'border-primary/30 bg-primary/[0.02]' : 'border-border/30 bg-card/30'
    }`}>
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-2.5 p-3 text-left hover:bg-muted/20 transition-colors"
      >
        <Icon size={12} strokeWidth={1.5} className={`${meta.tone} mt-0.5 shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className={`text-[7px] font-mono tracking-[0.12em] px-1.5 py-0.5 rounded ${meta.tone} bg-current/10`}>
              {meta.label}
            </span>
            <PriorityBadge priority={item.priority} />
            <StatusBadge status={item.status} />
            {isUnreviewed && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
            <span className="text-[8px] font-mono text-muted-foreground/40 ml-auto">{relTime(item.created_at)}</span>
          </div>
          <div className="text-[11px] font-mono text-foreground/85 truncate">{summary}</div>
          <div className="flex items-center gap-2 mt-1 text-[8px] font-mono text-muted-foreground/40">
            {item.followup_email && <span>{item.followup_email}</span>}
            {item.current_route && <span className="truncate">{item.current_route}</span>}
            {item.platform && <span>{item.platform}</span>}
          </div>
        </div>
        {expanded ? <ChevronUp size={11} className="text-muted-foreground/40 shrink-0 mt-1" /> : <ChevronDown size={11} className="text-muted-foreground/40 shrink-0 mt-1" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/15">
              {/* Full message */}
              <div>
                <SectionLabel>MESSAGE</SectionLabel>
                <p className="text-[11px] font-mono text-foreground/85 leading-relaxed whitespace-pre-wrap">{item.message}</p>
              </div>

              {item.expected_behavior && (
                <div>
                  <SectionLabel>EXPECTED</SectionLabel>
                  <p className="text-[11px] font-mono text-foreground/70 leading-relaxed whitespace-pre-wrap">{item.expected_behavior}</p>
                </div>
              )}
              {item.location_context && (
                <div>
                  <SectionLabel>WHERE</SectionLabel>
                  <p className="text-[11px] font-mono text-foreground/70">{item.location_context}</p>
                </div>
              )}

              {/* Screenshot */}
              {item.screenshot_url && (
                <div>
                  <SectionLabel>SCREENSHOT</SectionLabel>
                  <a href={item.screenshot_url} target="_blank" rel="noreferrer" className="block border border-border/40 rounded-md overflow-hidden bg-muted/30 hover:border-border transition-colors">
                    <img src={item.screenshot_url} alt="Screenshot" className="w-full max-h-64 object-contain" />
                  </a>
                </div>
              )}

              {/* Context grid */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <Meta label="ROUTE" value={item.current_route} />
                <Meta label="PLATFORM" value={item.platform} />
                <Meta label="BROWSER" value={item.browser} />
                <Meta label="OS" value={item.os} />
                <Meta label="SCREEN" value={item.screen_size} />
                <Meta label="VERSION" value={item.app_version} />
              </div>

              {/* Status / priority controls */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <SectionLabel>STATUS</SectionLabel>
                  <select
                    value={item.status}
                    onChange={(e) => onUpdate({ status: e.target.value as FeedbackRow['status'] })}
                    className="w-full bg-muted/30 border border-border/40 rounded-md px-2 py-1.5 text-[10px] font-mono text-foreground focus:outline-none"
                  >
                    {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <SectionLabel>PRIORITY</SectionLabel>
                  <select
                    value={item.priority}
                    onChange={(e) => onUpdate({ priority: e.target.value as FeedbackRow['priority'] })}
                    className="w-full bg-muted/30 border border-border/40 rounded-md px-2 py-1.5 text-[10px] font-mono text-foreground focus:outline-none"
                  >
                    {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                  </select>
                </div>
              </div>

              {/* Internal notes */}
              <div>
                <SectionLabel>INTERNAL NOTES</SectionLabel>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Notes only you can see…"
                  className="w-full bg-muted/30 border border-border/40 rounded-md px-2 py-1.5 text-[10px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none resize-y"
                />
                {notes !== (item.internal_notes || '') && (
                  <button
                    onClick={saveNotes}
                    disabled={savingNotes}
                    className="mt-1 text-[9px] font-mono tracking-wider text-primary hover:text-primary/80 px-2 py-0.5 disabled:opacity-50"
                  >
                    {savingNotes ? 'SAVING…' : 'SAVE NOTES'}
                  </button>
                )}
              </div>

              {/* Response */}
              <div>
                <SectionLabel>
                  RESPONSE TO USER
                  {item.response_sent_at && (
                    <span className="ml-2 text-primary normal-case font-normal">· sent {relTime(item.response_sent_at)}</span>
                  )}
                </SectionLabel>
                <textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={3}
                  placeholder={item.followup_email ? 'Write a reply…' : 'No email provided — draft only'}
                  className="w-full bg-muted/30 border border-border/40 rounded-md px-2 py-1.5 text-[10px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none resize-y"
                />
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {response !== (item.admin_response || '') && (
                    <button
                      onClick={saveResponse}
                      disabled={savingResponse}
                      className="text-[9px] font-mono tracking-wider text-primary border border-primary/30 hover:bg-primary/5 px-2 py-1 rounded disabled:opacity-50"
                    >
                      {savingResponse ? 'SAVING…' : 'SAVE'}
                    </button>
                  )}
                  {item.followup_email && (
                    <>
                      <button
                        onClick={copyEmail}
                        className="flex items-center gap-1 text-[9px] font-mono tracking-wider text-muted-foreground hover:text-foreground border border-border/40 hover:border-border px-2 py-1 rounded"
                      >
                        <Copy size={9} /> COPY EMAIL
                      </button>
                      {mailtoHref && (
                        <a
                          href={mailtoHref}
                          onClick={() => onUpdate({ response_sent_at: new Date().toISOString(), admin_response: response })}
                          className="flex items-center gap-1 text-[9px] font-mono tracking-wider text-primary border border-primary/30 hover:bg-primary/5 px-2 py-1 rounded"
                        >
                          <Mail size={9} /> OPEN MAIL CLIENT
                        </a>
                      )}
                    </>
                  )}
                  <div className="flex-1" />
                  <button
                    onClick={onDelete}
                    className="flex items-center gap-1 text-[9px] font-mono tracking-wider text-destructive/70 hover:text-destructive border border-destructive/20 hover:border-destructive/40 px-2 py-1 rounded"
                  >
                    <Trash2 size={9} /> DELETE
                  </button>
                </div>
              </div>

              {/* Meta footer */}
              <div className="text-[8px] font-mono text-muted-foreground/30 pt-1">
                ID: {item.id} · Created {new Date(item.created_at).toLocaleString()}
                {item.user_id && <> · User {item.user_id.slice(0, 8)}</>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[7px] font-mono text-muted-foreground/45 tracking-[0.18em] mb-1 uppercase">{children}</div>;
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[6px] font-mono text-muted-foreground/35 tracking-[0.15em]">{label}</div>
      <div className="text-[9px] font-mono text-foreground/60 truncate">{value || '—'}</div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: FeedbackRow['priority'] }) {
  const colors = {
    low:    'bg-muted/40 text-muted-foreground/60',
    medium: 'bg-yellow-500/10 text-yellow-600',
    high:   'bg-destructive/10 text-destructive',
  };
  return (
    <span className={`text-[7px] font-mono tracking-[0.12em] px-1.5 py-0.5 rounded ${colors[priority]}`}>
      {priority.toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: FeedbackRow['status'] }) {
  const colors: Record<string, string> = {
    unreviewed: 'bg-primary/10 text-primary',
    in_process: 'bg-yellow-500/10 text-yellow-600',
    resolved: 'bg-green-500/10 text-green-600',
    closed: 'bg-muted/40 text-muted-foreground/60',
    duplicate: 'bg-muted/40 text-muted-foreground/60',
    need_more_info: 'bg-orange-500/10 text-orange-600',
  };
  const labels: Record<string, string> = {
    unreviewed: 'NEW',
    in_process: 'IN PROCESS',
    resolved: 'RESOLVED',
    closed: 'CLOSED',
    duplicate: 'DUPE',
    need_more_info: 'NEED INFO',
  };
  return (
    <span className={`text-[7px] font-mono tracking-[0.12em] px-1.5 py-0.5 rounded ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}
