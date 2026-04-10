import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCalendarStore } from '@/store/calendarStore';
import { X, Calendar as CalIcon, MapPin, Clock, Check, Tag } from 'lucide-react';
import { formatTime12h } from '@/hooks/useCurrentTime';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLibraryStore } from '@/store/libraryStore';

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function CalendarEventEditPanel() {
  const editingEventId = useCalendarStore((s) => s.editingEventId);
  const events = useCalendarStore((s) => s.events);
  const calendars = useCalendarStore((s) => s.calendars);
  const completedEventIds = useCalendarStore((s) => s.completedEventIds);
  const eventCategories = useCalendarStore((s) => s.eventCategories);
  const completeEvent = useCalendarStore((s) => s.completeEvent);
  const setEventCategory = useCalendarStore((s) => s.setEventCategory);
  const setEditingEvent = useCalendarStore((s) => s.setEditingEvent);
  const isMobile = useIsMobile();

  const event = events.find((e) => e.id === editingEventId);
  const isCompleted = editingEventId ? completedEventIds.includes(editingEventId) : false;
  const category = editingEventId ? eventCategories[editingEventId] || '' : '';
  const cal = event ? calendars.find((c) => c.google_calendar_id === event.calendarId) : null;
  const color = cal?.color || '#4285f4';

  const [localCategory, setLocalCategory] = useState(category);

  useEffect(() => {
    setLocalCategory(category);
  }, [category, editingEventId]);

  if (!event) return null;

  const handleClose = () => {
    if (editingEventId && localCategory !== category) {
      setEventCategory(editingEventId, localCategory);
    }
    setEditingEvent(null);
  };

  return (
    <AnimatePresence>
      {editingEventId && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-background/30 backdrop-blur-[1px]"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, x: isMobile ? 0 : 20, y: isMobile ? 20 : 0 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: isMobile ? 0 : 20, y: isMobile ? 20 : 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={`fixed z-50 bg-card border border-border rounded-sm shadow-lg overflow-hidden ${
              isMobile
                ? 'left-3 right-3 bottom-3 max-h-[70vh]'
                : 'right-3 top-14 w-80 max-h-[calc(100vh-4rem)]'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <CalIcon size={13} strokeWidth={1.5} className="text-muted-foreground/60" />
                <span className="text-[11px] font-mono tracking-widest text-foreground/50">CALENDAR EVENT</span>
              </div>
              <button
                onClick={handleClose}
                className="p-1 text-muted-foreground/40 hover:text-foreground transition-colors"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto">
              {/* Title + completion */}
              <div className="flex items-start gap-3">
                <button
                  onClick={() => completeEvent(event.id)}
                  className={`mt-0.5 p-1 rounded-sm transition-all shrink-0 ${
                    isCompleted
                      ? 'text-primary bg-primary/10'
                      : 'text-muted-foreground/25 hover:text-primary hover:bg-primary/5'
                  }`}
                >
                  <Check size={16} />
                </button>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-[14px] font-mono font-medium leading-snug ${
                    isCompleted ? 'line-through text-muted-foreground/40' : 'text-foreground'
                  }`}>
                    {event.title}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-[10px] font-mono text-muted-foreground/40 truncate">
                      {cal?.name || 'Calendar'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Time info */}
              <div className="space-y-2">
                {event.time && (
                  <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground/60">
                    <Clock size={12} strokeWidth={1.5} className="shrink-0" />
                    <span>
                      {formatTime12h(event.time)}
                      {event.duration && ` · ${formatDuration(event.duration)}`}
                    </span>
                  </div>
                )}
                {event.location && (
                  <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground/60">
                    <MapPin size={12} strokeWidth={1.5} className="shrink-0" />
                    <span className="truncate">{event.location}</span>
                  </div>
                )}
              </div>

              {/* Description */}
              {event.description && (
                <div className="border-t border-border/30 pt-3">
                  <p className="text-[11px] font-mono text-muted-foreground/50 leading-relaxed whitespace-pre-wrap line-clamp-6">
                    {event.description}
                  </p>
                </div>
              )}

              {/* Tag/Category */}
              <div className="border-t border-border/30 pt-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Tag size={11} strokeWidth={1.5} className="text-muted-foreground/40" />
                  <span className="text-[10px] font-mono tracking-[0.12em] text-muted-foreground/40">TAG</span>
                </div>
                <TagAutocomplete
                  value={localCategory}
                  onChange={(val) => {
                    setLocalCategory(val);
                    if (editingEventId) setEventCategory(editingEventId, val);
                  }}
                />
              </div>

              {/* Locked notice */}
              <div className="border-t border-border/30 pt-3">
                <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground/30 tracking-wider">
                  <CalIcon size={10} />
                  <span>SYNCED FROM GOOGLE CALENDAR · LOCKED</span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
