ALTER TABLE public.google_connections ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS google_connections_user_id_key ON public.google_connections(user_id) WHERE user_id IS NOT NULL;
ALTER TABLE public.google_connections ALTER COLUMN device_id DROP NOT NULL;