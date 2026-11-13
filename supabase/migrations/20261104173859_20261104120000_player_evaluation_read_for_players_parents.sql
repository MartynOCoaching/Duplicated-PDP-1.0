/*
# Let players and parents read their own evaluations

## Summary
Coaches record attendance and star evaluations per session. Until now the
`player_evaluations` table could only be read by coaches, so the athlete and
their parent saw nothing about their own ratings.

This migration adds read-only access for:
- a player, to the evaluation rows about themselves
- a parent, to the evaluation rows about their linked children

Nothing else changes. Coaches keep full create/read/update/delete access, and no
other role can read evaluations.

## 1. New helper function
- `public.is_my_child_id(target text)` returns true when `target` is one of the
  signed-in parent's own children. A child counts as the parent's when either:
  - the parent's own user row lists the id in `child_player_id` or
    `child_player_ids`, or
  - the child's user row points back with `parent_user_id`.
- It accepts text so it is safe to call with the text `player_id` column on
  `session_attendance` (no cast can fail on a legacy value).
- The check is always scoped to `auth.uid()`, so a signed-in user can only ever
  match ids they themselves have declared as their children.
- SECURITY DEFINER with a fixed `search_path` so it can read `public.users`
  without widening the caller's own access.
- EXECUTE is revoked from PUBLIC and anon, then granted to authenticated only.

## 2. New row level security policies on `player_evaluations`
- `evals_player_select_own`: a signed-in player may SELECT rows whose `player_id`
  equals their own auth uid.
- `evals_parent_select_child`: a signed-in parent may SELECT rows whose
  `player_id` is one of their children.

Existing coach policies are left untouched, so the coach experience is unchanged.

## 3. Notes
- `session_attendance` already carries a public read policy, so attendance figures
  need no schema or policy change.
- Children may exist only in the `players` table (linked from the parent's
  `child_player_id` / `child_player_ids`), which is why the helper checks the
  parent's own user row rather than requiring a child `users` row.
- No table or column is dropped, renamed or altered, so no data is at risk.
*/

CREATE OR REPLACE FUNCTION public.is_my_child_id(target text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select auth.uid() is not null
     and target is not null
     and (
       exists (
         select 1
         from public.users p
         where p.id = auth.uid()
           and (
             p.child_player_id = target
             or target = any (coalesce(p.child_player_ids, '{}'::text[]))
           )
       )
       or exists (
         select 1
         from public.users c
         where c.id::text = target
           and c.parent_user_id = auth.uid()::text
       )
     );
$$;

REVOKE EXECUTE ON FUNCTION public.is_my_child_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_my_child_id(text) TO authenticated;

GRANT SELECT ON public.player_evaluations TO authenticated;

DROP POLICY IF EXISTS "evals_player_select_own" ON public.player_evaluations;
CREATE POLICY "evals_player_select_own"
ON public.player_evaluations FOR SELECT
TO authenticated
USING (auth.uid() = player_id);

DROP POLICY IF EXISTS "evals_parent_select_child" ON public.player_evaluations;
CREATE POLICY "evals_parent_select_child"
ON public.player_evaluations FOR SELECT
TO authenticated
USING (public.is_my_child_id(player_id::text));
