/*
# Create away-logos storage bucket

1. Purpose
- Stores opponent (away team) crest images for the Home vs. Away match poster
  creator on the formations page.
- The poster's opponent drop-down lists the files in this bucket, so every
  new logo uploaded here automatically becomes a selectable opponent.

2. New storage bucket
- `away-logos` (public bucket)
  - Public read: anyone can view/download logo images (they are displayed
    on posters and previews).
  - Authenticated upload: signed-in coaches can add logos (mirrors the
    profile-images pattern, up to the same 2 MB default limit).
  - Authenticated delete: signed-in users may remove logos they manage.

3. Security
- Bucket-level policies only; no database table or column changes.
- SELECT policy: public (true) — logos are intentionally shared images.
- INSERT policy: authenticated only — prevents anonymous uploads.
- DELETE policy: authenticated only.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'away-logos',
  'away-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp'];

DROP POLICY IF EXISTS "Public read away logos" ON storage.objects;
CREATE POLICY "Public read away logos"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'away-logos');

DROP POLICY IF EXISTS "Authenticated upload away logos" ON storage.objects;
CREATE POLICY "Authenticated upload away logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'away-logos');

DROP POLICY IF EXISTS "Authenticated delete away logos" ON storage.objects;
CREATE POLICY "Authenticated delete away logos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'away-logos');
