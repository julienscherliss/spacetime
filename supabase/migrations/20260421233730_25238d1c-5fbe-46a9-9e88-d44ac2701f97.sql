create table public.user_color_schemes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_light_scheme_id text not null default 'cobalt',
  active_dark_scheme_id text not null default 'dark-citrus',
  custom_schemes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_color_schemes enable row level security;

create policy "Users can view their own color schemes"
  on public.user_color_schemes for select
  using (auth.uid() = user_id);

create policy "Users can insert their own color schemes"
  on public.user_color_schemes for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own color schemes"
  on public.user_color_schemes for update
  using (auth.uid() = user_id);

create policy "Users can delete their own color schemes"
  on public.user_color_schemes for delete
  using (auth.uid() = user_id);

alter publication supabase_realtime add table public.user_color_schemes;