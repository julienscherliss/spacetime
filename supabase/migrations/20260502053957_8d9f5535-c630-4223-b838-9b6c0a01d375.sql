CREATE TABLE public.tag_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tag_value text NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tag_value)
);
ALTER TABLE public.tag_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own tag notes" ON public.tag_notes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own tag notes" ON public.tag_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own tag notes" ON public.tag_notes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own tag notes" ON public.tag_notes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_tag_notes_updated BEFORE UPDATE ON public.tag_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();