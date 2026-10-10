-- Run with an administrative database connection. Uses a synthetic task under
-- an existing owner, exercises authenticated RLS, and rolls back every write.
begin;
do $$ declare owner_id uuid; begin
  select user_id into owner_id from public.tasks limit 1;
  if owner_id is null then raise exception 'A test owner is required'; end if;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
end $$;
set local role authenticated;
do $$
declare
  saved public.tasks;
  edited public.tasks;
  retried public.tasks;
  plain public.tasks;
  source_event text := gen_random_uuid()::text;
  affected integer;
begin
  select * into saved from public.convert_calendar_event_to_task(
    'source-persistence-probe', source_event, 'Calendar source probe', '2099-01-01', '12:00', 30);
  if saved.source_calendar_event_id is distinct from source_event then
    raise exception 'Conversion must save the source';
  end if;

  update public.tasks set title='Probe edited', time='14:00',
    source_calendar_id=null, source_calendar_event_id=null
    where id=saved.id returning * into edited;
  if edited.title <> 'Probe edited' or edited.time <> '14:00'
    or edited.source_calendar_id is distinct from saved.source_calendar_id
    or edited.source_calendar_event_id is distinct from source_event then
    raise exception 'A stale empty source must not block normal edits or erase the link';
  end if;

  update public.tasks set source_calendar_id='stale-calendar', source_calendar_event_id='stale-event'
    where id=saved.id returning * into edited;
  if edited.source_calendar_id is distinct from saved.source_calendar_id
    or edited.source_calendar_event_id is distinct from source_event then
    raise exception 'A stale source must not retarget the conversion';
  end if;

  -- Full-row upserts can occur on old devices or when a restored cache lacks a baseline.
  insert into public.tasks (id,user_id,title,date,time,duration,source_calendar_id,source_calendar_event_id)
    values (saved.id,auth.uid(),'Probe upserted','2099-01-01','15:00',45,null,null)
    on conflict (id) do update set title=excluded.title,time=excluded.time,duration=excluded.duration,
      source_calendar_id=excluded.source_calendar_id,source_calendar_event_id=excluded.source_calendar_event_id
    returning * into edited;
  if edited.title <> 'Probe upserted' or edited.duration <> 45
    or edited.source_calendar_event_id is distinct from source_event then
    raise exception 'An upsert must preserve the source and accept ordinary changes';
  end if;

  update public.tasks set completed=true,archived_at=now(),archive_reason='deleted',
    source_calendar_id=null,source_calendar_event_id=null where id=saved.id returning * into edited;
  select * into retried from public.convert_calendar_event_to_task(
    saved.source_calendar_id,source_event,'Retry must not overwrite','2099-01-02','12:00',30);
  if not edited.completed or edited.archived_at is null
    or retried.id is distinct from saved.id or retried.title <> 'Probe upserted'
    or retried.source_calendar_event_id is distinct from source_event then
    raise exception 'Completion, deletion and conversion retries must retain the one original source';
  end if;

  insert into public.tasks (user_id,title,date) values (auth.uid(),'Unlinked probe','2099-01-01') returning * into plain;
  if plain.source_calendar_event_id is not null then raise exception 'Ordinary tasks stay unlinked'; end if;
  update public.tasks set source_calendar_id='repair-probe',source_calendar_event_id=source_event
    where id=plain.id returning * into plain;
  if plain.source_calendar_event_id is distinct from source_event then
    raise exception 'An initial confirmed source repair must still be allowed';
  end if;

  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
  update public.tasks set title='Other account' where id=saved.id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'The trigger must not bypass task ownership'; end if;
end $$;
select 'PASS: stale patch/upsert/retarget, normal edits, delete/retry, initial repair and account isolation' as result;
rollback;
