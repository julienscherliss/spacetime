
-- Fix 1: Remove overly broad storage policies (they OR with scoped ones, defeating ownership checks)
DROP POLICY IF EXISTS "Users can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can read attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete attachments" ON storage.objects;

-- Fix 2: Remove user self-update from subscriptions (users should NOT update their own subscription)
DROP POLICY IF EXISTS "Service can update subscriptions" ON public.subscriptions;

-- Recreate: only admins and service role can update subscriptions
CREATE POLICY "Admins can update subscriptions"
ON public.subscriptions FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
