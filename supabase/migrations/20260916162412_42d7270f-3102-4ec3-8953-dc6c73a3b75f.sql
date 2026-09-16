CREATE UNIQUE INDEX google_connections_user_id_upsert_key
  ON public.google_connections (user_id);
DROP INDEX IF EXISTS public.google_connections_user_id_key;