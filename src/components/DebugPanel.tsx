import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, RefreshCw, Activity, Bell, Shield, Database, User as UserIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { isNativePlatform } from '@/utils/nativePlatform';
import { useCalendarStore } from '@/store/calendarStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface AuditRow {
  id: string;
  action: string;
  object_type: string;
  object_id: string;
  platform: string;
  created_at: string;
}

/**
 * Internal Debug + Production-Readiness panel.
 * Read-only diagnostics surface — no user-facing copy here is meant to be
 * polished marketing language. Reachable from Settings → Advanced.
 */
export function DebugPanel({ open, onClose }: Props) {
  const [authEmail, setAuthEmail] = useState<string>('—');
  const [authUserId, setAuthUserId] = useState<string>('—');
  const [authProvider, setAuthProvider] = useState<string>('—');
  const [lastSignIn, setLastSignIn] = useState<string>('—');
  const [notifPerm, setNotifPerm] = useState<string>('—');
  const [dbOk, setDbOk] = useState<'ok' | 'fail' | 'checking'>('checking');
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);

  const env = (import.meta as any).env?.MODE ?? 'unknown';
  const platform = isNativePlatform() ? 'native' : 'web';
  const calendarConnected = useCalendarStore((s) => s.connected);
  const calendarEmail = useCalendarStore((s) => s.email);
  const calendarCount = useCalendarStore((s) => s.calendars.length);
  const calendarEventCount = useCalendarStore((s) => s.events.length);
  const calendarDeviceId = useCalendarStore((s) => s.deviceId);

  const load = async () => {
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      setAuthEmail(u?.user?.email ?? '—');
      setAuthUserId(u?.user?.id ?? '—');
      setAuthProvider((u?.user?.app_metadata as any)?.provider ?? 'email');
      setLastSignIn(u?.user?.last_sign_in_at ?? '—');

      try {
        setNotifPerm(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
      } catch { setNotifPerm('unsupported'); }

      const { error } = await supabase.from('audit_log').select('id').limit(1);
      setDbOk(error ? 'fail' : 'ok');

      const { data: rows } = await supabase
        .from('audit_log')
        .select('id,action,object_type,object_id,platform,created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      setAudit((rows ?? []) as AuditRow[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) void load(); }, [open]);

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[110] bg-background flex flex-col"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-muted-foreground/60" />
          <span className="text-[11px] font-mono tracking-[0.18em] text-foreground">DEBUG · PRODUCTION READINESS</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full">
        <Section icon={<UserIcon size={11} />} title="AUTH">
          <Row label="Email" value={authEmail} />
          <Row label="User ID" value={authUserId} />
          <Row label="Provider" value={authProvider} />
          <Row label="Last sign-in" value={lastSignIn} />
        </Section>

        <Section icon={<Activity size={11} />} title="GOOGLE CALENDAR">
          <Row label="Connected" value={calendarConnected ? 'yes' : 'no'} tone={calendarConnected ? 'good' : undefined} />
          <Row label="Google email" value={calendarEmail ?? '—'} />
          <Row label="Calendars" value={String(calendarCount)} />
          <Row label="Events cached" value={String(calendarEventCount)} />
          <Row label="Device ID" value={calendarDeviceId} />
        </Section>

        <Section icon={<Database size={11} />} title="DATABASE">
          <Row label="Connectivity" value={dbOk === 'checking' ? 'checking…' : dbOk === 'ok' ? 'ok' : 'failing'} tone={dbOk === 'fail' ? 'bad' : dbOk === 'ok' ? 'good' : undefined} />
          <Row label="Environment" value={env} />
          <Row label="Platform" value={platform} />
        </Section>

        <Section icon={<Bell size={11} />} title="NOTIFICATIONS">
          <Row label="Web permission" value={notifPerm} tone={notifPerm === 'granted' ? 'good' : notifPerm === 'denied' ? 'bad' : undefined} />
        </Section>

        <Section icon={<Shield size={11} />} title="CRASH REPORTING">
          <Row label="Sink" value="console (self-hosted ingest pending)" />
        </Section>

        <Section icon={<Activity size={11} />} title="RECENT AUDIT EVENTS">
          <div className="border border-border/30 rounded-sm divide-y divide-border/20">
            {audit.length === 0 && (
              <div className="px-2 py-3 text-[10px] font-mono text-muted-foreground/50">No events yet.</div>
            )}
            {audit.map((row) => (
              <div key={row.id} className="px-2 py-1.5 flex items-center gap-2 text-[10px] font-mono">
                <span className="text-muted-foreground/50 tabular-nums shrink-0">
                  {new Date(row.created_at).toLocaleTimeString()}
                </span>
                <span className="text-foreground shrink-0">{row.action}</span>
                {row.object_id && (
                  <span className="text-muted-foreground/60 truncate">{row.object_type}:{row.object_id.slice(0, 8)}</span>
                )}
                <span className="ml-auto text-muted-foreground/40 shrink-0">{row.platform}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </motion.div>
  );
}

function Section({ icon, title, children }: { icon?: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon && <span className="text-muted-foreground/50">{icon}</span>}
        <span className="text-[9px] font-mono tracking-[0.18em] text-muted-foreground/50">{title}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const color =
    tone === 'good' ? 'text-primary'
    : tone === 'bad' ? 'text-destructive'
    : 'text-foreground';
  return (
    <div className="flex items-center justify-between text-[11px] font-mono border border-border/30 rounded-sm px-2 py-1.5">
      <span className="text-muted-foreground/60">{label}</span>
      <span className={`${color} truncate ml-2`}>{value}</span>
    </div>
  );
}
