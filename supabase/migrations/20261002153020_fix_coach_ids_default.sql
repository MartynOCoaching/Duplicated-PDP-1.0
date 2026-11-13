/*
# Add default for coach_ids column on users table

## Problem
The `coach_ids` column (uuid[]) on the `users` table has no default value.
When the trigger or app doesn't provide it, it stays NULL instead of an empty array.

## Fix
Set default to `'{}'::uuid[]` to match the pattern used by `team_ids` and `child_player_ids`.
*/

ALTER TABLE public.users
ALTER COLUMN coach_ids SET DEFAULT '{}'::uuid[];
