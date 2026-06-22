
-- 1. Tighten realtime topic policy to exact-prefix match
DROP POLICY IF EXISTS "Users subscribe to own topics" ON realtime.messages;
CREATE POLICY "Users subscribe to own topics" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.topic() = 'user-data-' || auth.uid()::text
    OR realtime.topic() = 'color-scheme-' || auth.uid()::text
  );

-- 2. Revoke EXECUTE on public.has_role from anon/authenticated to prevent
-- enumeration if any policy or query path were to call it directly.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;

-- 3. Add UPDATE policy for feedback-screenshots bucket (consistency with task-attachments)
CREATE POLICY "Users can update own feedback screenshots"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'feedback-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'feedback-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);
