
-- Fix user_roles: prevent non-admin users from inserting roles
-- The existing "Admins can manage all roles" ALL policy lets admins do everything.
-- We need to block non-admin INSERT. Add a restrictive INSERT policy.
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

-- Recreate as separate policies for clarity
CREATE POLICY "Admins can select all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update roles"
ON public.user_roles FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete roles"
ON public.user_roles FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix promo_codes: restrict SELECT to specific code lookup only
DROP POLICY IF EXISTS "Anyone authenticated can check promo codes" ON public.promo_codes;

-- Make bucket private
UPDATE storage.buckets SET public = false WHERE id = 'task-attachments';

-- Drop existing overly-permissive storage policies
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads for task-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload task attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read task attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete task attachments" ON storage.objects;

-- Create ownership-enforcing storage policies
-- Files must be stored as: task-attachments/{user_id}/...
CREATE POLICY "Users can upload own task attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'task-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can read own task attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own task attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own task attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
