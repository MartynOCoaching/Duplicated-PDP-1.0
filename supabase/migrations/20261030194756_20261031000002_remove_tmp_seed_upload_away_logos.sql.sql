/*
# Remove temporary seed-upload policy for away-logos bucket

1. Purpose
- Deletes the temporary anonymous INSERT policy used only to seed the
  Lethbridge FC logo. The bucket returns to its intended security posture:
  public read, authenticated (coach) upload/delete only.

2. Security
- Drops "Temporary seed upload away logos" from storage.objects.
*/
DROP POLICY IF EXISTS "Temporary seed upload away logos" ON storage.objects;
