import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Shield, Users, Tag, BarChart3, Plus, Trash2, Copy, Eye, EyeOff,
  ChevronDown, ChevronUp, Activity, AlertTriangle, Zap, HardDrive,
  TrendingUp, TrendingDown, RefreshCw, Bell, Clock, CheckCircle2,
  Circle, UserPlus, UserCheck, UserX,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ─── Types ───

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = 'health' | 'users' | 'promos';

interface HealthMetrics {
  health: { status: 'healthy' | 'warning' | 'critical'; message: string };
  userHealth: {
    totalUsers: number;
    newUsers24h: number;
    newUsers7d: number;
    dau: number;
    wau: number;
    retentionPct: number;
    avgTasksPerUser: number;
    dormantPct: number;
    dauOverTime: { date: string; value: number }[];
    newUsersOverTime: { date: string; value: number }[];
    activeUsers: number;
    paidUsers: number;
    lifetimeUsers: number;
    trialUsers: number;
    monthlyRevenue: number;
  };
  reliability: {
    totalTaskOps: number;
    completedTasks: number;
    completionRate: number;
  };
  performance: {
    totalQueries: number;
  };
  cost: {
    totalStorageGB: number;
    totalStorageBytes: number;
    totalFiles: number;
    avgFileSize: number;
    filesPerUser: number;
    topStorageUsers: { id: string; bytes: number }[];
    estimatedDbBytes: number;
    limits: {
      storageBytes: number;
      egressBytes: number;
      dbSizeBytes: number;
      mau: number;
      edgeFunctionInvocations: number;
      edgeFunctionCount: number;
      realtimeMessages: number;
      realtimeConnections: number;
    };
  };
  alerts: { severity: 'critical' | 'warning' | 'info'; message: string; source: string; time: string }[];
  users: UserRow[];
}

interface UserRow {
  user_id: string;
  status: string;
  plan: string | null;
  lifetime_access: boolean;
  trial_end: string;
  created_at: string;
  stripe_customer_id: string | null;
  display_name: string | null;
  taskCount: number;
  lastActive: string | null;
}

interface PromoCode {
  id: string;
  code: string;
  type: string;
  discount_percent: number | null;
  max_uses: number | null;
  current_uses: number;
  active: boolean;
  created_at: string;
  expires_at: string | null;
}

// ─── Usage Bar ───

function UsageBar({ label, used, limit, formatFn }: {
  label: string;
  used: number;
  limit: number;
  formatFn?: (v: number) => string;
}) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const fmt = formatFn || ((v: number) => v.toString());
  const severity = pct > 90 ? 'critical' : pct > 70 ? 'warn' : 'ok';
  const barColor = severity === 'critical' ? 'bg-destructive' : severity === 'warn' ? 'bg-yellow-500' : 'bg-primary';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[7px] font-mono text-muted-foreground/40 tracking-[0.15em] uppercase">{label}</span>
        <span className="text-[8px] font-mono text-muted-foreground/50">
          {fmt(used)} <span className="text-muted-foreground/25">/ {fmt(limit)}</span>
        </span>
      </div>
      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.max(pct, 0.5)}%`, opacity: pct < 1 ? 0.3 : 0.7 }}
        />
      </div>
      <div className="text-[7px] font-mono text-muted-foreground/25 text-right">{pct.toFixed(1)}%</div>
    </div>
  );
}

// ─── Helpers ───

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Mini Sparkline ───

function Sparkline({ data, color = 'hsl(var(--primary))' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 120;
  const h = 28;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.6}
      />
    </svg>
  );
}

// ─── Metric Card ───

function MetricCard({ label, value, subtitle, spark, trend }: {
  label: string;
  value: string | number;
  subtitle?: string;
  spark?: number[];
  trend?: 'up' | 'down' | 'flat';
}) {
  return (
    <div className="border border-border/30 rounded-lg p-3.5 bg-card/50 hover:bg-card/70 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[7px] font-mono text-muted-foreground/40 tracking-[0.15em] mb-1.5 uppercase">{label}</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-display font-bold text-foreground leading-none">{value}</span>
            {trend && (
              <span className={`flex items-center gap-0.5 text-[8px] font-mono ${
                trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-destructive/70' : 'text-muted-foreground/40'
              }`}>
                {trend === 'up' ? <TrendingUp size={8} /> : trend === 'down' ? <TrendingDown size={8} /> : null}
              </span>
            )}
          </div>
          {subtitle && (
            <div className="text-[8px] font-mono text-muted-foreground/35 mt-1">{subtitle}</div>
          )}
        </div>
        {spark && spark.length > 1 && (
          <div className="mt-1">
            <Sparkline data={spark} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section Header ───

function SectionHeader({ icon: Icon, label, status }: { icon: typeof Activity; label: string; status?: 'ok' | 'warn' | 'error' }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-1">
      <Icon size={12} className="text-muted-foreground/50" />
      <span className="text-[9px] font-mono tracking-[0.2em] text-muted-foreground/60 uppercase">{label}</span>
      {status && (
        <span className={`ml-auto w-1.5 h-1.5 rounded-full ${
          status === 'ok' ? 'bg-green-500' : status === 'warn' ? 'bg-yellow-500' : 'bg-destructive'
        }`} />
      )}
    </div>
  );
}

// ─── Health Badge ───

function HealthBadge({ status, message }: { status: string; message: string }) {
  const colors = {
    healthy: 'border-green-500/30 bg-green-500/5',
    warning: 'border-yellow-500/30 bg-yellow-500/5',
    critical: 'border-destructive/30 bg-destructive/5',
  };
  const dotColors = {
    healthy: 'bg-green-500',
    warning: 'bg-yellow-500',
    critical: 'bg-destructive',
  };
  const labels = {
    healthy: 'NOMINAL',
    warning: 'WARNING',
    critical: 'CRITICAL',
  };

  return (
    <div className={`border rounded-lg p-3 ${colors[status as keyof typeof colors] || colors.healthy}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2 h-2 rounded-full animate-pulse ${dotColors[status as keyof typeof dotColors] || dotColors.healthy}`} />
        <span className="text-[8px] font-mono tracking-[0.2em] text-foreground/60">
          SYSTEM STATUS: {labels[status as keyof typeof labels] || 'UNKNOWN'}
        </span>
      </div>
      <p className="text-[10px] font-mono text-muted-foreground/60 pl-4">{message}</p>
    </div>
  );
}

// ─── Alert Row ───

function AlertRow({ alert }: { alert: HealthMetrics['alerts'][0] }) {
  const severityColors = {
    critical: 'text-destructive border-destructive/20 bg-destructive/5',
    warning: 'text-yellow-600 border-yellow-500/20 bg-yellow-500/5',
    info: 'text-muted-foreground/60 border-border/30 bg-card/30',
  };

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-md border text-[10px] font-mono ${severityColors[alert.severity]}`}>
      {alert.severity === 'critical' ? <AlertTriangle size={10} className="shrink-0 mt-0.5" /> :
       alert.severity === 'warning' ? <Bell size={10} className="shrink-0 mt-0.5" /> :
       <Circle size={10} className="shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <div className="truncate">{alert.message}</div>
        <div className="text-[8px] opacity-60 mt-0.5">{alert.source.toUpperCase()} · {relativeTime(alert.time)}</div>
      </div>
    </div>
  );
}

// ─── Main Component ───

export function AdminPanel({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('health');
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Promo form
  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState<'lifetime' | 'discount'>('lifetime');
  const [newDiscount, setNewDiscount] = useState(100);
  const [newMaxUses, setNewMaxUses] = useState<number | ''>('');
  const [creating, setCreating] = useState(false);

  const loadMetrics = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await supabase.functions.invoke('admin-metrics', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.data) setMetrics(res.data);
    } catch (err) {
      console.error('Failed to load metrics:', err);
    }
  }, []);

  const loadPromos = useCallback(async () => {
    const { data } = await supabase.from('promo_codes').select('*');
    setPromos((data || []) as PromoCode[]);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([loadMetrics(), loadPromos()]).finally(() => setLoading(false));
  }, [open, loadMetrics, loadPromos]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadMetrics(), loadPromos()]);
    setRefreshing(false);
  };

  // ─── User management actions ───

  async function resetTrial(userId: string) {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);
    await supabase.from('subscriptions').update({
      status: 'trialing', trial_start: new Date().toISOString(),
      trial_end: trialEnd.toISOString(), updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
    toast.success('Trial reset');
    loadMetrics();
  }

  async function grantLifetime(userId: string) {
    await supabase.from('subscriptions').update({
      status: 'active', lifetime_access: true, updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
    toast.success('Lifetime access granted');
    loadMetrics();
  }

  async function revokeAccess(userId: string) {
    await supabase.from('subscriptions').update({
      status: 'cancelled', lifetime_access: false, updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
    toast.success('Access revoked');
    loadMetrics();
  }

  async function createPromo() {
    if (!newCode.trim()) { toast.error('Enter a code'); return; }
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('promo_codes').insert({
        code: newCode.trim().toUpperCase(),
        type: newType,
        discount_percent: newType === 'discount' ? newDiscount : null,
        max_uses: newMaxUses === '' ? null : newMaxUses,
        created_by: user?.id,
      });
      if (error) throw error;
      toast.success('Promo code created');
      setNewCode('');
      setNewMaxUses('');
      loadPromos();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create');
    }
    setCreating(false);
  }

  async function togglePromo(id: string, active: boolean) {
    await supabase.from('promo_codes').update({ active: !active }).eq('id', id);
    loadPromos();
  }

  async function deletePromo(id: string) {
    await supabase.from('promo_codes').delete().eq('id', id);
    loadPromos();
  }

  if (!open) return null;

  const m = metrics;

  const tabs: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
    { key: 'health', label: 'HEALTH', icon: Activity },
    { key: 'users', label: 'USERS', icon: Users },
    { key: 'promos', label: 'PROMOS', icon: Tag },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px]" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative bg-card border border-border/50 rounded-t-lg sm:rounded-lg shadow-lg w-full sm:max-w-2xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/30">
          <div className="flex items-center gap-2.5">
            <Shield size={13} className="text-primary" />
            <h2 className="text-[11px] font-mono font-bold text-foreground tracking-[0.15em]">CONTROL ROOM</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={refreshing}
              className="p-1.5 text-muted-foreground/40 hover:text-foreground transition-colors disabled:opacity-30"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="text-muted-foreground/40 hover:text-foreground transition-colors">
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/20 px-5">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-[9px] font-mono tracking-[0.15em] transition-all border-b-2 ${
                tab === t.key
                  ? 'text-foreground border-primary'
                  : 'text-muted-foreground/40 border-transparent hover:text-foreground/60'
              }`}
            >
              <t.icon size={10} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <span className="text-[9px] font-mono text-muted-foreground/30 tracking-[0.2em] animate-pulse">LOADING TELEMETRY...</span>
            </div>
          )}

          {/* ═══ HEALTH TAB ═══ */}
          {!loading && tab === 'health' && m && (
            <div className="space-y-5">
              {/* Global health indicator */}
              <HealthBadge status={m.health.status} message={m.health.message} />

              {/* Alerts */}
              {m.alerts.length > 0 && (
                <div className="space-y-1.5">
                  <SectionHeader icon={Bell} label="Alerts" />
                  {m.alerts.map((a, i) => <AlertRow key={i} alert={a} />)}
                </div>
              )}

              {/* ── USER HEALTH ── */}
              <div>
                <SectionHeader icon={Users} label="User Health" status={m.userHealth.dormantPct > 60 ? 'warn' : 'ok'} />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <MetricCard
                    label="TOTAL USERS"
                    value={m.userHealth.totalUsers}
                    subtitle={`${m.userHealth.paidUsers} paid · ${m.userHealth.lifetimeUsers} lifetime`}
                  />
                  <MetricCard
                    label="NEW USERS"
                    value={m.userHealth.newUsers7d}
                    subtitle={`${m.userHealth.newUsers24h} in 24h`}
                    spark={m.userHealth.newUsersOverTime.map(d => d.value)}
                    trend={m.userHealth.newUsers7d > 0 ? 'up' : 'flat'}
                  />
                  <MetricCard
                    label="DAU"
                    value={m.userHealth.dau}
                    subtitle={`WAU: ${m.userHealth.wau}`}
                    spark={m.userHealth.dauOverTime.map(d => d.value)}
                  />
                  <MetricCard
                    label="RETENTION"
                    value={`${m.userHealth.retentionPct}%`}
                    subtitle="Multi-day active (7d)"
                  />
                  <MetricCard
                    label="TASKS / USER"
                    value={m.userHealth.avgTasksPerUser}
                    subtitle="All-time average"
                  />
                  <MetricCard
                    label="DORMANT"
                    value={`${m.userHealth.dormantPct}%`}
                    subtitle="Inactive 7d+"
                    trend={m.userHealth.dormantPct > 50 ? 'down' : 'flat'}
                  />
                </div>
              </div>

              {/* ── RELIABILITY ── */}
              <div>
                <SectionHeader icon={CheckCircle2} label="Reliability" status="ok" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <MetricCard
                    label="TOTAL TASKS"
                    value={m.reliability.totalTaskOps}
                    subtitle={`${m.reliability.completedTasks} completed`}
                  />
                  <MetricCard
                    label="COMPLETION RATE"
                    value={`${m.reliability.completionRate}%`}
                    subtitle="Tasks marked done"
                  />
                </div>
              </div>

              {/* ── COST / STORAGE ── */}
              <div>
                <SectionHeader icon={HardDrive} label="Quotas & Usage" status={
                  (m.cost.totalStorageBytes / m.cost.limits.storageBytes) > 0.9 ? 'error' :
                  (m.cost.totalStorageBytes / m.cost.limits.storageBytes) > 0.7 ? 'warn' : 'ok'
                } />

                {/* Usage bars */}
                <div className="border border-border/20 rounded-lg p-4 space-y-4 mb-3">
                  <UsageBar
                    label="FILE STORAGE"
                    used={m.cost.totalStorageBytes}
                    limit={m.cost.limits.storageBytes}
                    formatFn={formatBytes}
                  />
                  <UsageBar
                    label="EGRESS (BANDWIDTH)"
                    used={0}
                    limit={m.cost.limits.egressBytes}
                    formatFn={formatBytes}
                  />
                  <UsageBar
                    label="DATABASE"
                    used={m.cost.estimatedDbBytes}
                    limit={m.cost.limits.dbSizeBytes}
                    formatFn={formatBytes}
                  />
                  <UsageBar
                    label="AUTH USERS (MAU)"
                    used={m.userHealth.totalUsers}
                    limit={m.cost.limits.mau}
                  />
                  <UsageBar
                    label="EDGE FN INVOCATIONS"
                    used={0}
                    limit={m.cost.limits.edgeFunctionInvocations}
                    formatFn={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v.toString()}
                  />
                  <UsageBar
                    label="REALTIME MESSAGES"
                    used={0}
                    limit={m.cost.limits.realtimeMessages}
                    formatFn={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v.toString()}
                  />
                </div>

                <div className="text-[7px] font-mono text-muted-foreground/20 mb-3 px-1">
                  Egress, edge fn invocations & realtime require platform analytics — shown as 0 until tracked.
                </div>

                {/* Metric cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <MetricCard
                    label="TOTAL FILES"
                    value={m.cost.totalFiles}
                    subtitle={`${m.cost.filesPerUser} per user`}
                  />
                  <MetricCard
                    label="AVG FILE SIZE"
                    value={m.cost.avgFileSize > 1024 ? `${(m.cost.avgFileSize / 1024).toFixed(1)} MB` : `${m.cost.avgFileSize} KB`}
                  />
                </div>

                {m.cost.topStorageUsers.length > 0 && (
                  <div className="mt-3 border border-border/20 rounded-lg p-3">
                    <div className="text-[7px] font-mono text-muted-foreground/40 tracking-[0.15em] mb-2">TOP STORAGE CONSUMERS</div>
                    {m.cost.topStorageUsers.map((u, i) => (
                      <div key={i} className="flex items-center justify-between py-1">
                        <span className="text-[9px] font-mono text-foreground/60">{u.id}…</span>
                        <span className="text-[9px] font-mono text-muted-foreground/50">{formatBytes(u.bytes)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── REVENUE ── */}
              <div>
                <SectionHeader icon={Zap} label="Revenue" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <MetricCard
                    label="EST. MRR"
                    value={`$${m.userHealth.monthlyRevenue}`}
                    subtitle={`${m.userHealth.paidUsers} paid subscribers`}
                  />
                  <MetricCard
                    label="ACTIVE"
                    value={m.userHealth.activeUsers}
                    subtitle={`${m.userHealth.trialUsers} in trial`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ═══ USERS TAB ═══ */}
          {!loading && tab === 'users' && m && (
            <div className="space-y-2">
              {m.users.length === 0 ? (
                <div className="text-center py-8 text-[9px] font-mono text-muted-foreground/30 tracking-[0.2em]">NO USERS YET</div>
              ) : (
                m.users.map(u => {
                  const isExpanded = expandedUser === u.user_id;
                  const trialEnd = new Date(u.trial_end);
                  const trialDays = Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000));
                  return (
                    <div key={u.user_id} className="border border-border/30 rounded-lg bg-card/30 overflow-hidden">
                      <button
                        onClick={() => setExpandedUser(isExpanded ? null : u.user_id)}
                        className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/20 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-mono text-foreground truncate max-w-[180px]">
                            {u.display_name || u.user_id.slice(0, 8) + '…'}
                          </span>
                          <span className={`text-[7px] font-mono tracking-[0.1em] px-1.5 py-0.5 rounded shrink-0 ${
                            u.lifetime_access ? 'bg-primary/10 text-primary' :
                            u.status === 'active' ? 'bg-green-500/10 text-green-600' :
                            u.status === 'trialing' ? 'bg-yellow-500/10 text-yellow-600' :
                            'bg-destructive/10 text-destructive'
                          }`}>
                            {u.lifetime_access ? '∞' : u.status.toUpperCase()}
                          </span>
                          <span className="text-[8px] font-mono text-muted-foreground/30">{u.taskCount} tasks</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {u.lastActive && (
                            <span className="text-[8px] font-mono text-muted-foreground/25">{relativeTime(u.lastActive)}</span>
                          )}
                          {isExpanded ? <ChevronUp size={10} className="text-muted-foreground/30" /> : <ChevronDown size={10} className="text-muted-foreground/30" />}
                        </div>
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                          >
                            <div className="px-3 pb-3 space-y-2 border-t border-border/15 pt-2">
                              <div className="grid grid-cols-3 gap-2">
                                {[
                                  { label: 'PLAN', value: u.plan ? u.plan.toUpperCase() : 'NONE' },
                                  { label: 'JOINED', value: new Date(u.created_at).toLocaleDateString() },
                                  { label: 'TRIAL LEFT', value: u.status === 'trialing' ? `${trialDays}d` : '—' },
                                ].map(d => (
                                  <div key={d.label}>
                                    <div className="text-[6px] font-mono text-muted-foreground/35 tracking-[0.15em]">{d.label}</div>
                                    <div className="text-[9px] font-mono text-foreground/60">{d.value}</div>
                                  </div>
                                ))}
                              </div>
                              <div className="text-[7px] font-mono text-muted-foreground/20 truncate">{u.user_id}</div>
                              <div className="flex gap-1 pt-1 flex-wrap">
                                {!u.lifetime_access && (
                                  <button onClick={(e) => { e.stopPropagation(); grantLifetime(u.user_id); }}
                                    className="text-[7px] font-mono text-primary/60 hover:text-primary px-1.5 py-0.5 rounded border border-primary/20 hover:border-primary/40 transition-colors">
                                    GRANT ∞
                                  </button>
                                )}
                                {u.status === 'cancelled' && (
                                  <button onClick={(e) => { e.stopPropagation(); resetTrial(u.user_id); }}
                                    className="text-[7px] font-mono text-yellow-600/60 hover:text-yellow-600 px-1.5 py-0.5 rounded border border-yellow-500/20 hover:border-yellow-500/40 transition-colors">
                                    RESET TRIAL
                                  </button>
                                )}
                                {(u.status === 'active' || u.lifetime_access) && (
                                  <button onClick={(e) => { e.stopPropagation(); revokeAccess(u.user_id); }}
                                    className="text-[7px] font-mono text-destructive/60 hover:text-destructive px-1.5 py-0.5 rounded border border-destructive/20 hover:border-destructive/40 transition-colors">
                                    REVOKE
                                  </button>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ═══ PROMOS TAB ═══ */}
          {!loading && tab === 'promos' && (
            <div className="space-y-4">
              {/* Create promo */}
              <div className="border border-border/30 rounded-lg p-3.5 bg-card/50 space-y-3">
                <div className="text-[8px] font-mono text-muted-foreground/40 tracking-[0.2em]">CREATE PROMO CODE</div>
                <div className="flex gap-2">
                  <input
                    value={newCode}
                    onChange={e => setNewCode(e.target.value.toUpperCase())}
                    placeholder="CODE"
                    className="flex-1 bg-muted/30 border border-border/50 rounded-md px-3 py-2 text-[10px] font-mono text-foreground tracking-wider placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50"
                  />
                  <select
                    value={newType}
                    onChange={e => setNewType(e.target.value as any)}
                    className="bg-muted/30 border border-border/50 rounded-md px-2 py-2 text-[9px] font-mono text-foreground focus:outline-none"
                  >
                    <option value="lifetime">LIFETIME</option>
                    <option value="discount">DISCOUNT</option>
                  </select>
                </div>
                <div className="flex gap-2 items-center">
                  {newType === 'discount' && (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={newDiscount}
                        onChange={e => setNewDiscount(Number(e.target.value))}
                        className="w-14 bg-muted/30 border border-border/50 rounded-md px-2 py-1.5 text-[10px] font-mono text-foreground focus:outline-none"
                        min={1} max={100}
                      />
                      <span className="text-[9px] font-mono text-muted-foreground/40">%</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={newMaxUses}
                      onChange={e => setNewMaxUses(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="∞"
                      className="w-14 bg-muted/30 border border-border/50 rounded-md px-2 py-1.5 text-[10px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
                      min={1}
                    />
                    <span className="text-[9px] font-mono text-muted-foreground/40">MAX</span>
                  </div>
                  <div className="flex-1" />
                  <button
                    onClick={createPromo}
                    disabled={creating}
                    className="flex items-center gap-1 px-3 py-1.5 bg-foreground text-background text-[9px] font-mono tracking-[0.1em] rounded-md hover:bg-foreground/90 disabled:opacity-50 transition-colors"
                  >
                    <Plus size={9} />
                    CREATE
                  </button>
                </div>
              </div>

              {/* Existing promos */}
              <div className="space-y-2">
                {promos.length === 0 ? (
                  <div className="text-center py-6 text-[9px] font-mono text-muted-foreground/30 tracking-[0.2em]">NO PROMO CODES</div>
                ) : (
                  promos.map(p => (
                    <div key={p.id} className={`border rounded-lg p-3 bg-card/30 ${p.active ? 'border-border/30' : 'border-destructive/20 opacity-50'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono font-bold text-foreground tracking-wider">{p.code}</span>
                          <button
                            onClick={() => { navigator.clipboard.writeText(p.code); toast.success('Copied!'); }}
                            className="text-muted-foreground/25 hover:text-foreground transition-colors"
                          >
                            <Copy size={9} />
                          </button>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => togglePromo(p.id, p.active)}
                            className="text-muted-foreground/30 hover:text-foreground transition-colors p-1"
                          >
                            {p.active ? <EyeOff size={11} /> : <Eye size={11} />}
                          </button>
                          <button
                            onClick={() => deletePromo(p.id)}
                            className="text-destructive/30 hover:text-destructive transition-colors p-1"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-[8px] font-mono text-muted-foreground/40">
                        <span>{p.type === 'lifetime' ? 'LIFETIME' : `${p.discount_percent}% OFF`}</span>
                        <span>{p.current_uses}{p.max_uses ? `/${p.max_uses}` : '/∞'} USES</span>
                        <span>{p.active ? 'ACTIVE' : 'INACTIVE'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
