-- Migration: food_database image metadata (real food photography)
-- ---------------------------------------------------------------------------
-- Adds real food photography metadata to the shared catalog. Purely additive
-- and presentation-only: nutrition, servings, units, names, categories, RLS
-- and every existing constraint are untouched. All three columns are NULLABLE
-- with no default, so every existing row and every code path that inserts
-- without them keeps working unchanged; a row with no image_url simply
-- renders the existing deterministic emoji/tile fallback in the UI.
--
--   image_url         - a stable, already-resolved remote image URL (Pexels
--                       CDN). The app NEVER calls an image API at render
--                       time; scripts/assign-food-images.ts resolves and
--                       stores these ahead of time.
--   image_alt         - short alt text describing the photo, for the <img>.
--   image_attribution - jsonb: { source, photographer, photographer_url,
--                       source_url }. Kept so the provider credit can be
--                       shown in the UI. Never implies Gym Meals owns the
--                       photo.
--
-- Populate with:  PEXELS_API_KEY=... npx tsx scripts/assign-food-images.ts
-- ---------------------------------------------------------------------------

ALTER TABLE public.food_database
  ADD COLUMN IF NOT EXISTS image_url         text,
  ADD COLUMN IF NOT EXISTS image_alt         text,
  ADD COLUMN IF NOT EXISTS image_attribution jsonb;

-- Verify:
-- SELECT name, image_url FROM public.food_database WHERE image_url IS NOT NULL ORDER BY name;
