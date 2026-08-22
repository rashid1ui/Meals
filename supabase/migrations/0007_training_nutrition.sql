-- ==============================================================================
-- Migration: Training Nutrition (onboarding setup + protein-type tracking)
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- Adds the schema needed for the "Training Nutrition Setup" onboarding
-- section and the animal/plant/supplement protein breakdown:
--
--  1. `profiles` gains training-time and supplement-usage fields, collected
--     once during onboarding (mirrors the existing biometrics columns added
--     in 0004_profile_biometrics.sql - same NULL-means-not-collected
--     convention).
--  2. `food_database` gains `protein_type`, a per-food classification
--     ('animal' | 'plant' | 'supplement') used to split logged protein into
--     the three buckets on the dashboard. Existing catalog rows are
--     backfilled explicitly below; rows with no match (custom/AI-added
--     foods) stay NULL and are classified at read-time by
--     lib/nutrition/proteinType.ts's heuristic fallback, so nothing ever
--     goes unclassified in the UI.
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - Every new `profiles` column is NULLABLE (uses_supplements excepted,
--   which defaults to false - "no" is the correct default for a toggle no
--   existing user has ever set). Existing rows read back NULL/false, never
--   a fabricated value.
-- - `food_database.protein_type` is NULLABLE with no default - existing
--   custom foods are simply unclassified until read-time fallback applies.
-- - No existing query is affected: everything here rides along on the
--   existing `.select('*')` calls throughout the app.
-- ==============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS training_time text,
  ADD COLUMN IF NOT EXISTS training_time_custom time,
  ADD COLUMN IF NOT EXISTS uses_supplements boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supplement_type text,
  ADD COLUMN IF NOT EXISTS protein_brand text,
  ADD COLUMN IF NOT EXISTS protein_serving_label text,
  ADD COLUMN IF NOT EXISTS protein_per_serving_g numeric;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_training_time_check
    CHECK (training_time IS NULL OR training_time IN ('morning', 'afternoon', 'evening', 'custom')),
  ADD CONSTRAINT profiles_supplement_type_check
    CHECK (supplement_type IS NULL OR supplement_type IN ('whey', 'creatine', 'other')),
  ADD CONSTRAINT profiles_protein_per_serving_g_check
    CHECK (protein_per_serving_g IS NULL OR (protein_per_serving_g >= 0 AND protein_per_serving_g <= 200));

ALTER TABLE public.food_database
  ADD COLUMN IF NOT EXISTS protein_type text;

ALTER TABLE public.food_database
  ADD CONSTRAINT food_database_protein_type_check
    CHECK (protein_type IS NULL OR protein_type IN ('animal', 'plant', 'supplement'));

-- Backfill the seeded USDA catalog (supabase/seed.sql). Matched by exact
-- name, the same identity basis the rest of the app already relies on for
-- this table (e.g. app/dashboard/page.tsx's foodDatabaseByName). Tofu is
-- deliberately classified 'plant' despite living in the 'protein' category -
-- protein_type is a nutrition-source classification, independent of the
-- existing display category.
UPDATE public.food_database SET protein_type = 'animal' WHERE name IN (
  'Chicken Breast, Raw',
  'Lean Ground Beef 93/7, Raw',
  'Turkey Breast, Raw',
  'Atlantic Salmon, Raw',
  'Whole Egg, Raw',
  'Egg Whites, Raw',
  'Tilapia, Raw',
  'Tuna, Light, Canned in Water',
  'Bison, Ground, Raw',
  'Mozzarella, Part Skim',
  'Nonfat Greek Yogurt',
  'Whole Milk',
  '2% Milk',
  'Cottage Cheese, Lowfat 2%',
  'Cheddar Cheese',
  'Butter, Unsalted'
);

UPDATE public.food_database SET protein_type = 'plant' WHERE name IN (
  'Tofu, Firm, Raw',
  'White Rice, Dry',
  'Brown Rice, Dry',
  'Rolled Oats, Dry',
  'Sweet Potato, Raw',
  'White Potato, Raw',
  'Quinoa, Dry',
  'Whole Wheat Pasta, Dry',
  'Lentils, Dry',
  'Black Beans, Dry',
  'Chickpeas, Dry',
  'Banana, Raw',
  'Apple, Raw',
  'Strawberries, Raw',
  'Blueberries, Raw',
  'Orange, Raw',
  'Avocado, Raw',
  'Almonds, Raw',
  'Peanut Butter, Smooth',
  'Olive Oil, Extra Virgin',
  'Walnuts, Raw'
);

-- ==============================================================================
-- Verification queries (read-only, safe to run after applying)
-- ==============================================================================

-- 1. Confirm the new columns exist
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'profiles' AND column_name LIKE 'training_time%'
--    OR table_name = 'profiles' AND column_name LIKE '%supplement%' OR column_name LIKE 'protein_%';

-- 2. Confirm the seed catalog backfill landed (expected: 0 unclassified rows
--    among the original 37 seeded foods; newer custom foods may still be NULL)
-- SELECT name, category, protein_type FROM food_database WHERE protein_type IS NULL;
