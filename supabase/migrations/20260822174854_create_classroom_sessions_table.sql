/*
# Create classroom_sessions table

## Purpose
Replaces the hard-coded mock educational modules with a database-backed table
so admins/coaches can manage classroom sessions (nutrition, strength &
conditioning, recovery, mental health, stretching & yoga, injury prevention)
without touching code.

## New Table: classroom_sessions
- id (uuid, primary key)
- category (text, not null) — one of: Nutrition, Strength & Conditioning,
  Recovery, Mental Health, Stretching & Yoga, Injury Prevention
- title (text, not null)
- description (text, nullable)
- image_url (text, nullable) — cover/thumbnail image
- video_url (text, nullable) — YouTube embed URL or video link
- created_at (timestamptz, default now())

## Security
- RLS enabled.
- SELECT: public to anon + authenticated (sessions are viewable by all logged-in users).
- INSERT / UPDATE / DELETE: authenticated only (any authenticated user can
  manage sessions — admins/coaches are the ones with accounts).

## Notes
1. This table intentionally has NO quiz or document-type columns. Quizzes and
   long-form articles are removed in favour of video + image + description.
2. The old educationalModules Firestore collection and INITIAL_MODULES mock
   data are being removed from the codebase in the same change.
*/

CREATE TABLE IF NOT EXISTS classroom_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  title text NOT NULL,
  description text,
  image_url text,
  video_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE classroom_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view classroom sessions" ON classroom_sessions;
CREATE POLICY "Anyone can view classroom sessions"
ON classroom_sessions FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated can insert classroom sessions" ON classroom_sessions;
CREATE POLICY "Authenticated can insert classroom sessions"
ON classroom_sessions FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update classroom sessions" ON classroom_sessions;
CREATE POLICY "Authenticated can update classroom sessions"
ON classroom_sessions FOR UPDATE
TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can delete classroom sessions" ON classroom_sessions;
CREATE POLICY "Authenticated can delete classroom sessions"
ON classroom_sessions FOR DELETE
TO authenticated
USING (true);
