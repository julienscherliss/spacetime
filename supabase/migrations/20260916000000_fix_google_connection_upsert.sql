-- PostgREST ON CONFLICT (user_id) cannot infer the old partial index.
-- A full unique index still allows multiple NULL user IDs for legacy rows.
-- Create its replacement first so uniqueness remains enforced throughout.
CREATE UNIQUE INDEX google_connections_user_id_upsert_key
  ON public.google_connections (user_id);
DROP INDEX IF EXISTS public.google_connections_user_id_key;
