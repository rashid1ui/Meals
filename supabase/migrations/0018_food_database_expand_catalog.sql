-- ==============================================================================
-- Migration: food_database expand catalog (vegetables + missing staples +
-- surface existing serving-based supplements)
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- 1. lib/types/index.ts's FoodCategory type already includes 'vegetable', but
--    food_database's category CHECK constraint never did - vegetables could
--    never be inserted. Widening the constraint (additive only, same pattern
--    as 0012_food_database_supplement_category.sql) unblocks the new
--    vegetable rows below and the app's own vegetable category UI.
-- 2. The catalog was missing common staples users expect when building a gym
--    meal plan (chicken thigh, bread, tortilla, dates, peanuts, cashews, and
--    a full vegetable list) - added below with real per-100g values, none of
--    which duplicate an existing row (checked via SELECT first).
-- 3. 'Limitless Whey Protein (25g protein/serving)' and 'optimum nutrition
--    Creatine (5g/serving)' are real, correctly-modeled serving-based rows
--    (grams_per_display_unit=30/5, display_unit='serving') created by the
--    onboarding supplement flow (app/onboarding/actions.ts) - but that flow
--    always inserts with is_active=false, since it's designed for its own
--    dedicated AI-diet-generation append path, not general browsing. That
--    left the user's own real whey/creatine invisible to the manual food
--    picker (FoodPickerModal's Supplements tab), which only ever shows
--    is_active=true rows. Activating these two specific, already-correct
--    rows (verified by id, not a heuristic) surfaces them there. The exact
--    duplicate 'Limitless Whey Protein' (no serving suffix, id
--    971c9825-3475-4ba5-bc1d-86146c35116b) and the test rows
--    ('TEST BRAND Whey Protein', 'ggg', 'Pork Tenderloin, Raw') are left
--    untouched (still inactive) - not part of this fix.
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - Category constraint change only ADDS an allowed value; no existing rows
--   are touched by it.
-- - New rows use the existing serving_size=100/serving_unit='grams' /
--   display_unit='g' convention exactly like every other weight-based food -
--   zero change to calculateFoodMacros or any existing query.
-- - The two is_active flips only affect rows that were previously
--   completely invisible to every query in the app (all reads filter
--   is_active=true); no existing behavior regresses.
-- ==============================================================================

ALTER TABLE public.food_database DROP CONSTRAINT IF EXISTS food_database_category_valid;
ALTER TABLE public.food_database
  ADD CONSTRAINT food_database_category_valid
  CHECK (category = ANY (ARRAY['protein', 'dairy', 'carbohydrate', 'fruit', 'vegetable', 'fat', 'supplement']));

-- Surface the user's real, already-correctly-modeled supplement rows.
UPDATE public.food_database
SET is_active = true
WHERE id IN ('e9b0926b-bce7-4c51-8e4a-65dab6d35732', '5471cef3-0254-43d9-ae25-53495aa56742');

-- Missing protein staple.
INSERT INTO public.food_database (name, category, serving_size, serving_unit, calories, protein, carbs, fat, display_unit, grams_per_display_unit, protein_type, is_active)
VALUES ('Chicken Thigh, Raw', 'protein', 100, 'grams', 119, 18.6, 0, 4.3, 'g', 1, 'animal', true)
ON CONFLICT (name) DO NOTHING;

-- Missing carb staples.
INSERT INTO public.food_database (name, category, serving_size, serving_unit, calories, protein, carbs, fat, display_unit, grams_per_display_unit, protein_type, carb_type, is_active)
VALUES
  ('White Bread', 'carbohydrate', 100, 'grams', 265, 9, 49, 3.2, 'g', 1, 'plant', 'complex', true),
  ('Whole Wheat Bread', 'carbohydrate', 100, 'grams', 247, 13, 41, 3.4, 'g', 1, 'plant', 'complex', true),
  ('Flour Tortilla / Wrap', 'carbohydrate', 100, 'grams', 312, 8.2, 51, 7.6, 'g', 1, 'plant', 'complex', true),
  ('Dates, Dried', 'carbohydrate', 100, 'grams', 282, 2.5, 75, 0.4, 'g', 1, 'plant', 'simple', true)
ON CONFLICT (name) DO NOTHING;

-- Missing fat staples.
INSERT INTO public.food_database (name, category, serving_size, serving_unit, calories, protein, carbs, fat, display_unit, grams_per_display_unit, protein_type, is_active)
VALUES
  ('Peanuts, Raw', 'fat', 100, 'grams', 567, 25.8, 16.1, 49.2, 'g', 1, 'plant', true),
  ('Cashews, Raw', 'fat', 100, 'grams', 553, 18.2, 30.2, 43.9, 'g', 1, 'plant', true)
ON CONFLICT (name) DO NOTHING;

-- New vegetable category - none existed in the catalog before this.
INSERT INTO public.food_database (name, category, serving_size, serving_unit, calories, protein, carbs, fat, display_unit, grams_per_display_unit, protein_type, is_active)
VALUES
  ('Cucumber, Raw', 'vegetable', 100, 'grams', 15, 0.7, 3.6, 0.1, 'g', 1, 'plant', true),
  ('Tomato, Raw', 'vegetable', 100, 'grams', 18, 0.9, 3.9, 0.2, 'g', 1, 'plant', true),
  ('Lettuce, Raw', 'vegetable', 100, 'grams', 17, 1.2, 3.3, 0.3, 'g', 1, 'plant', true),
  ('Spinach, Raw', 'vegetable', 100, 'grams', 23, 2.9, 3.6, 0.4, 'g', 1, 'plant', true),
  ('Broccoli, Raw', 'vegetable', 100, 'grams', 34, 2.8, 6.6, 0.4, 'g', 1, 'plant', true),
  ('Carrots, Raw', 'vegetable', 100, 'grams', 41, 0.9, 9.6, 0.2, 'g', 1, 'plant', true),
  ('Bell Pepper, Raw', 'vegetable', 100, 'grams', 31, 1, 6, 0.3, 'g', 1, 'plant', true),
  ('Mixed Vegetables, Frozen', 'vegetable', 100, 'grams', 65, 2.9, 13, 0.3, 'g', 1, 'plant', true)
ON CONFLICT (name) DO NOTHING;
