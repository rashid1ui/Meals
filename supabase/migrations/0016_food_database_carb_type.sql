-- ==============================================================================
-- Migration: food_database carb_type (simple vs. complex carbohydrate)
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- Adds a per-food carbohydrate classification ('simple' | 'complex'), mirroring
-- 0007_training_nutrition.sql's protein_type pattern exactly. Used by the
-- manual meal builder's "Carb Education" guidance card
-- (lib/nutrition/carbType.ts) to split a day's total carbs into simple/complex
-- buckets. Existing catalog rows are backfilled explicitly below; rows with no
-- match (custom/AI-added foods) stay NULL and are classified at read-time by
-- lib/nutrition/carbType.ts's heuristic fallback, so nothing ever goes
-- unclassified in the UI.
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - `food_database.carb_type` is NULLABLE with no default - existing custom
--   foods are simply unclassified until read-time fallback applies.
-- - No existing query is affected: everything here rides along on the
--   existing `.select('*')` calls throughout the app.
-- ==============================================================================

ALTER TABLE public.food_database
  ADD COLUMN IF NOT EXISTS carb_type text;

ALTER TABLE public.food_database
  ADD CONSTRAINT food_database_carb_type_check
    CHECK (carb_type IS NULL OR carb_type IN ('simple', 'complex'));

-- Backfill the seeded USDA catalog (supabase/seed.sql), matched by exact name,
-- same identity basis as 0007's protein_type backfill.
UPDATE public.food_database SET carb_type = 'simple' WHERE name IN (
  'Banana, Raw',
  'Apple, Raw',
  'Strawberries, Raw',
  'Blueberries, Raw',
  'Orange, Raw'
);

UPDATE public.food_database SET carb_type = 'complex' WHERE name IN (
  'White Rice, Dry',
  'Brown Rice, Dry',
  'Rolled Oats, Dry',
  'Sweet Potato, Raw',
  'White Potato, Raw',
  'Quinoa, Dry',
  'Whole Wheat Pasta, Dry',
  'Lentils, Dry',
  'Black Beans, Dry',
  'Chickpeas, Dry'
);

-- ==============================================================================
-- Verification queries (read-only, safe to run after applying)
-- ==============================================================================

-- SELECT name, category, carb_type FROM food_database WHERE category IN ('carbohydrate', 'fruit') ORDER BY name;
