import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCalendarStore } from '@/store/calendarStore';
import { X, RefreshCw, Unplug, Calendar as CalIcon } from 'lucide-react';

export function CalendarPanel() {
  const {
    connected, email, calendars, loading, panelOpen,
    setPanelOpen, checkStatus, startAuth, fetchCalendars,
    toggleCalendar, disconnect,
  } = useCalendarStore();

  useEffect(() => {
    checkStatus();
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      useCalendarStore.getState().handleAuthCallback(code);
    }
  }, []);

  return (
    <AnimatePresence>
      {panelOpen && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="fixed right-3 top-14 z-50 w-64 bg-card border border-border rounded-sm shadow-lg overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
            <div className="flex items-center gap-1.5">
              <CalIcon size={11} strokeWidth={1.5} className="text-muted-foreground/60" />
              <span className="text-[9px] font-mono tracking-widest text-foreground">CALENDARS</span>
            </div>
            <button
              onClick={() => setPanelOpen(false)}
              className="p-0.5 text-muted-foreground/40 hover:text-foreground transition-colors"
            >
              <X size={12} strokeWidth={1.5} />
            </button>
          </div>

          <div className="p-3">
            {!connected ? (
              <div className="text-center py-4">
                <p className="text-[9px] font-mono text-muted-foreground/50 tracking-wider mb-3">
                  CONNECT GOOGLE CALENDAR
                </p>
                <button
                  onClick={startAuth}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-sm text-[9px] font-mono tracking-wider border border-primary/20 text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                >
                  {loading ? 'CONNECTING...' : 'CONNECT'}
                </button>
              </div>
            ) : (
              <>
                {/* Connected account */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[8px] font-mono text-muted-foreground/40 tracking-wider truncate">
                    {email || 'Connected'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={fetchCalendars}
                      className="p-1 text-muted-foreground/30 hover:text-foreground transition-colors"
                      title="Refresh calendars"
                    >
                      <RefreshCw size={9} strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={disconnect}
                      className="p-1 text-muted-foreground/30 hover:text-destructive transition-colors"
                      title="Disconnect"
                    >
                      <Unplug size={9} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                {/* Calendar list */}
                {calendars.length === 0 ? (
                  <p className="text-[8px] font-mono text-muted-foreground/30 tracking-wider">
                    NO CALENDARS FOUND
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    {calendars.map((cal) => (
                      <label
                        key={cal.id}
                        className="flex items-center gap-2 py-1.5 px-1.5 rounded-sm cursor-pointer hover:bg-muted/30 transition-colors"
                      >
                        <div className="relative flex items-center">
                          <input
                            type="checkbox"
                            checked={cal.visible}
                            onChange={(e) => toggleCalendar(cal.id, e.target.checked)}
                            className="sr-only"
                          />
                          <div
                            className={`w-3 h-3 rounded-[2px] border transition-colors ${
                              cal.visible
                                ? 'border-transparent'
                                : 'border-border bg-transparent'
                            }`}
                            style={{
                              backgroundColor: cal.visible ? (cal.color || 'hsl(var(--primary))') : undefined,
                            }}
                          />
                        </div>
                        <span className="text-[9px] font-mono text-foreground/70 truncate flex-1">
                          {cal.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
