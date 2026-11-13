-- Helper predicates used by the tightened policies below.
-- Team/player identifiers are stored as text on some tables and uuid on others,
-- so every comparison is done in text form.

-- is_staff(): caller runs part of the organisation (coach or association).
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, '')) in ('coach', 'association')
  )
  or exists (select 1 from public.coaches c where c.id = auth.uid());
$$;

-- is_my_team(): the given team is one the caller is attached to.
CREATE OR REPLACE FUNCTION public.is_my_team(target text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select target is not null and (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and (u.team_id = target or target = any (coalesce(u.team_ids, '{}'::text[])))
    )
    or exists (
      select 1 from public.coaches c
      where c.id = auth.uid()
        and (c.team_id::text = target
             or target = any (coalesce(array(select x::text from unnest(c.team_ids) x), '{}'::text[])))
    )
    or exists (
      select 1 from public.players p
      where p.id = auth.uid() and p.team_id::text = target
    )
  );
$$;

-- is_my_player(): the given athlete is the caller themselves, or a child linked
-- to the caller's account, or an athlete on a team the caller is attached to.
CREATE OR REPLACE FUNCTION public.is_my_player(target text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select target is not null and (
    target = auth.uid()::text
    or exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and (u.child_player_id = target
             or target = any (coalesce(u.child_player_ids, '{}'::text[])))
    )
    or exists (
      select 1 from public.players p
      where p.id::text = target and public.is_my_team(p.team_id::text)
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_staff() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_my_team(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_my_player(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_my_team(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_my_player(text) TO authenticated;
