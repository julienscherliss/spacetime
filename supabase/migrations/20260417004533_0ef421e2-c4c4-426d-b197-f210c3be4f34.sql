
-- Feedback table
CREATE TABLE public.feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID,
  followup_email TEXT,
  type TEXT NOT NULL CHECK (type IN ('bug', 'feature', 'confusion', 'general')),
  title TEXT,
  message TEXT NOT NULL,
  expected_behavior TEXT,
  location_context TEXT,
  screenshot_url TEXT,
  current_route TEXT,
  app_version TEXT,
  platform TEXT,
  browser TEXT,
  os TEXT,
  screen_size TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  admin_response TEXT,
  internal_notes TEXT,
  status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (status IN ('unreviewed','in_process','resolved','closed','duplicate','need_more_info')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  reviewed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  response_sent_at TIMESTAMPTZ
);

CREATE INDEX idx_feedback_status ON public.feedback(status);
CREATE INDEX idx_feedback_created_at ON public.feedback(created_at DESC);
CREATE INDEX idx_feedback_user_id ON public.feedback(user_id);
CREATE INDEX idx_feedback_type ON public.feedback(type);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can submit feedback for themselves (or anonymously with NULL user_id)
CREATE POLICY "Users can insert own feedback"
ON public.feedback FOR INSERT TO authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Users can view their own
CREATE POLICY "Users can view own feedback"
ON public.feedback FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Admins full access
CREATE POLICY "Admins can view all feedback"
ON public.feedback FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update feedback"
ON public.feedback FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete feedback"
ON public.feedback FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER update_feedback_updated_at
BEFORE UPDATE ON public.feedback
FOR EACH ROW EXECUTE FUNCTION public.update_library_categories_updated_at();

-- Public storage bucket for screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-screenshots', 'feedback-screenshots', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload feedback screenshots"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'feedback-screenshots');

CREATE POLICY "Anyone can view feedback screenshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'feedback-screenshots');

CREATE POLICY "Admins can delete feedback screenshots"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'feedback-screenshots' AND has_role(auth.uid(), 'admin'::app_role));
