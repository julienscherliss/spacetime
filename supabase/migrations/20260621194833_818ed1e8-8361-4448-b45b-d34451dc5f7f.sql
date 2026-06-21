-- 1. Recreate deleted_records_recovery admin policy with qualified private.has_role
DROP POLICY IF EXISTS "Admins manage recovery records" ON public.deleted_records_recovery;
CREATE POLICY "Admins manage recovery records"
  ON public.deleted_records_recovery
  FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- 2. Recreate storage policy on feedback-screenshots to use private.has_role
DROP POLICY IF EXISTS "Admins can list feedback screenshots" ON storage.objects;
CREATE POLICY "Admins can list feedback screenshots"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'feedback-screenshots'
    AND private.has_role(auth.uid(), 'admin'::app_role)
  );

-- 3. Remove broad authenticated SELECT on promo_codes (client never reads them; redemption uses service_role edge function, admin policy still applies)
DROP POLICY IF EXISTS "Authenticated can view active promo codes" ON public.promo_codes;

-- 4. Ensure public.has_role is not executable by anon/authenticated/PUBLIC
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM authenticated;