
-- Make bucket non-listable by removing the broad public SELECT and using public URLs only
DROP POLICY IF EXISTS "Anyone can view feedback screenshots" ON storage.objects;

-- Public bucket already serves files via public URL endpoint without RLS;
-- Add narrower policy: only authenticated users (admins/owners) can list/select via API
CREATE POLICY "Admins can list feedback screenshots"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'feedback-screenshots' AND has_role(auth.uid(), 'admin'::app_role));
