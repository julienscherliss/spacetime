-- Create storage bucket for task attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Users can upload attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'task-attachments');

-- Allow authenticated users to read attachments
CREATE POLICY "Users can read attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'task-attachments');

-- Allow authenticated users to delete their attachments
CREATE POLICY "Users can delete attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'task-attachments');

-- Add attachments column to tasks table
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;