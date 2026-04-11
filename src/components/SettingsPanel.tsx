import { useState, useMemo, useEffect } from 'react';
import { useTimezoneStore, getTzAbbr, TIMEZONES } from '@/store/timezoneStore';
import { useCalendarStore } from '@/store/calendarStore';
import { supabase } from '@/integrations/supabase/client';
import { X, Search, Globe, Repeat, MapPin, Calendar as CalIcon, RefreshCw, Unplug, HelpCircle, Moon, Shield, Lock, Bell } from 'lucide-react';
import type { MobilityMode } from '@/store/timezoneStore';
import { toast } from 'sonner';
import { HelpPanel } from './HelpPanel';
import { isNativePlatform } from '@/utils/nativePlatform';
import type { NotificationLevel } from '@/utils/notificationService';
import {
  getPermissionStatus,
  requestPermissionFromUserAction,
  syncTaskNotifications,
  scheduleTestNotification,
} from '@/utils/notificationService';
import { useTaskStore } from '@/store/taskStore';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { timezone, setTimezone, routinesFixedTime, setRoutinesFixedTime, autoDetect, setAutoDetect, darkMode, setDarkMode, mobilityMode, setMobilityMode, notificationLevel, setNotificationLevel } = useTimezoneStore();
  const { connected, email, calendars, loading, checkStatus, startAuth, refreshCalendarData, toggleCalendar, disconnect } = useCalendarStore();
  const nativeRuntime = isNativePlatform();
  const [search, setSearch] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [pwMode, setPwMode] = useState<'closed' | 'change' | 'reset'>('closed');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [authProvider, setAuthProvider] = useState<'email' | 'google' | 'unknown'>('unknown');
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationDebug, setNotificationDebug] = useState<NotificationDebugSnapshot>(() => getDebugSnapshotSync());

  useEffect(() => {
    if (!open) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      const provider = user.app_metadata?.provider;
      setAuthProvider(provider === 'google' ? 'google' : 'email');
    });
  }, [open]);

  useEffect(() => {
    if (open) checkStatus();
  }, [open]);

  // Refresh debug snapshot when panel opens — does NOT trigger scheduling
  useEffect(() => {
    let cancelled = false;
    if (!open) return;

    void (async () => {
      const snapshot = await getDebugSnapshot();
      if (!cancelled) {
        setNotificationDebug((prev) => ({
          ...snapshot,
          requestResult: prev.requestResult,
          requestError: prev.requestError,
          scheduleStatus: prev.scheduleStatus ?? snapshot.scheduleStatus,
          scheduleError: prev.scheduleError,
        }));
      }
    })();

    return () => { cancelled = true; };
  }, [open]);

  const refreshNotificationDebug = async (overrides: Partial<NotificationDebugSnapshot> = {}) => {
    const snapshot = await getDebugSnapshot();
    const hasOverride = <K extends keyof NotificationDebugSnapshot>(key: K) => Object.prototype.hasOwnProperty.call(overrides, key);
    const nextState: NotificationDebugSnapshot = {
      ...snapshot,
      requestResult: hasOverride('requestResult') ? overrides.requestResult ?? null : notificationDebug.requestResult,
      requestError: hasOverride('requestError') ? overrides.requestError ?? null : notificationDebug.requestError,
      scheduleStatus: hasOverride('scheduleStatus') ? overrides.scheduleStatus ?? null : notificationDebug.scheduleStatus ?? snapshot.scheduleStatus,
      scheduleError: hasOverride('scheduleError') ? overrides.scheduleError ?? null : notificationDebug.scheduleError,
    };
    setNotificationDebug(nextState);
    return nextState;
  };

  /**
   * Enable flow: request permission → schedule test → sync tasks.
   * Only called from a direct user tap.
   */
  const handleEnableNotifications = async () => {
    if (!isNativePlatform()) {
      toast('Notifications only work in the native mobile app.');
      return;
    }

    setNotificationLoading(true);

    try {
      console.log('[notifications] enable button tapped');

      // Step 1: Request permission
      const permResult = await requestPermissionFromUserAction();
      console.log('[notifications] permission result', permResult);

      if (permResult.error) {
        await refreshNotificationDebug({
          requestResult: permResult.status,
          requestError: permResult.error,
          scheduleStatus: `Permission error: ${permResult.error}`,
        });
        toast.error(permResult.error, { duration: 7000 });
        return;
      }

      const granted = permResult.status === 'granted';

      if (!granted) {
        await refreshNotificationDebug({
          requestResult: permResult.status,
          scheduleStatus: 'Permission denied. Enable in iPhone Settings → spaacetime → Notifications.',
        });
        toast.error('Notifications blocked. Go to iPhone Settings → spaacetime → Notifications.', { duration: 6000 });
        return;
      }

      // Step 2: Schedule test notification
      const testResult = await scheduleTestNotification(8);
      console.log('[notifications] test result', testResult);

      // Step 3: Sync real task notifications (force to pick up permission change)
      if (notificationLevel !== 'off') {
        const syncResult = await syncTaskNotifications(useTaskStore.getState().tasks, notificationLevel, true);
        console.log('[notifications] initial sync result', syncResult);
      }

      const scheduleStatus = testResult.ok
        ? `Permission granted. Test notification in ~8s.${testResult.scheduledFor ? ` (${testResult.scheduledFor})` : ''}`
        : `Test notification error: ${testResult.error ?? 'Unknown'}`;

      await refreshNotificationDebug({
        requestResult: 'granted',
        scheduleStatus,
        scheduleError: testResult.error,
      });

      toast.success(testResult.ok ? 'Notifications enabled. Test alert in ~8s.' : 'Notifications enabled.');
    } catch (error) {
      console.error('[notifications] enable flow error', error);
      const msg = error instanceof Error ? error.message : String(error);
      await refreshNotificationDebug({ scheduleStatus: `Enable failed: ${msg}`, scheduleError: msg });
      toast.error(msg, { duration: 7000 });
    } finally {
      setNotificationLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return TIMEZONES.slice(0, 50);
    const q = search.toLowerCase();
    return TIMEZONES.filter(tz => tz.toLowerCase().includes(q)).slice(0, 50);
  }, [search]);

  if (!open) return null;

  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-t-lg sm:rounded-lg shadow-lg w-full sm:max-w-sm max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <h2 className="text-sm font-display font-bold text-foreground tracking-tight">SETTINGS</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
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

            {!autoDetect && (
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
          </div>

          {/* Routines timezone behavior */}
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

          {/* Google Calendar */}
          <div className="border-t border-border/30 pt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <CalIcon size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">GOOGLE CALENDAR</span>
            </div>

            {!connected ? (
              <button
                onClick={startAuth}
                disabled={loading}
                className="w-full flex items-center justify-center bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px] text-[12px] font-mono tracking-wider text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
              >
                {loading ? 'CONNECTING...' : 'CONNECT GOOGLE CALENDAR'}
              </button>
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
                    <button
                      onClick={disconnect}
                      className="p-2 text-muted-foreground/40 hover:text-destructive transition-colors rounded-sm hover:bg-destructive/5"
                      title="Disconnect"
                    >
                      <Unplug size={14} strokeWidth={1.5} />
                    </button>
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
          {/* Appearance */}
          <div className="border-t border-border/30 pt-4">

          {/* Task Mobility */}
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Shield size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">TASK MOBILITY</span>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground/50 mb-2">
              Auto-escalate priority based on due dates
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
              {mobilityMode === 'disabled' && 'Due dates won\'t affect priority. Tasks won\'t escalate when moved between days.'}
              {mobilityMode === 'normal' && 'Due this week → Semi · Due today → Fixed · Can still de-escalate manually'}
              {mobilityMode === 'elite' && 'Same as normal, but priority can only be escalated — never lowered'}
            </div>
          </div>

          {/* Notifications */}
          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Bell size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">NOTIFICATIONS</span>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground/50 mb-2">
              Get reminders 5 min before scheduled tasks
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

                    if (!isNativePlatform()) {
                      setNotificationLevel(opt.value);
                      toast('Notification preferences only apply in the native mobile app.');
                      return;
                    }

                    if (opt.value === 'off') {
                      setNotificationLevel('off');
                      await syncTaskNotifications(useTaskStore.getState().tasks, 'off', true);
                      toast.success('Notifications turned off');
                      return;
                    }

                    // Enabling: request permission if needed, then sync + test
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

                      // Schedule test notification
                      const testResult = await scheduleTestNotification(8);
                      console.log('[notifications] test result', testResult);

                      // Sync real task notifications
                      const syncResult = await syncTaskNotifications(useTaskStore.getState().tasks, opt.value, true);
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
          </div>

            <div className="flex items-center gap-1.5 mb-2">
              <Moon size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">APPEARANCE</span>
            </div>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="w-full flex items-center justify-between bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px]"
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
          </div>

          {/* Change Password */}
          <div className="border-t border-border/30 pt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Lock size={12} strokeWidth={1.5} className="text-muted-foreground" />
              <span className="text-[11px] font-mono tracking-[0.12em] text-muted-foreground">ACCOUNT</span>
            </div>

            {pwMode === 'closed' && (
              <div className="space-y-2">
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
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user?.email) { toast.error('No email found'); return; }
                      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                        redirectTo: `${window.location.origin}/reset-password`,
                      });
                      if (error) throw error;
                      toast.success('Password reset link sent to your email');
                    } catch (err: any) {
                      toast.error(err.message || 'Failed to send reset email');
                    } finally {
                      setPwLoading(false);
                    }
                  }}
                  disabled={pwLoading}
                  className="w-full flex items-center justify-center gap-2 bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px] text-[12px] font-mono tracking-wider text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                >
                  {pwLoading ? 'SENDING...' : "FORGOT PASSWORD? SEND RESET LINK"}
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

          {/* Help */}
          <div className="border-t border-border/30 pt-4">
            <button
              onClick={() => setHelpOpen(true)}
              className="w-full flex items-center justify-center gap-2 bg-muted/30 border border-border/50 rounded-sm p-3 min-h-[48px] text-[12px] font-mono tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <HelpCircle size={14} strokeWidth={1.5} />
              <span>HELP & TIPS</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
