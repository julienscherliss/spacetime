-- Tables from committed migration + required GRANTs
CREATE TABLE IF NOT EXISTS public.live_activity_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  device_id text NOT NULL,
  platform text NOT NULL DEFAULT 'ios',
  push_to_start_token text,
  current_activity_token text,
  current_activity_task_id text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

CREATE TABLE IF NOT EXISTS public.live_activity_device_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  device_id text NOT NULL,
  plan_signature text NOT NULL DEFAULT 'none',
  active boolean NOT NULL DEFAULT false,
  task_id text,
  title text,
  category text,
  symbol_name text,
  is_free_time boolean NOT NULL DEFAULT false,
  start_at timestamptz,
  end_at timestamptz,
  next_title text,
  next_start_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{"active": false}'::jsonb,
  last_dispatched_signature text,
  last_dispatched_at timestamptz,
  last_dispatch_event text,
  last_dispatch_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_activity_devices TO authenticated;
GRANT ALL ON public.live_activity_devices TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_activity_device_plans TO authenticated;
GRANT ALL ON public.live_activity_device_plans TO service_role;

ALTER TABLE public.live_activity_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_activity_device_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own live activity devices"
  ON public.live_activity_devices FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own live activity devices"
  ON public.live_activity_devices FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own live activity devices"
  ON public.live_activity_devices FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own live activity devices"
  ON public.live_activity_devices FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own live activity plans"
  ON public.live_activity_device_plans FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own live activity plans"
  ON public.live_activity_device_plans FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own live activity plans"
  ON public.live_activity_device_plans FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own live activity plans"
  ON public.live_activity_device_plans FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_live_activity_devices_user_updated
  ON public.live_activity_devices(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_activity_plans_active_start
  ON public.live_activity_device_plans(active, start_at, end_at, updated_at);