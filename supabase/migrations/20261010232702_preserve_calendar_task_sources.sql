-- A conversion's source identity must survive older clients, full-row upserts,
-- and device-cache restores that send an empty or stale source pair.
-- There is no user action that unlinks a conversion; normal edits remain valid.
create function public.preserve_task_calendar_source()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.source_calendar_id := old.source_calendar_id;
  new.source_calendar_event_id := old.source_calendar_event_id;
  return new;
end;
$$;
revoke all on function public.preserve_task_calendar_source() from public, anon, authenticated;

create trigger preserve_task_calendar_source
before update on public.tasks
for each row
when (old.source_calendar_id is not null and old.source_calendar_event_id is not null
  and (new.source_calendar_id is distinct from old.source_calendar_id
    or new.source_calendar_event_id is distinct from old.source_calendar_event_id))
execute function public.preserve_task_calendar_source();
