-- F13: classroom_sessions could be rewritten or deleted by any signed-in user.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='classroom_sessions' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.classroom_sessions', p.policyname);
  END LOOP;
END $$;

REVOKE ALL ON public.classroom_sessions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classroom_sessions TO authenticated;

ALTER TABLE public.classroom_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "classroom_sessions_select_signed_in" ON public.classroom_sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "classroom_sessions_insert_staff" ON public.classroom_sessions
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY "classroom_sessions_update_staff" ON public.classroom_sessions
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "classroom_sessions_delete_staff" ON public.classroom_sessions
  FOR DELETE TO authenticated USING (public.is_staff());
