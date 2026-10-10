import { supabase } from '@/integrations/supabase/client';
import { useTaskStore, type Task } from '@/store/taskStore';
import type { CalendarEvent } from '@/store/calendarStore';
import { rowToTask } from '@/lib/taskRow';

export function calendarEventKey(event: Pick<CalendarEvent, 'id' | 'calendarId'>): string {
  return JSON.stringify([event.calendarId, event.id]);
}

export function convertedCalendarEventKeys(tasks: Task[]): Set<string> {
  // Keep the source hidden after moving, completing or archiving its task.
  return new Set(tasks.filter(t => t.sourceCalendarId && t.sourceCalendarEventId)
    .map(t => calendarEventKey({ calendarId: t.sourceCalendarId!, id: t.sourceCalendarEventId! })));
}

export async function convertCalendarEventToTask(event: CalendarEvent, category: string): Promise<Task> {
  if (!event.time || event.isAllDay) throw Error('Only timed calendar events can become tasks.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw Error('Sign in before converting this event.');
  const owner = session.user.id;
  // The database saves task + source together and returns the existing task on
  // retry/concurrent conversion. The Google Calendar event itself is unchanged.
  const { data, error } = await supabase.rpc('convert_calendar_event_to_task', {
    calendar_id: event.calendarId, event_id: event.id, event_title: event.title,
    event_date: event.date, event_time: event.time, event_duration: event.duration || 30,
    event_description: event.description, event_category: category || null,
  });
  if (error) throw Error('Could not save the converted task. Please try again.');
  const row = data?.[0];
  if (!row || row.user_id !== owner) throw Error('The converted task could not be verified.');
  const { data: { session: current } } = await supabase.auth.getSession();
  if (current?.user.id !== owner) throw Error('Your account changed. The task was saved to the original account.');
  const task = rowToTask(row);
  // Realtime may already have loaded this row; preserve subsequent local edits.
  useTaskStore.setState(state => state.tasks.some(t => t.id === task.id)
    ? state : { tasks: [...state.tasks, task] });
  return task;
}
