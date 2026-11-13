/*
# Let a parent read evaluations for children who have no login yet

## Summary
Coaches record star evaluations per session. A parent can already read the
evaluations of their linked children, but the rule that decides "is this my
child?" only looked at the `users` table. A child a parent added through the
app lives in the `players` table and has no `users` row until they sign in, so
those children were invisible to the rule and their evaluations were blocked.

This migration widens that one rule. It is a read-only access change: parents
still see only their own linked children, coaches keep the access they already
have, and no other role gains anything.

## 1. Changed function
- `public.is_my_child_id(target text)` now returns true when either:
  - a `users` row with that id points back at the signed-in parent through
    `parent_user_id`, OR
  - the signed-in parent's own row lists that id in `child_player_id` or
    `child_player_ids`.
  The second check no longer requires a matching `users` row, which is what
  unblocks children who only exist in `players`.

## 2. Security
- The function stays `SECURITY DEFINER` with a fixed `search_path` of `public`,
  so it can read `public.users` without widening the caller's own access.
- It accepts `text`, so it is safe to call with the text `player_id` column on
  `session_attendance` — no cast can fail on a legacy value.
- EXECUTE stays revoked from PUBLIC and anon, and granted to authenticated only.
- Existing policies on `player_evaluations` are unchanged; only the helper they
  call is widened.

## 3. Notes
- No table or column is created, dropped, renamed or altered, so no data is at
  risk and the migration is safe to re-run.
- `session_attendance` and `players` already allow authenticated reads, so no
  policy change is needed for attendance or athlete names.
*/

CREATE OR REPLACE FUNCTION public.is_my_child_id(target text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select
    auth.uid() is not null
    and target is not null
    and (
      -- The athlete's own record points back at the signed-in parent.
      exists (
        select 1
        from public.users c
        where c.id::text = target
          and c.parent_user_id = auth.uid()::text
      )
      -- Or the signed-in parent lists this athlete as their child.
      or exists (
        select 1
        from public.users p
        where p.id = auth.uid()
          and (
            p.child_player_id = target
            or target = any (coalesce(p.child_player_ids, '{}'::text[]))
          )
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_my_child_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_my_child_id(text) TO authenticated;
