-- Record conversion on the synced task rather than in a device-only hide list.
alter table public.tasks
  add column source_calendar_id text,
  add column source_calendar_event_id text,
  add constraint tasks_calendar_source_pair check (
    (source_calendar_id is null and source_calendar_event_id is null)
    or (nullif(source_calendar_id, '') is not null and nullif(source_calendar_event_id, '') is not null)
  );

create unique index tasks_calendar_source_unique
  on public.tasks (user_id, source_calendar_id, source_calendar_event_id)
  where source_calendar_id is not null and source_calendar_event_id is not null;

create function public.convert_calendar_event_to_task(
  calendar_id text, event_id text, event_title text, event_date text,
  event_time text, event_duration integer,
  event_description text default null, event_category text default null
) returns setof public.tasks
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  saved public.tasks;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if nullif(calendar_id, '') is null or nullif(event_id, '') is null
     or nullif(event_title, '') is null or event_date !~ '^\d{4}-\d{2}-\d{2}$'
     or event_time !~ '^([01]\d|2[0-3]):[0-5]\d$'
     or event_time is null or event_duration is null or event_duration <= 0 then
    raise exception 'Invalid calendar event';
  end if;
  insert into public.tasks (user_id, title, date, time, duration, description, category,
                           source_calendar_id, source_calendar_event_id)
    values (owner_id, event_title, event_date, event_time, event_duration, event_description,
            nullif(event_category, ''), calendar_id, event_id)
    on conflict (user_id, source_calendar_id, source_calendar_event_id)
      where source_calendar_id is not null and source_calendar_event_id is not null
      do nothing returning * into saved;
  if saved.id is null then
    select * into saved from public.tasks t where t.user_id = owner_id
      and t.source_calendar_id = calendar_id and t.source_calendar_event_id = event_id;
  end if;
  return next saved;
end;
$$;
revoke all on function public.convert_calendar_event_to_task(text,text,text,text,text,integer,text,text) from public, anon;
grant execute on function public.convert_calendar_event_to_task(text,text,text,text,text,integer,text,text) to authenticated;
