-- F7: the players roster (names, emails, teams of minors) was readable by anon.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='players' AND cmd IN ('SELECT','ALL') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.players', p.policyname);
  END LOOP;
END $$;

REVOKE ALL ON public.players FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.players TO authenticated;

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "players_select_signed_in" ON public.players
  FOR SELECT TO authenticated USING (true);
