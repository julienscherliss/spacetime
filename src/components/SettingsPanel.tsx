import { useState, useMemo, useEffect } from 'react';
import { useTimezoneStore, getTzAbbr, TIMEZONES } from '@/store/timezoneStore';
import type { MobilityMode } from '@/store/timezoneStore';
import { useCalendarStore } from '@/store/calendarStore';
import { supabase } from '@/integrations/supabase/client';
import { X, Search, Globe, Repeat, MapPin, Calendar as CalIcon, RefreshCw, Unplug, HelpCircle, Moon, Shield, Lock, Bell, Type, Volume2, MessageSquarePlus, Sliders } from 'lucide-react';
import { toast } from 'sonner';
import { HelpPanel } from './HelpPanel';
import { ColorSchemePanel } from './ColorSchemePanel';
import { AdminPanel } from './AdminPanel';
import { DeleteAccountModal } from './DeleteAccountModal';
import { DebugPanel } from './DebugPanel';
import { isNativePlatform, isIOSNative } from '@/utils/nativePlatform';
import { useSubscription } from '@/hooks/useSubscription';
import type { NotificationLevel } from '@/utils/notificationService';
import {
  getPermissionStatus,
  requestPermissionFromUserAction,
  syncTaskNotifications,
  scheduleTestNotification,
} from '@/utils/notificationService';
import {
  requestWebNotificationPermission,
  getWebNotificationPermission,
  syncWebNotifications,
} from '@/utils/webNotificationService';
import { useTaskStore, type DayToggleTarget } from '@/store/taskStore';
import { useBillingStore } from '@/store/billingStore';
import { useInvoiceStyleStore } from '@/store/invoiceStyleStore';
import { currencySymbol } from '@/lib/billingFormat';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { timezone, setTimezone, routinesFixedTime, setRoutinesFixedTime, autoDetect, setAutoDetect, darkMode, setDarkMode, mobilityMode, setMobilityMode, notificationLevel, setNotificationLevel, persistentOverdue, setPersistentOverdue, showCompletedTasks, setShowCompletedTasks, comfortMode, setComfortMode, soundEnabled, setSoundEnabled, showBilling, setShowBilling } = useTimezoneStore();
  const billingSettings = useBillingStore(s => s.settings);
  const loadBilling = useBillingStore(s => s.load);
  const billingLoaded = useBillingStore(s => s.loaded);
  const hasBillableTag = billingSettings.some(s => s.billable);
  const billingEffectivelyOn = showBilling || hasBillableTag;
  useEffect(() => { if (open && !billingLoaded) loadBilling(); }, [open, billingLoaded, loadBilling]);
  const styleLoaded = useInvoiceStyleStore(s => s.loaded);
  const loadStyle = useInvoiceStyleStore(s => s.load);
  const defaultCurrency = useInvoiceStyleStore(s => s.style.defaultCurrency);
  const saveStyle = useInvoiceStyleStore(s => s.save);
  useEffect(() => { if (open && !styleLoaded) loadStyle(); }, [open, styleLoaded, loadStyle]);
  const CURRENCIES = ['USD','EUR','GBP','CAD','AUD','JPY','CHF','SEK','NOK','DKK','MXN','BRL','INR','SGD','HKD','NZD','ZAR','PLN','TRY'];
  const { connected, email, calendars, loading, checkStatus, startAuth, refreshCalendarData, toggleCalendar, disconnect } = useCalendarStore();
  const nativeRuntime = isNativePlatform();
  const iosNative = isIOSNative();
  const [search, setSearch] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const { isAdmin, subscription, trialDaysLeft, cancellingDaysLeft } = useSubscription();
  const [pwMode, setPwMode] = useState<'closed' | 'change' | 'reset'>('closed');
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [authProvider, setAuthProvider] = useState<'email' | 'google' | 'unknown'>('unknown');
  const [emailConfirmed, setEmailConfirmed] = useState<boolean>(true);
  const [userEmail, setUserEmail] = useState<string>('');
  const [verifySending, setVerifySending] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const dayToggleTarget = useTaskStore(s => s.dayToggleTarget);
  const setDayToggleTarget = useTaskStore(s => s.setDayToggleTarget);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('settings.showAdvanced') === '1';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('settings.showAdvanced', showAdvanced ? '1' : '0');
    }
  }, [showAdvanced]);

  // Close nested Help panel when tutorial / external code dispatches close-settings
  useEffect(() => {
    const close = () => {
      setHelpOpen(false);
      setAdminOpen(false);
      setDebugOpen(false);
      setDeleteAccountOpen(false);
      setPwMode('closed');
    };
    window.addEventListener('close-settings', close);
    return () => window.removeEventListener('close-settings', close);
  }, []);

  useEffect(() => {
    if (!open) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const provider = user.app_metadata?.provider;
      setAuthProvider(provider === 'google' ? 'google' : 'email');
      setEmailConfirmed(Boolean((user as any).email_confirmed_at || (user as any).confirmed_at));
      setUserEmail(user.email || '');
    });
  }, [open]);

  useEffect(() => {
    if (open) checkStatus();
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return TIMEZONES.slice(0, 50);
    const q = search.toLowerCase();
    return TIMEZONES.filter(tz => tz.toLowerCase().includes(q)).slice(0, 50);
  }, [search]);

  if (!open) return null;

  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <>
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="relative bg-background w-full h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="font-display font-bold text-foreground tracking-tight" style={{ fontSize: 'var(--ui-text-xl)' }}>SETTINGS</h2>
            <button
              onClick={() => setShowAdvanced(v => !v)}
              title={showAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-sm border text-[10px] font-mono tracking-wider transition-colors ${
                showAdvanced
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-muted/30 border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Sliders size={11} strokeWidth={1.5} />
              <span>ADVANCED</span>
              <div className={`ml-0.5 w-6 h-3 rounded-full transition-colors flex items-center px-0.5 ${
                showAdvanced ? 'bg-primary justify-end' : 'bg-border justify-start'
              }`}>
                <div className="w-2 h-2 rounded-full bg-white" />
              </div>
            </button>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-8 w-full max-w-2xl mx-auto space-y-4">
          {/* Help & Tips — top of settings */}
          <div className="space-y-2">
            <button
              onClick={() => setHelpOpen(true)}
              className="hidden sm:flex w-full items-center justify-center gap-2 bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px] text-[12px] font-mono tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <HelpCircle size={14} strokeWidth={1.5} />
              <span>HELP & TIPS</span>
            </button>
            <button
              onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('toggle-feedback')); }}
              className="w-full flex items-center justify-center gap-2 bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px] text-[12px] font-mono tracking-wider text-primary hover:bg-primary/5 transition-colors"
            >
              <MessageSquarePlus size={14} strokeWidth={1.5} />
              <span>SEND FEEDBACK</span>
            </button>
          </div>

          {/* Auto-detect toggle */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <MapPin size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">LOCATION</span>
            </div>
            <button
              onClick={() => {
                const newVal = !autoDetect;
                setAutoDetect(newVal);
                if (newVal) {
                  setTimezone(detectedTz);
                }
              }}
              className="w-full flex items-center justify-between bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px]"
            >
              <div className="text-left">
                <div className="text-[12px] font-mono text-foreground">Use current time zone</div>
                <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                  Auto-detect from device location
                </div>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                autoDetect ? 'bg-primary justify-end' : 'bg-border justify-start'
              }`}>
                <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </div>
            </button>
          </div>

          {/* Timezone section */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Globe size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">TIMEZONE</span>
            </div>

            <div className="bg-muted/30 border border-border/50 rounded-sm p-3 mb-2 min-h-[48px] flex items-center justify-between">
              <div>
                <div className="text-[12px] font-mono text-foreground">{timezone.replace(/_/g, ' ')}</div>
                <div className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">{getTzAbbr(timezone)}</div>
              </div>
              {autoDetect && (
                <span className="text-[9px] font-mono text-primary/60 tracking-wider">AUTO</span>
              )}
            </div>

            {!autoDetect && showAdvanced && (
              <>
                <div className="relative mb-2">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search timezones..."
                    className="w-full bg-background border border-border/50 rounded-sm pl-8 pr-3 py-2.5 text-[12px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30 min-h-[44px]"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto border border-border/30 rounded-sm">
                  {filtered.map((tz) => (
                    <button
                      key={tz}
                      onClick={() => {
                        setTimezone(tz);
                        setSearch('');
                      }}
                      className={`w-full text-left px-3 py-2.5 text-[12px] font-mono transition-colors flex items-center justify-between min-h-[44px] ${
                        tz === timezone
                          ? 'bg-primary/8 text-primary'
                          : 'text-foreground/60 hover:bg-muted/40 hover:text-foreground'
                      }`}
                    >
                      <span className="truncate">{tz.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] text-muted-foreground/40 ml-2 shrink-0">{getTzAbbr(tz)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {!autoDetect && !showAdvanced && (
              <div className="text-[10px] font-mono text-muted-foreground/40 mt-1">
                Enable Advanced (top of settings) to pick a timezone manually.
              </div>
            )}
          </div>

          {/* Routines timezone behavior — advanced */}
          {showAdvanced && (
          <div className="border-t border-border/30 pt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Repeat size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">ROUTINES</span>
            </div>
            <button
              onClick={() => setRoutinesFixedTime(!routinesFixedTime)}
              className="w-full flex items-center justify-between bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px]"
            >
              <div className="text-left">
                <div className="text-[12px] font-mono text-foreground">Keep routine times fixed</div>
                <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                  Routines stay at the same clock time regardless of timezone
                </div>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                routinesFixedTime ? 'bg-primary justify-end' : 'bg-border justify-start'
              }`}>
                <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </div>
            </button>
          </div>
          )}

          {/* Google Calendar — advanced */}
          {showAdvanced && (
          <div className="border-t border-border/30 pt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <CalIcon size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">GOOGLE CALENDAR</span>
            </div>

            {!connected ? (
              nativeRuntime ? (
                <div className="bg-muted/30 border border-border/50 rounded-sm p-3">
                  <p className="text-[11px] font-mono text-muted-foreground/60 leading-relaxed">
                    Google Calendar must be connected on the web app. Once connected there, your events will automatically appear here.
                  </p>
                </div>
              ) : (
              <button
                onClick={startAuth}
                disabled={loading}
                className="w-full flex items-center justify-center bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px] text-[12px] font-mono tracking-wider text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
              >
                {loading ? 'CONNECTING...' : 'CONNECT GOOGLE CALENDAR'}
              </button>
              )
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px]">
                  <div>
                    <div className="text-[12px] font-mono text-foreground">Connected</div>
                    <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5 truncate max-w-[180px]">
                      {email || 'Google account'}
                    </div>
                  </div>
                   <div className="flex items-center gap-1.5">
                    <button
                      onClick={refreshCalendarData}
                      className="p-2 text-muted-foreground/40 hover:text-foreground transition-colors rounded-sm hover:bg-muted/40"
                      title="Sync calendars and events"
                    >
                      <RefreshCw size={14} strokeWidth={1.5} />
                    </button>
                    {!nativeRuntime && (
                    <button
                      onClick={disconnect}
                      className="p-2 text-muted-foreground/40 hover:text-destructive transition-colors rounded-sm hover:bg-destructive/5"
                      title="Disconnect"
                    >
                      <Unplug size={14} strokeWidth={1.5} />
                    </button>
                    )}
                  </div>
                </div>

                {calendars.length > 0 && (
                  <div className="border border-border/30 rounded-sm overflow-hidden">
                    {calendars.map((cal) => (
                      <label
                        key={cal.id}
                        className="flex items-center gap-2.5 cursor-pointer hover:bg-muted/30 transition-colors py-2.5 px-3"
                      >
                        <div className="relative flex items-center">
                          <input
                            type="checkbox"
                            checked={cal.visible}
                            onChange={(e) => toggleCalendar(cal.id, e.target.checked)}
                            className="sr-only"
                          />
                          <div
                            className={`w-4 h-4 rounded-[3px] border transition-colors ${
                              cal.visible ? 'border-transparent' : 'border-border bg-transparent'
                            }`}
                            style={{ backgroundColor: cal.visible ? (cal.color || 'hsl(var(--primary))') : undefined }}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-foreground/70 truncate flex-1">{cal.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          )}
          {/* Appearance */}
          <div className="border-t border-border/30 pt-4">

          {/* Day toggle target — advanced */}
          {showAdvanced && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Sliders size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">DAY TAB TOGGLE</span>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground/50 mb-2">
              Tap the Day tab while on Day view to swap between Timeline and this view
            </div>
            <div className="flex gap-1 bg-muted/30 border border-border/50 rounded-sm p-1">
              {(() => null)()}
              {([
                { value: 'sequencer' as DayToggleTarget, label: 'Sequencer' },
                { value: 'list' as DayToggleTarget, label: 'List' },
              ]).map(opt => {
                const active = dayToggleTarget === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      useTaskStore.getState().setDayToggleTarget(opt.value);
                      // If currently showing the other alt view, swap to the new target
                      const s = useTaskStore.getState();
                      if (s.viewMode === 'day' && s.daySubMode !== 'timeline' && s.daySubMode !== opt.value) {
                        s.setDaySubMode(opt.value);
                      }
                    }}
                    className={`flex-1 py-2 rounded-[2px] text-[11px] font-mono tracking-wider transition-colors ${
                      active
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 border border-transparent'
                    }`}
                  >
                    {opt.label.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
          )}

          {/* Task Mobility — advanced */}
          {showAdvanced && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Shield size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">TASK MOBILITY</span>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground/50 mb-2">
              Controls how tasks resist being moved
            </div>
            <div className="flex gap-1 bg-muted/30 border border-border/50 rounded-sm p-1">
              {([
                { value: 'disabled' as MobilityMode, label: 'Disabled' },
                { value: 'normal' as MobilityMode, label: 'Normal' },
                { value: 'elite' as MobilityMode, label: 'Elite' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setMobilityMode(opt.value)}
                  className={`flex-1 py-2 rounded-[2px] text-[11px] font-mono tracking-wider transition-colors ${
                    mobilityMode === opt.value
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 border border-transparent'
                  }`}
                >
                  {opt.label.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="text-[9px] font-mono text-muted-foreground/40 mt-1.5 leading-relaxed">
              {mobilityMode === 'disabled' && 'Move tasks freely. No prompts, no constraints, no priority escalation.'}
              {mobilityMode === 'normal' && 'Semi/Fixed/Locked tasks prompt a brief reflection when moved against their constraint. Priority stays where you set it.'}
              {mobilityMode === 'elite' && 'Same reflection prompts as Normal, plus due dates auto-escalate priority (this week → Semi · today → Fixed).'}
            </div>
          </div>
          )}

          {/* Notifications */}
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Bell size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">NOTIFICATIONS</span>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground/50 mb-2">
              5 min warning before task end + alarm at completion time
            </div>
            <div className="flex gap-1 bg-muted/30 border border-border/50 rounded-sm p-1">
              {([
                { value: 'off' as NotificationLevel, label: 'Off' },
                { value: 'important' as NotificationLevel, label: 'Important' },
                { value: 'all' as NotificationLevel, label: 'All' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={notificationLoading}
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    if (isNativePlatform()) {
                      // Native flow
                      if (opt.value === 'off') {
                        setNotificationLevel('off');
                        await syncTaskNotifications(useTaskStore.getState().tasks, 'off', true, false);
                        toast.success('Notifications turned off');
                        return;
                      }

                      setNotificationLoading(true);
                      try {
                        const status = await getPermissionStatus();
                        if (status !== 'granted') {
                          const permResult = await requestPermissionFromUserAction();
                          if (permResult.status !== 'granted') {
                            toast.error('Notifications blocked. Go to iPhone Settings → spaacetime → Notifications.', { duration: 6000 });
                            return;
                          }
                        }

                        setNotificationLevel(opt.value);

                        const testResult = await scheduleTestNotification(8);
                        console.log('[notifications] test result', testResult);

                        const po = useTimezoneStore.getState().persistentOverdue;
                        const syncResult = await syncTaskNotifications(useTaskStore.getState().tasks, opt.value, true, po);
                        console.log('[notifications] level change sync', syncResult);

                        toast.success(
                          testResult.ok
                            ? `Notifications set to ${opt.label}. Test alert in ~8s.`
                            : `Notifications set to ${opt.label}.`
                        );
                      } catch (error) {
                        console.error('[notifications] enable flow error', error);
                        const msg = error instanceof Error ? error.message : String(error);
                        toast.error(msg, { duration: 7000 });
                      } finally {
                        setNotificationLoading(false);
                      }
                    } else {
                      // Web browser flow
                      if (opt.value === 'off') {
                        setNotificationLevel('off');
                        syncWebNotifications(useTaskStore.getState().tasks, 'off');
                        toast.success('Notifications turned off');
                        return;
                      }

                      setNotificationLoading(true);
                      try {
                        const webPerm = getWebNotificationPermission();
                        if (webPerm === 'unsupported') {
                          toast.error('This browser does not support notifications.');
                          return;
                        }
                        if (webPerm !== 'granted') {
                          const result = await requestWebNotificationPermission();
                          if (result !== 'granted') {
                            const inIframe = window.self !== window.top;
                            toast.error(
                              inIframe
                                ? 'Notifications are blocked in preview mode. Try on the published site.'
                                : 'Notifications blocked. Check your browser settings.',
                              { duration: 6000 }
                            );
                            return;
                          }
                        }

                        setNotificationLevel(opt.value);
                        syncWebNotifications(useTaskStore.getState().tasks, opt.value);
                        toast.success(`Notifications set to ${opt.label}.`);
                      } catch (error) {
                        console.error('[web-notifications] enable error', error);
                        toast.error(error instanceof Error ? error.message : String(error), { duration: 7000 });
                      } finally {
                        setNotificationLoading(false);
                      }
                    }
                  }}
                  className={`flex-1 py-2.5 rounded-[2px] text-[11px] font-mono tracking-wider transition-colors min-h-[44px] disabled:opacity-50 ${
                    notificationLevel === opt.value
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 border border-transparent'
                  }`}
                >
                  {notificationLoading && opt.value !== 'off' && opt.value === notificationLevel ? '…' : opt.label.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="text-[9px] font-mono text-muted-foreground/40 mt-1.5 leading-relaxed">
              {notificationLevel === 'off' && 'No task notifications.'}
              {notificationLevel === 'important' && 'Notifications for FIXED and LOCK tasks only.'}
              {notificationLevel === 'all' && 'Notifications for all scheduled tasks (FLEX, SEMI, FIXED, LOCK).'}
            </div>

            {/* Persistent Overdue toggle — advanced */}
            {notificationLevel !== 'off' && showAdvanced && (
              <button
                onClick={async () => {
                  const next = !persistentOverdue;
                  setPersistentOverdue(next);
                  if (isNativePlatform()) {
                    await syncTaskNotifications(useTaskStore.getState().tasks, notificationLevel, true, next);
                  }
                  toast.success(next ? 'Persistent overdue reminders enabled' : 'Persistent overdue reminders disabled');
                }}
                className="w-full flex items-center justify-between bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px] mt-2"
              >
                <div className="text-left">
                  <div className="text-[12px] font-mono text-foreground">Persistent overdue reminders</div>
                  <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                    Keep reminding every minute after a task becomes overdue
                  </div>
                </div>
                <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                  persistentOverdue ? 'bg-primary justify-end' : 'bg-border justify-start'
                }`}>
                  <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                </div>
              </button>
            )}
          </div>

          {/* Sound — advanced */}
          {showAdvanced && (
          <div className="border-t border-border/30 pt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Volume2 size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">SOUND</span>
            </div>
            <button
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                if (next) {
                  // Play a preview blip so user knows it's on
                  import('@/utils/soundEngine').then(m => m.playUISound('blip'));
                }
              }}
              className="w-full flex items-center justify-between bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px]"
            >
              <div className="text-left">
                <div className="text-[12px] font-mono text-foreground">UI sounds</div>
                <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                  Subtle analog clicks, blips, and swells
                </div>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                soundEnabled ? 'bg-primary justify-end' : 'bg-border justify-start'
              }`}>
                <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </div>
            </button>
          </div>
          )}

            <div className="flex items-center gap-1.5 mb-2">
              <Moon size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">APPEARANCE</span>
            </div>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="w-full flex items-center justify-between bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px] mb-3"
            >
              <div className="text-left">
                <div className="text-[12px] font-mono text-foreground">Dark mode</div>
                <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                  Switch to a darker color scheme
                </div>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                darkMode ? 'bg-primary justify-end' : 'bg-border justify-start'
              }`}>
                <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </div>
            </button>

            {/* Show completed tasks toggle */}
            <button
              onClick={() => setShowCompletedTasks(!showCompletedTasks)}
              className="w-full flex items-center justify-between bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px] mb-3"
            >
              <div className="text-left">
                <div className="text-[12px] font-mono text-foreground">Show completed tasks</div>
                <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                  Keep completed tasks visible on timeline with strikethrough
                </div>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                showCompletedTasks ? 'bg-primary justify-end' : 'bg-border justify-start'
              }`}>
                <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </div>
            </button>

            {/* Billing section toggle */}
            <button
              onClick={() => {
                if (hasBillableTag) return; // locked on while any tag is billable
                setShowBilling(!showBilling);
              }}
              disabled={hasBillableTag}
              className="w-full flex items-center justify-between bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px] mb-3 disabled:cursor-not-allowed"
            >
              <div className="text-left">
                <div className="text-[12px] font-mono text-foreground">Show Billing section</div>
                <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                  {hasBillableTag
                    ? 'Locked on — you have billable tags. Unmark them to hide.'
                    : 'Adds Billing to the main navigation. Auto-enables when you mark a tag billable.'}
                </div>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                billingEffectivelyOn ? 'bg-primary justify-end' : 'bg-border justify-start'
              }`}>
                <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </div>
            </button>

            {/* Currency selector — only when billing is on */}
            {billingEffectivelyOn && (
              <div className="w-full flex items-center justify-between bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px] mb-3">
                <div className="text-left">
                  <div className="text-[12px] font-mono text-foreground">Currency</div>
                  <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                    Used across all billable tags & invoices
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-mono text-muted-foreground tabular-nums">{currencySymbol(defaultCurrency)}</span>
                  <select
                    value={defaultCurrency || 'USD'}
                    onChange={(e) => saveStyle({ defaultCurrency: e.target.value })}
                    className="input-compact bg-background border border-border/50 rounded-sm px-2 py-1 text-[12px] font-mono text-foreground focus:outline-none focus:border-primary/50"
                  >
                    {CURRENCIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Comfort Mode toggle */}
            <button
              onClick={() => setComfortMode(!comfortMode)}
              className="w-full flex items-center justify-between bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px] mb-3"
            >
              <div className="text-left">
                <div className="text-[12px] font-mono text-foreground">Comfortable mode</div>
                <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                  Larger text and touch targets for easier reading
                </div>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                comfortMode ? 'bg-primary justify-end' : 'bg-border justify-start'
              }`}>
                <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </div>
            </button>

            {/* Color Scheme Editor — advanced */}
            {showAdvanced && <ColorSchemePanel />}
          </div>

          {/* Change Password */}
          <div className="border-t border-border/30 pt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Lock size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">ACCOUNT</span>
            </div>

            {pwMode === 'closed' && (
              <div className="space-y-2">
                {!emailConfirmed && authProvider === 'email' && (
                  <div className="bg-muted/20 border border-border/50 rounded-sm p-3 space-y-2">
                    <div className="text-[11px] font-mono text-foreground leading-relaxed">
                      Verify your email for password recovery and account security.
                    </div>
                    <button
                      onClick={async () => {
                        if (!userEmail) return;
                        setVerifySending(true);
                        try {
                          const { error } = await supabase.auth.resend({ type: 'signup', email: userEmail });
                          if (error) throw error;
                          toast.success('Verification email sent');
                        } catch (err: any) {
                          toast.error(err.message || 'Failed to send verification');
                        } finally {
                          setVerifySending(false);
                        }
                      }}
                      disabled={verifySending}
                      className="w-full py-2 rounded-sm border border-primary/30 text-[10px] font-mono tracking-wider text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                    >
                      {verifySending ? 'SENDING...' : 'SEND VERIFICATION EMAIL'}
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setPwMode('change')}
                  className="w-full flex items-center justify-center gap-2 bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px] text-[12px] font-mono tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  CHANGE PASSWORD
                </button>
                <button
                  onClick={async () => {
                    setPwLoading(true);
                    try {
                      await supabase.auth.signOut();
                      toast.success('Signed out. Use "EMAIL ME A CODE" on the sign-in screen to reset.');
                    } catch (err: any) {
                      toast.error(err.message || 'Failed to sign out');
                    } finally {
                      setPwLoading(false);
                    }
                  }}
                  disabled={pwLoading}
                  className="w-full flex items-center justify-center gap-2 bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px] text-[12px] font-mono tracking-wider text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                >
                  {pwLoading ? 'SIGNING OUT...' : "FORGOT PASSWORD? SIGN OUT & USE CODE"}
                </button>
              </div>
            )}

            {pwMode === 'change' && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (newPw.length < 6) { toast.error('Password must be at least 6 characters'); return; }
                  if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
                  setPwLoading(true);
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session) {
                      toast.error('Session expired. Please sign in again.');
                      return;
                    }

                    if (authProvider === 'email' && currentPw) {
                      const { error: signInError } = await supabase.auth.signInWithPassword({
                        email: session.user.email!,
                        password: currentPw,
                      });
                      if (signInError) throw new Error('Current password is incorrect');
                    }

                    const { error } = await supabase.auth.updateUser({ password: newPw });
                    if (error) throw error;
                    toast.success('Password updated');
                    setPwMode('closed');
                    setCurrentPw(''); setNewPw(''); setConfirmPw('');
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to update password');
                  } finally {
                    setPwLoading(false);
                  }
                }}
                className="space-y-2"
              >
                {authProvider === 'email' && (
                  <input
                    type="password"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="Current password"
                    required
                    className="w-full bg-muted/30 border border-border/50 rounded-sm px-3 py-2.5 text-[12px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30 min-h-[44px]"
                  />
                )}
                {authProvider === 'google' && (
                  <div className="text-[10px] font-mono text-muted-foreground/50 bg-muted/20 border border-border/30 rounded-sm p-2.5 leading-relaxed">
                    You signed in with Google. Setting a password lets you also log in with email.
                  </div>
                )}
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="New password"
                  required
                  minLength={6}
                  className="w-full bg-muted/30 border border-border/50 rounded-sm px-3 py-2.5 text-[12px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30 min-h-[44px]"
                />
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="Confirm new password"
                  required
                  minLength={6}
                  className="w-full bg-muted/30 border border-border/50 rounded-sm px-3 py-2.5 text-[12px] font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30 min-h-[44px]"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setPwMode('closed'); setCurrentPw(''); setNewPw(''); setConfirmPw(''); }}
                    className="flex-1 py-2.5 rounded-sm border border-border/50 text-[11px] font-mono tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    disabled={pwLoading}
                    className="flex-1 py-2.5 rounded-sm bg-primary text-primary-foreground text-[11px] font-mono tracking-wider hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {pwLoading ? 'SAVING...' : 'UPDATE'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Subscription status */}
          <div className="border-t border-border/30 pt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Lock size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">SUBSCRIPTION</span>
            </div>
            {(() => {
              const sub = subscription;
              if (!sub) return null;
              if (sub.lifetime_access) return (
                <div className="bg-primary/5 border border-primary/20 rounded-sm p-3">
                  <div className="text-[12px] font-mono text-primary font-medium">LIFETIME ACCESS</div>
                  <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">No expiration</div>
                </div>
              );
              if (sub.status === 'active') return (
                <div className="space-y-2">
                  <div className="bg-muted/30 border border-border/50 rounded-sm p-3">
                    <div className="text-[12px] font-mono text-foreground font-medium">
                      {sub.payment_source === 'apple_iap'
                        ? 'MONTHLY PLAN · APPLE'
                        : (sub.plan === 'yearly' ? 'YEARLY' : 'MONTHLY') + ' PLAN'}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">Active subscription</div>
                  </div>
                  {sub.payment_source === 'apple_iap' ? (
                    <ManageAppleButton />
                  ) : iosNative ? (
                    // Stripe-managed sub viewed inside the iOS app — no portal link
                    <div className="text-[10px] font-mono text-muted-foreground/50 px-1">
                      Manage this subscription on the web at launchspacetime.com
                    </div>
                  ) : (
                    <ManageSubscriptionButton />
                  )}
                </div>
              );
              if (sub.status === 'cancelling') return (
                <div className="space-y-2">
                  <div className="bg-destructive/5 border border-destructive/20 rounded-sm p-3">
                    <div className="text-[12px] font-mono text-destructive font-medium">CANCELLING</div>
                    <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                      {cancellingDaysLeft} day{cancellingDaysLeft !== 1 ? 's' : ''} remaining
                    </div>
                  </div>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('toggle-subscribe'))}
                    className="w-full flex items-center justify-center gap-2 bg-primary/10 border border-primary/20 rounded-sm p-3 min-h-[48px] text-[12px] font-mono tracking-wider text-primary hover:bg-primary/15 transition-colors"
                  >
                    RESUBSCRIBE
                  </button>
                </div>
              );
              if (sub.status === 'trialing') return (
                <div className="space-y-2">
                  <div className="bg-muted/30 border border-border/50 rounded-sm p-3">
                    <div className="text-[12px] font-mono text-foreground font-medium">FREE TRIAL</div>
                    <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                      {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} remaining
                    </div>
                  </div>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('toggle-subscribe'))}
                    className="w-full flex items-center justify-center gap-2 bg-primary/10 border border-primary/20 rounded-sm p-3 min-h-[48px] text-[12px] font-mono tracking-wider text-primary hover:bg-primary/15 transition-colors"
                  >
                    SUBSCRIBE NOW
                  </button>
                </div>
              );
              return (
                <div className="space-y-2">
                  <div className="bg-destructive/5 border border-destructive/20 rounded-sm p-3">
                    <div className="text-[12px] font-mono text-destructive font-medium">EXPIRED</div>
                    <div className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">Subscribe to continue</div>
                  </div>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('toggle-subscribe'))}
                    className="w-full flex items-center justify-center gap-2 bg-primary/10 border border-primary/20 rounded-sm p-3 min-h-[48px] text-[12px] font-mono tracking-wider text-primary hover:bg-primary/15 transition-colors"
                  >
                    SUBSCRIBE NOW
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Admin (only for admins) */}
          {isAdmin && (
            <div className="border-t border-border/30 pt-4">
              <button
                onClick={() => setAdminOpen(true)}
                className="w-full flex items-center justify-center gap-2 bg-primary/5 border border-primary/20 rounded-sm p-3 min-h-[48px] text-[12px] font-mono tracking-wider text-primary hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <Shield size={14} strokeWidth={1.5} />
                <span>ADMIN</span>
              </button>
            </div>
          )}

          {/* Account — Privacy / Terms / Recently Deleted / Delete Account */}
          <div className="border-t border-border/30 pt-4 space-y-2">
            <div className="text-[10px] font-mono text-muted-foreground/50 tracking-[0.18em] mb-1">
              ACCOUNT
            </div>
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-between bg-muted/20 border border-border/40 rounded-sm p-3 min-h-[44px] text-[12px] font-mono text-foreground hover:bg-muted/40 transition-colors"
            >
              <span>Privacy Policy</span>
              <span className="text-[10px] text-muted-foreground/50">↗</span>
            </a>
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-between bg-muted/20 border border-border/40 rounded-sm p-3 min-h-[44px] text-[12px] font-mono text-foreground hover:bg-muted/40 transition-colors"
            >
              <span>Terms of Service</span>
              <span className="text-[10px] text-muted-foreground/50">↗</span>
            </a>
            <button
              onClick={() => {
                onClose();
                window.dispatchEvent(new CustomEvent('toggle-archive'));
              }}
              className="w-full flex items-center justify-between bg-muted/20 border border-border/40 rounded-sm p-3 min-h-[44px] text-[12px] font-mono text-foreground hover:bg-muted/40 transition-colors"
            >
              <span>Recently Deleted</span>
              <span className="text-[10px] text-muted-foreground/50">→</span>
            </button>
            {showAdvanced && (
              <button
                onClick={() => setDeleteAccountOpen(true)}
                className="w-full flex items-center justify-center gap-2 bg-destructive/5 border border-destructive/30 rounded-sm p-3 min-h-[44px] text-[12px] font-mono tracking-wider text-destructive hover:bg-destructive/10 transition-colors"
              >
                DELETE ACCOUNT
              </button>
            )}
            {showAdvanced && (
              <button
                onClick={() => setDebugOpen(true)}
                className="w-full flex items-center justify-center gap-2 bg-muted/20 border border-border/40 rounded-sm p-3 min-h-[44px] text-[11px] font-mono tracking-[0.15em] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                DEBUG · PRODUCTION READINESS
              </button>
            )}
          </div>

        </div>
      </div>
    </div>

    <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
    <DeleteAccountModal open={deleteAccountOpen} onClose={() => setDeleteAccountOpen(false)} />
    <DebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} />
    </>
  );
}

function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);

  const handleManage = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Please sign in first'); return; }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/customer-portal`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        toast.error(data.error || 'Failed to open subscription management');
      }
    } catch (err) {
      toast.error('Failed to open subscription management');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleManage}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px] text-[12px] font-mono tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
    >
      {loading ? 'LOADING...' : 'MANAGE SUBSCRIPTION'}
    </button>
  );
}

function ManageAppleButton() {
  const handleClick = () => {
    // Apple's universal subscription management deep link.
    // Opens the App Store Subscriptions screen on iOS, or the web equivalent elsewhere.
    window.open('https://apps.apple.com/account/subscriptions', '_blank');
  };
  return (
    <button
      onClick={handleClick}
      className="w-full flex items-center justify-center gap-2 bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px] text-[12px] font-mono tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
    >
      MANAGE IN APPLE SUBSCRIPTIONS
    </button>
  );
}
