
-- Tasks table
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  subtasks jsonb DEFAULT '[]'::jsonb,
  type text NOT NULL DEFAULT 'one-time',
  priority smallint NOT NULL DEFAULT 0,
  original_priority smallint NOT NULL DEFAULT 0,
  date text NOT NULL,
  time text,
  duration integer,
  completed boolean NOT NULL DEFAULT false,
  move_count integer NOT NULL DEFAULT 0,
  recurrence jsonb,
  recurrence_parent_id text,
  is_recurrence_instance boolean DEFAULT false,
  is_routine boolean,
  linked boolean DEFAULT false,
  in_waiting_room boolean DEFAULT false,
  waiting_room_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tasks" ON public.tasks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tasks" ON public.tasks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks" ON public.tasks
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tasks" ON public.tasks
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Library items table
CREATE TABLE public.library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  note text DEFAULT '',
  category text DEFAULT 'uncategorized',
  default_duration integer DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own library items" ON public.library_items
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own library items" ON public.library_items
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own library items" ON public.library_items
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own library items" ON public.library_items
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
