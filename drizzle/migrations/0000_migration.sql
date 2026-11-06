CREATE TABLE public.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL DEFAULT '',
  author text NOT NULL DEFAULT '',
  series_name text NOT NULL DEFAULT '',
  volume text NOT NULL DEFAULT '',
  sku text NOT NULL DEFAULT '',
  needs_review boolean NOT NULL DEFAULT false,
  review_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO authenticated;
GRANT ALL ON public.books TO service_role;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own books select" ON public.books FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own books insert" ON public.books FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own books update" ON public.books FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own books delete" ON public.books FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX books_user_created ON public.books(user_id, created_at DESC);