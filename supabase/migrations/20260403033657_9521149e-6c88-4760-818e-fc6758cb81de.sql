
CREATE TABLE public.google_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE,
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamptz,
  email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.google_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.google_connections(id) ON DELETE CASCADE NOT NULL,
  google_calendar_id text NOT NULL,
  name text NOT NULL,
  color text,
  visible boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(connection_id, google_calendar_id)
);

ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to google_connections" ON public.google_connections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to google_calendars" ON public.google_calendars FOR ALL USING (true) WITH CHECK (true);
