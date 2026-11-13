/*
# TEMPORARY: allow one-time seed upload of Lethbridge FC logo

1. Purpose
- Briefly permits an anonymous INSERT into the `away-logos` bucket so the
  initial Lethbridge FC crest can be uploaded by the build tooling.
- This policy is removed by the follow-up migration immediately after the
  upload completes. Coaches (authenticated) remain able to upload logos.

2. Security
- Adds a temporary INSERT policy on storage.objects for bucket 'away-logos'.
*/
DROP POLICY IF EXISTS "Temporary seed upload away logos" ON storage.objects;
CREATE POLICY "Temporary seed upload away logos"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'away-logos');
