
-- =============================================================
-- Security fixes
-- =============================================================

-- 1) Lock down public.has_role so authenticated/anon can no longer
--    enumerate any user's admin status. SECURITY DEFINER callers
--    (capture_hard_delete, restore_deleted_record, guard_bulk_delete,
--    auto_assign_admin) run as the function owner and keep working.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;

-- Update storage policies that referenced the now-restricted public.has_role
-- to use the private.has_role wrapper (already used by all other policies).
DROP POLICY IF EXISTS "Admins can view all feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view feedback screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload feedback screenshots" ON storage.objects;

-- 2) Make feedback-screenshots bucket private with owner/admin-scoped access.
UPDATE storage.buckets SET public = false WHERE id = 'feedback-screenshots';

-- Path is `{user_id}/{timestamp}.{ext}` — enforce ownership on writes.
CREATE POLICY "Users upload own feedback screenshots"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'feedback-screenshots'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users view own feedback screenshots"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'feedback-screenshots'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Admins view all feedback screenshots"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'feedback-screenshots'
  AND private.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins delete feedback screenshots"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'feedback-screenshots'
  AND private.has_role(auth.uid(), 'admin'::public.app_role)
);

-- 3) Validate promo_redemptions inserts against the promo_codes table so
--    users cannot redeem inactive, expired, or exhausted codes.
DROP POLICY IF EXISTS "Users can insert own redemptions" ON public.promo_redemptions;
CREATE POLICY "Users can insert own redemptions"
ON public.promo_redemptions FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.promo_codes pc
    WHERE pc.id = promo_redemptions.promo_code_id
      AND pc.active = true
      AND (pc.expires_at IS NULL OR pc.expires_at > now())
      AND (pc.max_uses IS NULL OR pc.current_uses < pc.max_uses)
  )
);

-- Authenticated users need SELECT on promo_codes for the EXISTS check above
-- to pass when evaluated under the caller role. Restrict to active codes only.
DROP POLICY IF EXISTS "Authenticated can view active promo codes" ON public.promo_codes;
CREATE POLICY "Authenticated can view active promo codes"
ON public.promo_codes FOR SELECT TO authenticated
USING (
  active = true
  AND (expires_at IS NULL OR expires_at > now())
);

-- 4) Restrict realtime channel subscriptions so users can only join their
--    own topics. App channels are named `user-data-{uid}` and
--    `color-scheme-{uid}`, so we match on auth.uid() being in the topic.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users subscribe to own topics" ON realtime.messages;
CREATE POLICY "Users subscribe to own topics"
ON realtime.messages FOR SELECT TO authenticated
USING (
  realtime.topic() LIKE '%' || auth.uid()::text || '%'
);

DROP POLICY IF EXISTS "Users broadcast to own topics" ON realtime.messages;
CREATE POLICY "Users broadcast to own topics"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  realtime.topic() LIKE '%' || auth.uid()::text || '%'
);
