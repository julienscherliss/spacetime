import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCalendarStore } from '@/store/calendarStore';
import { X, Calendar as CalIcon, MapPin, Clock, Check, Tag, Trash2, RotateCcw, Circle } from 'lucide-react';
import { formatTime12h } from '@/hooks/useCurrentTime';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLibraryStore } from '@/store/libraryStore';

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function CategorySelect({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const categories = useLibraryStore((s) => s.categories);
  return (
    <div className="flex flex-wrap gap-1.5">
      {categories.map((cat) => (
        <button
          key={cat.value}
          onClick={() => onChange(value === cat.value ? '' : cat.value)}
          className={`px-2.5 py-1.5 rounded-sm text-[10px] font-mono tracking-wider transition-colors border ${
            value === cat.value
              ? 'border-primary/30 bg-primary/8 text-primary'
              : 'border-border/40 text-muted-foreground/50 hover:border-border hover:text-foreground/60'
          }`}
        >
          {cat.label.toUpperCase()}
        </button>
      ))}
      {categories.length === 0 && (
        <span className="text-[10px] font-mono text-muted-foreground/30">No tags defined</span>
      )}
    </div>
  );
}

export function CalendarEventEditPanel() {
  const editingEventId = useCalendarStore((s) => s.editingEventId);
  const events = useCalendarStore((s) => s.events);
  const calendars = useCalendarStore((s) => s.calendars);
  const completedEventIds = useCalendarStore((s) => s.completedEventIds);
  const deletedEventIds = useCalendarStore((s) => s.deletedEventIds);
  const eventCategories = useCalendarStore((s) => s.eventCategories);
  const completeEvent = useCalendarStore((s) => s.completeEvent);
  const uncompleteEvent = useCalendarStore((s) => s.uncompleteEvent);
  const deleteEvent = useCalendarStore((s) => s.deleteEvent);
  const reviveEvent = useCalendarStore((s) => s.reviveEvent);
  const setEventCategory = useCalendarStore((s) => s.setEventCategory);
  const setEditingEvent = useCalendarStore((s) => s.setEditingEvent);
  const isMobile = useIsMobile();

  const event = events.find((e) => e.id === editingEventId);
  const isCompleted = editingEventId ? completedEventIds.includes(editingEventId) : false;
  const isDeleted = editingEventId ? deletedEventIds.includes(editingEventId) : false;
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

  const handleToggleComplete = () => {
    if (!editingEventId) return;
    if (isCompleted) {
      uncompleteEvent(editingEventId);
    } else {
      completeEvent(editingEventId);
    }
  };

  const handleDelete = () => {
    if (!editingEventId) return;
    deleteEvent(editingEventId);
    setEditingEvent(null);
  };

  const handleRevive = () => {
    if (!editingEventId) return;
    reviveEvent(editingEventId);
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
              {/* Title */}
              <div>
                <h3 className={`text-[14px] font-mono font-medium leading-snug ${
                  isCompleted ? 'line-through text-muted-foreground/40' : isDeleted ? 'text-muted-foreground/30' : 'text-foreground'
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
                {isCompleted && (
                  <span className="text-[9px] font-mono text-primary/60 tracking-wider mt-1 block">COMPLETED</span>
                )}
                {isDeleted && (
                  <span className="text-[9px] font-mono text-destructive/60 tracking-wider mt-1 block">DELETED</span>
                )}
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
                {event.endDate && (
                  <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground/60">
                    <CalIcon size={12} strokeWidth={1.5} className="shrink-0" />
                    <span>
                      {new Date(`${event.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' → '}
                      {new Date(`${event.endDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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

              {/* Tag */}
              <div className="border-t border-border/30 pt-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Tag size={11} strokeWidth={1.5} className="text-muted-foreground/40" />
                  <span className="text-[10px] font-mono tracking-[0.12em] text-muted-foreground/40">TAG</span>
                </div>
                <CategorySelect
                  value={localCategory}
                  onChange={(val) => {
                    setLocalCategory(val);
                    if (editingEventId) setEventCategory(editingEventId, val);
                  }}
                />
              </div>

              {/* Actions */}
              <div className="border-t border-border/30 pt-3 space-y-2">
                {isDeleted ? (
                  <button
                    onClick={handleRevive}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-sm border border-border text-[10px] font-mono tracking-wider text-foreground/60 hover:bg-muted/50 transition-colors"
                  >
                    <RotateCcw size={11} />
                    RESTORE EVENT
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleToggleComplete}
                      className={`w-full flex items-center justify-center gap-2 py-2 rounded-sm border text-[10px] font-mono tracking-wider transition-colors ${
                        isCompleted
                          ? 'border-border text-muted-foreground/50 hover:bg-muted/50'
                          : 'border-primary/30 text-primary hover:bg-primary/5'
                      }`}
                    >
                      {isCompleted ? (
                        <>
                          <Circle size={11} />
                          MARK INCOMPLETE
                        </>
                      ) : (
                        <>
                          <Check size={11} />
                          MARK COMPLETE
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleDelete}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-sm border border-destructive/20 text-[10px] font-mono tracking-wider text-destructive/60 hover:bg-destructive/5 transition-colors"
                    >
                      <Trash2 size={11} />
                      DELETE
                    </button>
                  </>
                )}
              </div>

              {/* Source info */}
              <div className="border-t border-border/30 pt-3">
                <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground/30 tracking-wider">
                  <CalIcon size={10} />
                  <span>SYNCED FROM GOOGLE CALENDAR</span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
