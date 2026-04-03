DROP POLICY IF EXISTS "Allow all access to google_connections" ON public.google_connections;
DROP POLICY IF EXISTS "Allow all access to google_calendars" ON public.google_calendars;

CREATE POLICY "No direct client access to google_connections"
ON public.google_connections
FOR ALL
TO public
USING (false)
WITH CHECK (false);

CREATE POLICY "No direct client access to google_calendars"
ON public.google_calendars
FOR ALL
TO public
USING (false)
WITH CHECK (false);