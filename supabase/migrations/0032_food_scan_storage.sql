-- ==============================================================================
-- Migration: AI Outside-Plan Food Scanner - private Storage bucket
-- ==============================================================================
-- Adds the food-scan-photos bucket per the approved design (Question 3):
-- private, per-user-folder RLS, never a public URL. This is the FIRST use of
-- Supabase Storage anywhere in this project (verified: no storage.buckets /
-- storage.objects usage exists in any prior migration) - every existing
-- "image" in this app (food_database/meals/user_supplements image_url) is an
-- external CDN URL (Pexels/Open Food Facts), never a file this app stores
-- itself.
--
-- Object path convention: {user_id}/{uuid}.jpg - always a UUID filename with
-- a fixed .jpg extension, since every upload is server-side re-encoded to
-- JPEG (lib/outsidePlan/imageProcessing.ts) regardless of the original
-- format. (storage.foldername(name))[1] is therefore always the owning
-- user's auth.uid(), which is what every policy below checks.
--
-- file_size_limit / allowed_mime_types are set at the bucket level as a
-- defense-in-depth backstop enforced by Supabase's own Storage API - the
-- authoritative validation is still the application-level magic-byte sniff
-- in lib/outsidePlan/imageValidation.ts, which never trusts a client-declared
-- Content-Type or file extension.
-- ==============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'food-scan-photos',
  'food-scan-photos',
  false,
  8388608, -- 8 MiB pre-compression ceiling (Question 3)
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- A user may only insert an object whose folder prefix is their own
-- auth.uid() - the server-side upload path (lib/outsidePlan/storage.ts)
-- always uploads through the requesting user's own authenticated client, so
-- this is the actual enforcement boundary, not just a backstop.
create policy "Users can upload own food scan photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'food-scan-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Read access (used to build short-lived signed URLs server-side for the
-- review screen) is scoped the same way.
create policy "Users can read own food scan photos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'food-scan-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Delete access covers immediate deletion on cancel and the 90-day
-- retention sweep, both of which act as the owning user's own client (the
-- retention sweep alternatively runs via the service-role client, which
-- bypasses RLS entirely, exactly like the existing image-resolution cron -
-- see lib/outsidePlan/storage.ts's sweepExpiredFoodScanImages).
create policy "Users can delete own food scan photos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'food-scan-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- No UPDATE policy: a photo is never edited in place. "Retake" deletes the
-- pending object and uploads a new one under a fresh UUID, so there is no
-- legitimate use of storage.objects UPDATE for this bucket.
