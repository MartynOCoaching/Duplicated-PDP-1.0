/*
# Add missing columns to users, coaches, and teams tables

1. Problem

The app saves profile data with fields like `coach_id`, `team_id`, `club_id`,
`team_ids`, `child_player_id`, `child_player_ids`, `parent_user_id`,
`manual_coach_name`, `manual_coach_email`, `coach_role`, `phone`, and
`updated_at` to the `users` table. Most of these columns do not exist in the
database, causing a 400 Bad Request error (PGRST204 — column not found in
schema cache) whenever a coach, player, or parent edits their profile.

Similarly, the `coaches` table is missing `coach_name` and `team_name`, and
the `teams` table is missing `team_name`.

2. Changes

- `users` table: add columns `club_id` (text), `team_id` (text),
  `team_ids` (text[] default '{}'), `coach_id` (text),
  `child_player_id` (text), `child_player_ids` (text[] default '{}'),
  `parent_user_id` (text), `manual_coach_name` (text),
  `manual_coach_email` (text), `coach_role` (text), `phone` (text),
  `updated_at` (timestamptz default now()).
- `coaches` table: add columns `coach_name` (text), `team_name` (text).
- `teams` table: add column `team_name` (text).

3. Security

- No RLS policy changes — existing policies remain in place.
- No new tables created.

4. Important Notes

- All column additions use `IF NOT EXISTS` via a DO block so the migration
  is idempotent and safe to re-run.
- No data is lost or modified — only new nullable columns are added.
- `team_ids` and `child_player_ids` default to an empty array so existing
  rows have a valid array value.
*/

DO $$
BEGIN
  -- users table: add all missing columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'club_id') THEN
    ALTER TABLE users ADD COLUMN club_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'team_id') THEN
    ALTER TABLE users ADD COLUMN team_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'team_ids') THEN
    ALTER TABLE users ADD COLUMN team_ids text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'coach_id') THEN
    ALTER TABLE users ADD COLUMN coach_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'child_player_id') THEN
    ALTER TABLE users ADD COLUMN child_player_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'child_player_ids') THEN
    ALTER TABLE users ADD COLUMN child_player_ids text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'parent_user_id') THEN
    ALTER TABLE users ADD COLUMN parent_user_id text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'manual_coach_name') THEN
    ALTER TABLE users ADD COLUMN manual_coach_name text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'manual_coach_email') THEN
    ALTER TABLE users ADD COLUMN manual_coach_email text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'coach_role') THEN
    ALTER TABLE users ADD COLUMN coach_role text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone') THEN
    ALTER TABLE users ADD COLUMN phone text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'updated_at') THEN
    ALTER TABLE users ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;

  -- coaches table: add missing columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaches' AND column_name = 'coach_name') THEN
    ALTER TABLE coaches ADD COLUMN coach_name text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'coaches' AND column_name = 'team_name') THEN
    ALTER TABLE coaches ADD COLUMN team_name text;
  END IF;

  -- teams table: add missing column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'team_name') THEN
    ALTER TABLE teams ADD COLUMN team_name text;
  END IF;
END $$;
