import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCalendarStore } from '@/store/calendarStore';
import { useTaskStore } from '@/store/taskStore';
import { X, Calendar as CalIcon, MapPin, Clock, Tag, Trash2, RotateCcw, EyeOff, ArrowRightLeft } from 'lucide-react';
import { formatTime12h } from '@/hooks/useCurrentTime';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLibraryStore } from '@/store/libraryStore';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TagPickerMenu } from '@/components/TagPickerMenu';
import { toast } from 'sonner';

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
  const deletedEventIds = useCalendarStore((s) => s.deletedEventIds);
  const eventCategories = useCalendarStore((s) => s.eventCategories);
  const deleteEvent = useCalendarStore((s) => s.deleteEvent);
  const reviveEvent = useCalendarStore((s) => s.reviveEvent);
  const setEventCategory = useCalendarStore((s) => s.setEventCategory);
  const setEditingEvent = useCalendarStore((s) => s.setEditingEvent);
  const toggleCalendar = useCalendarStore((s) => s.toggleCalendar);
  const isMobile = useIsMobile();

  const event = events.find((e) => e.id === editingEventId);
  const isDeleted = editingEventId ? deletedEventIds.includes(editingEventId) : false;
  const category = editingEventId ? eventCategories[editingEventId] || '' : '';
  const cal = event ? calendars.find((c) => c.google_calendar_id === event.calendarId) : null;
  const color = cal?.color || '#4285f4';

  const [localCategory, setLocalCategory] = useState(category);
  const [showCatPicker, setShowCatPicker] = useState(false);

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

  const handleDelete = () => {
    if (!editingEventId) return;
    deleteEvent(editingEventId);
    setEditingEvent(null);
  };

  const handleRevive = () => {
    if (!editingEventId) return;
    reviveEvent(editingEventId);
  };

  const handleHideCalendar = () => {
    if (!cal) return;
    toggleCalendar(cal.id, false);
    setEditingEvent(null);
  };

  const categoryLabel = localCategory
    ? (useLibraryStore.getState().categories.find(c => c.value === localCategory)?.label || localCategory)
    : '';

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
                  isDeleted ? 'text-muted-foreground/30' : 'text-foreground'
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

              {/* Tag - dropdown style matching TaskEditPanel */}
              <div className="border-t border-border/30 pt-3">
                <Popover open={showCatPicker} onOpenChange={setShowCatPicker}>
                  <PopoverTrigger asChild>
                    <button className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-mono tracking-wide transition-colors ${
                      localCategory
                        ? 'text-foreground/70 bg-muted/40 hover:bg-muted/60'
                        : 'text-muted-foreground/40 bg-muted/30 hover:bg-muted/50'
                    }`}>
                      <Tag size={10} strokeWidth={1.5} />
                      {categoryLabel || 'Tag'}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-1 z-[70]" align="start" onClick={(e) => e.stopPropagation()}>
                    <TagPickerMenu
                      value={localCategory}
                      onChange={(val) => {
                        setLocalCategory(val);
                        if (editingEventId) setEventCategory(editingEventId, val);
                      }}
                      onClose={() => setShowCatPicker(false)}
                    />
                  </PopoverContent>
                </Popover>
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
                  <button
                    onClick={handleDelete}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-sm border border-destructive/20 text-[10px] font-mono tracking-wider text-destructive/60 hover:bg-destructive/5 transition-colors"
                  >
                    <Trash2 size={11} />
                    DELETE
                  </button>
                )}

                {/* Hide this calendar */}
                {cal && (
                  <button
                    onClick={handleHideCalendar}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-sm border border-border/40 text-[10px] font-mono tracking-wider text-muted-foreground/50 hover:bg-muted/50 transition-colors"
                  >
                    <EyeOff size={11} />
                    HIDE "{cal.name.toUpperCase()}" CALENDAR
                  </button>
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
