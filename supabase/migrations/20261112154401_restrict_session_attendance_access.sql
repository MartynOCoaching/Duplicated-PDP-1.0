-- F4: session_attendance accepted reads and writes from anonymous callers.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='session_attendance' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.session_attendance', p.policyname);
  END LOOP;
END $$;

REVOKE ALL ON public.session_attendance FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_attendance TO authenticated;

ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_attendance_select_signed_in" ON public.session_attendance
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "session_attendance_insert_own_or_staff" ON public.session_attendance
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() OR public.is_my_player(player_id));

CREATE POLICY "session_attendance_update_own_or_staff" ON public.session_attendance
  FOR UPDATE TO authenticated
  USING (public.is_staff() OR public.is_my_player(player_id))
  WITH CHECK (public.is_staff() OR public.is_my_player(player_id));

CREATE POLICY "session_attendance_delete_own_or_staff" ON public.session_attendance
  FOR DELETE TO authenticated
  USING (public.is_staff() OR public.is_my_player(player_id));
