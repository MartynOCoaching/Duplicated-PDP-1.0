/*
# Add event_type column to team_schedules

1. Modified Tables
- `team_schedules`
  - New column `event_type` (text, nullable): the kind of session a coach has scheduled.
    Allowed values: 'practice', 'game', 'activity', 'tournament'. When empty, the app
    treats the session as a 'practice' (existing behavior for older rows).

2. Security
- No RLS or grant changes: the column is added to an existing table whose policies
  already grant full CRUD to anon and authenticated roles. New columns inherit the
  table-level privileges, so no extra grants are needed.

3. Important Notes
- Idempotent: uses a conditional DO block so re-running the migration is safe.
- This fixes the coach dashboard bug where an event's type (Practice / Game / Event /
  Tournament) reset back to "Practice" after the page reloads — the value was never
  persisted to the database, only held in browser memory.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'team_schedules'
      AND column_name = 'event_type'
  ) THEN
    ALTER TABLE team_schedules ADD COLUMN event_type text;
  END IF;
END $$;