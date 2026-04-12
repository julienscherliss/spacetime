import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Users, Tag, BarChart3, Plus, Trash2, Copy, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Tab = 'overview' | 'users' | 'promos';

interface UserSub {
  user_id: string;
  status: string;
  plan: string | null;
  lifetime_access: boolean;
  trial_end: string;
  created_at: string;
  email?: string;
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

export function AdminPanel({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<UserSub[]>([]);
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(false);

  // New promo form
  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState<'lifetime' | 'discount'>('lifetime');
  const [newDiscount, setNewDiscount] = useState(100);
  const [newMaxUses, setNewMaxUses] = useState<number | ''>('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) loadData();
  }, [open, tab]);

  async function loadData() {
    setLoading(true);
    try {
      if (tab === 'users' || tab === 'overview') {
        const { data } = await supabase.from('subscriptions').select('*');
        setUsers((data || []) as UserSub[]);
      }
      if (tab === 'promos' || tab === 'overview') {
        // Admin policy allows all access
        const { data } = await supabase.from('promo_codes').select('*');
        setPromos((data || []) as PromoCode[]);
      }
    } catch (err) {
      console.error('Admin load error:', err);
    }
    setLoading(false);
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
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create');
    }
    setCreating(false);
  }

  async function togglePromo(id: string, active: boolean) {
    await supabase.from('promo_codes').update({ active: !active }).eq('id', id);
    loadData();
  }

  async function deletePromo(id: string) {
    await supabase.from('promo_codes').delete().eq('id', id);
    loadData();
  }

  async function grantLifetime(userId: string) {
    await supabase.from('subscriptions').update({
      status: 'active',
      lifetime_access: true,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
    toast.success('Lifetime access granted');
    loadData();
  }

  async function revokeAccess(userId: string) {
    await supabase.from('subscriptions').update({
      status: 'cancelled',
      lifetime_access: false,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
    toast.success('Access revoked');
    loadData();
  }

  if (!open) return null;

  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.status === 'active' || (u.status === 'trialing' && new Date(u.trial_end) > new Date())).length;
  const paidUsers = users.filter(u => u.status === 'active' && !u.lifetime_access).length;
  const lifetimeUsers = users.filter(u => u.lifetime_access).length;
  const trialUsers = users.filter(u => u.status === 'trialing' && new Date(u.trial_end) > new Date()).length;

  const tabs: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
    { key: 'overview', label: 'OVERVIEW', icon: BarChart3 },
    { key: 'users', label: 'USERS', icon: Users },
    { key: 'promos', label: 'PROMOS', icon: Tag },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative bg-card border border-border rounded-t-lg sm:rounded-lg shadow-lg w-full sm:max-w-lg max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-primary" />
            <h2 className="text-sm font-display font-bold text-foreground tracking-tight">ADMIN</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/30 px-4">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-[10px] font-mono tracking-wider transition-all border-b-2 ${
                tab === t.key
                  ? 'text-foreground border-primary'
                  : 'text-muted-foreground/50 border-transparent hover:text-foreground/60'
              }`}
            >
              <t.icon size={11} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <span className="text-[10px] font-mono text-muted-foreground/40 tracking-widest">LOADING...</span>
            </div>
          )}

          {!loading && tab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'TOTAL USERS', value: totalUsers },
                  { label: 'ACTIVE', value: activeUsers },
                  { label: 'PAID', value: paidUsers },
                  { label: 'LIFETIME', value: lifetimeUsers },
                  { label: 'IN TRIAL', value: trialUsers },
                  { label: 'PROMO CODES', value: promos.length },
                ].map(m => (
                  <div key={m.label} className="border border-border/30 rounded-md p-3 bg-card/50">
                    <div className="text-[8px] font-mono text-muted-foreground/40 tracking-[0.12em] mb-1">{m.label}</div>
                    <div className="text-lg font-display font-bold text-foreground">{m.value}</div>
                  </div>
                ))}
              </div>

              {/* Revenue estimate */}
              <div className="border border-border/30 rounded-md p-3 bg-card/50">
                <div className="text-[8px] font-mono text-muted-foreground/40 tracking-[0.12em] mb-1">EST. MONTHLY REVENUE</div>
                <div className="text-lg font-display font-bold text-foreground">
                  ${users.filter(u => u.status === 'active' && !u.lifetime_access).reduce((sum, u) => {
                    return sum + (u.plan === 'yearly' ? 2 : 3);
                  }, 0)}
                </div>
                <div className="text-[9px] font-mono text-muted-foreground/40 mt-0.5">
                  Based on {paidUsers} paid subscriber{paidUsers !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          )}

          {!loading && tab === 'users' && (
            <div className="space-y-2">
              {users.length === 0 ? (
                <div className="text-center py-8 text-[10px] font-mono text-muted-foreground/40">NO USERS YET</div>
              ) : (
                users.map(u => (
                  <div key={u.user_id} className="border border-border/30 rounded-md p-3 bg-card/30">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-mono text-foreground/80 truncate max-w-[200px]">
                        {u.user_id.slice(0, 8)}...
                      </span>
                      <span className={`text-[8px] font-mono tracking-wider px-1.5 py-0.5 rounded ${
                        u.lifetime_access ? 'bg-primary/10 text-primary' :
                        u.status === 'active' ? 'bg-green-500/10 text-green-600' :
                        u.status === 'trialing' ? 'bg-yellow-500/10 text-yellow-600' :
                        'bg-destructive/10 text-destructive'
                      }`}>
                        {u.lifetime_access ? 'LIFETIME' : u.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-[9px] font-mono text-muted-foreground/50">
                        {u.plan ? u.plan.toUpperCase() : 'NO PLAN'} · Joined {new Date(u.created_at).toLocaleDateString()}
                      </div>
                      <div className="flex gap-1">
                        {!u.lifetime_access && (
                          <button
                            onClick={() => grantLifetime(u.user_id)}
                            className="text-[8px] font-mono text-primary/60 hover:text-primary px-1.5 py-0.5 rounded border border-primary/20 hover:border-primary/40 transition-colors"
                          >
                            GRANT ∞
                          </button>
                        )}
                        {(u.status === 'active' || u.lifetime_access) && (
                          <button
                            onClick={() => revokeAccess(u.user_id)}
                            className="text-[8px] font-mono text-destructive/60 hover:text-destructive px-1.5 py-0.5 rounded border border-destructive/20 hover:border-destructive/40 transition-colors"
                          >
                            REVOKE
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {!loading && tab === 'promos' && (
            <div className="space-y-4">
              {/* Create promo */}
              <div className="border border-border/30 rounded-md p-3 bg-card/50 space-y-3">
                <div className="text-[9px] font-mono text-muted-foreground/50 tracking-widest">CREATE PROMO CODE</div>
                <div className="flex gap-2">
                  <input
                    value={newCode}
                    onChange={e => setNewCode(e.target.value.toUpperCase())}
                    placeholder="CODE"
                    className="flex-1 bg-muted/30 border border-border/50 rounded-sm px-3 py-2 text-[11px] font-mono text-foreground tracking-wider placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50"
                  />
                  <select
                    value={newType}
                    onChange={e => setNewType(e.target.value as any)}
                    className="bg-muted/30 border border-border/50 rounded-sm px-2 py-2 text-[10px] font-mono text-foreground focus:outline-none"
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
                        className="w-16 bg-muted/30 border border-border/50 rounded-sm px-2 py-1.5 text-[11px] font-mono text-foreground focus:outline-none"
                        min={1}
                        max={100}
                      />
                      <span className="text-[10px] font-mono text-muted-foreground/50">%OFF</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={newMaxUses}
                      onChange={e => setNewMaxUses(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="∞"
                      className="w-16 bg-muted/30 border border-border/50 rounded-sm px-2 py-1.5 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
                      min={1}
                    />
                    <span className="text-[10px] font-mono text-muted-foreground/50">MAX USES</span>
                  </div>
                  <div className="flex-1" />
                  <button
                    onClick={createPromo}
                    disabled={creating}
                    className="flex items-center gap-1 px-3 py-1.5 bg-foreground text-background text-[10px] font-mono tracking-wider rounded-sm hover:bg-foreground/90 disabled:opacity-50 transition-colors"
                  >
                    <Plus size={10} />
                    CREATE
                  </button>
                </div>
              </div>

              {/* Existing promos */}
              <div className="space-y-2">
                {promos.length === 0 ? (
                  <div className="text-center py-4 text-[10px] font-mono text-muted-foreground/40">NO PROMO CODES YET</div>
                ) : (
                  promos.map(p => (
                    <div key={p.id} className={`border rounded-md p-3 bg-card/30 ${p.active ? 'border-border/30' : 'border-destructive/20 opacity-60'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-mono font-bold text-foreground tracking-wider">{p.code}</span>
                          <button
                            onClick={() => { navigator.clipboard.writeText(p.code); toast.success('Copied!'); }}
                            className="text-muted-foreground/30 hover:text-foreground transition-colors"
                          >
                            <Copy size={10} />
                          </button>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => togglePromo(p.id, p.active)}
                            className="text-muted-foreground/40 hover:text-foreground transition-colors p-1"
                            title={p.active ? 'Deactivate' : 'Activate'}
                          >
                            {p.active ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <button
                            onClick={() => deletePromo(p.id)}
                            className="text-destructive/40 hover:text-destructive transition-colors p-1"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-[9px] font-mono text-muted-foreground/50">
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
