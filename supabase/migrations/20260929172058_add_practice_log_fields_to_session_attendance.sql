/*
# Add practice-log fields to session_attendance

1. Changes
- Adds `team_id` (text) — which team this practice/attendance entry belongs to.
- Adds `session_date` (date) — the date of the session.
- Adds `session_time` (time) — the time the session/attendance was recorded.
- Makes `schedule_id` nullable so a practice-log entry can be recorded for a
  date without being attached to a pre-created schedule row.
- Index on (team_id, session_date) for fast per-team-per-date roster lookups.

2. Notes
- Existing rows keep their data; the new columns are nullable.
- `recorded_by` continues to hold the coach who marked attendance.
*/

ALTER TABLE session_attendance
  ADD COLUMN IF NOT EXISTS team_id text,
  ADD COLUMN IF NOT EXISTS session_date date,
  ADD COLUMN IF NOT EXISTS session_time time;

ALTER TABLE session_attendance ALTER COLUMN schedule_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_attendance_team_date
  ON session_attendance(team_id, session_date);
