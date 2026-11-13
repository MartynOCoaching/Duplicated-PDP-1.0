-- F6: run_logs was world-readable and any signed-in user could rewrite any row.
-- Reads stay broad for signed-in users because leaderboards compare athletes.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='run_logs' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.run_logs', p.policyname);
  END LOOP;
END $$;

REVOKE ALL ON public.run_logs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.run_logs TO authenticated;

ALTER TABLE public.run_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "run_logs_select_signed_in" ON public.run_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "run_logs_insert_own_or_staff" ON public.run_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() OR public.is_my_player(player_id::text));

CREATE POLICY "run_logs_update_own_or_staff" ON public.run_logs
  FOR UPDATE TO authenticated
  USING (public.is_staff() OR public.is_my_player(player_id::text))
  WITH CHECK (public.is_staff() OR public.is_my_player(player_id::text));

CREATE POLICY "run_logs_delete_own_or_staff" ON public.run_logs
  FOR DELETE TO authenticated
  USING (public.is_staff() OR public.is_my_player(player_id::text));
