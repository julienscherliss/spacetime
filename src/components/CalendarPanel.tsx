import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCalendarStore } from '@/store/calendarStore';
import { X, RefreshCw, Unplug, Calendar as CalIcon } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { isNativePlatform } from '@/utils/nativePlatform';

export function CalendarPanel() {
  const {
    connected, email, calendars, loading, panelOpen,
    setPanelOpen, checkStatus, startAuth, refreshCalendarData,
    toggleCalendar, disconnect,
  } = useCalendarStore();
  const isMobile = useIsMobile();

  useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      window.history.replaceState({}, '', window.location.pathname);
      useCalendarStore.getState().handleAuthCallback(code);
    }
  }, []);

  return (
    <AnimatePresence>
      {panelOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-background/30 backdrop-blur-[1px]"
            onClick={() => setPanelOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={`fixed z-50 bg-card border border-border rounded-sm shadow-lg overflow-hidden ${
              isMobile
                ? 'left-3 right-3 top-14 max-w-sm mx-auto'
                : 'right-3 top-14 w-72'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <CalIcon size={13} strokeWidth={1.5} className="text-muted-foreground/60" />
                <span className="text-[11px] font-mono tracking-widest text-foreground">CALENDARS</span>
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                className="p-1 text-muted-foreground/40 hover:text-foreground transition-colors"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>

            <div className="p-4">
              {!connected ? (
                isNativePlatform() ? (
                  <div className="text-center py-6 px-2">
                    <p className="text-[11px] font-mono text-muted-foreground/60 tracking-wider leading-relaxed">
                      Google Calendar must be connected on the web app. Once connected there, your events will automatically appear here.
                    </p>
                  </div>
                ) : (
                <div className="text-center py-6">
                  <p className="text-[11px] font-mono text-muted-foreground/50 tracking-wider mb-4">
                    CONNECT GOOGLE CALENDAR
                  </p>
                  <button
                    onClick={startAuth}
                    disabled={loading}
                    className="px-4 py-2 rounded-sm text-[11px] font-mono tracking-wider border border-primary/20 text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'CONNECTING...' : 'CONNECT'}
                  </button>
                </div>
                )
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-mono text-muted-foreground/50 tracking-wider truncate">
                      {email || 'Connected'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={refreshCalendarData}
                        className="p-1.5 text-muted-foreground/30 hover:text-foreground transition-colors"
                        title="Sync calendars and events"
                      >
                        <RefreshCw size={12} strokeWidth={1.5} />
                      </button>
                      {!isNativePlatform() && (
                      <button
                        onClick={disconnect}
                        className="p-1.5 text-muted-foreground/30 hover:text-destructive transition-colors"
                        title="Disconnect"
                      >
                        <Unplug size={12} strokeWidth={1.5} />
                      </button>
                      )}
                    </div>
                  </div>

                  {calendars.length === 0 ? (
                    <p className="text-[10px] font-mono text-muted-foreground/30 tracking-wider">
                      NO CALENDARS FOUND
                    </p>
                  ) : (
                    <div className="space-y-0.5">
                      {calendars.map((cal) => (
                        <label
                          key={cal.id}
                          className={`flex items-center gap-2.5 rounded-sm cursor-pointer hover:bg-muted/30 transition-colors ${
                            isMobile ? 'py-2.5 px-2' : 'py-2 px-2'
                          }`}
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
                                cal.visible
                                  ? 'border-transparent'
                                  : 'border-border bg-transparent'
                              }`}
                              style={{
                                backgroundColor: cal.visible ? (cal.color || 'hsl(var(--primary))') : undefined,
                              }}
                            />
                          </div>
                          <span className="text-[11px] font-mono text-foreground/70 truncate flex-1">
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
        </>
      )}
    </AnimatePresence>
  );
}
