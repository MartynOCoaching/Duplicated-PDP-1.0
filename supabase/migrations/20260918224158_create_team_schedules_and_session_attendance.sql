/*
# Create team_schedules and session_attendance tables

1. New Tables

- `team_schedules`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `coach_id` (text, not null) — the user ID of the coach who created the schedule
  - `team_id` (text, not null) — the team this schedule entry is for
  - `session_date` (date, not null) — the date of the practice/session (yyyy-mm-dd)
  - `session_time` (time, not null) — the time of the session (HH:mm)
  - `notes` (text, nullable) — optional notes about the session
  - `created_at` (timestamptz, default now())

- `session_attendance`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `schedule_id` (uuid, not null, references team_schedules(id) on delete cascade) — which session this attendance record belongs to
  - `player_id` (text, not null) — the user ID of the player
  - `present` (boolean, not null, default false) — true if present, false if absent
  - `recorded_by` (text, nullable) — user ID of who recorded the attendance (usually the coach)
  - `created_at` (timestamptz, default now())
  - Unique constraint on (schedule_id, player_id) so each player has one attendance record per session

2. Security

- Enable RLS on both tables.
- Policies allow anon + authenticated to read and write (the app uses the anon key for all operations).
- All four CRUD policies per table (select, insert, update, delete).

3. Important Notes

- The app uses the anon Supabase key (no sign-in screen), so policies must include `anon` role.
- `team_schedules` is keyed by coach_id + team_id so a coach can set schedules for any team they manage.
- `session_attendance` is a join table that links a schedule entry to individual player attendance.
- The cascade delete on session_attendance.schedule_id ensures attendance is cleaned up when a schedule is deleted.
*/

CREATE TABLE IF NOT EXISTS team_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id text NOT NULL,
  team_id text NOT NULL,
  session_date date NOT NULL,
  session_time time NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_schedules_team_id ON team_schedules(team_id);
CREATE INDEX IF NOT EXISTS idx_team_schedules_coach_id ON team_schedules(coach_id);
CREATE INDEX IF NOT EXISTS idx_team_schedules_date ON team_schedules(session_date);

ALTER TABLE team_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_team_schedules" ON team_schedules;
CREATE POLICY "anon_select_team_schedules" ON team_schedules FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_team_schedules" ON team_schedules;
CREATE POLICY "anon_insert_team_schedules" ON team_schedules FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_team_schedules" ON team_schedules;
CREATE POLICY "anon_update_team_schedules" ON team_schedules FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_team_schedules" ON team_schedules;
CREATE POLICY "anon_delete_team_schedules" ON team_schedules FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS session_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES team_schedules(id) ON DELETE CASCADE,
  player_id text NOT NULL,
  present boolean NOT NULL DEFAULT false,
  recorded_by text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (schedule_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_session_attendance_schedule_id ON session_attendance(schedule_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_player_id ON session_attendance(player_id);

ALTER TABLE session_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_session_attendance" ON session_attendance;
CREATE POLICY "anon_select_session_attendance" ON session_attendance FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_session_attendance" ON session_attendance;
CREATE POLICY "anon_insert_session_attendance" ON session_attendance FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_session_attendance" ON session_attendance;
CREATE POLICY "anon_update_session_attendance" ON session_attendance FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_session_attendance" ON session_attendance;
CREATE POLICY "anon_delete_session_attendance" ON session_attendance FOR DELETE
  TO anon, authenticated USING (true);
