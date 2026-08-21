-- ==============================================================================
-- Migration: food_database display units (quantity/unit system)
-- ==============================================================================
-- AUDIT SUMMARY (performed before writing this migration)
--
-- - food_database.serving_size/serving_unit are the CANONICAL nutrition
--   basis every row's calories/protein/carbs/fat are defined per (100g or
--   100ml). serving_unit is CHECK-constrained to ('grams','ml') only.
-- - lib/nutrition/calculator.ts's calculateFoodMacros() computes
--   `quantity / serving_size` as the scaling multiplier - it has always
--   assumed the `quantity` it receives is already in the SAME unit as
--   serving_size (i.e. canonical grams/ml). lib/nutrition/solver.ts's
--   densities are `food.calories / food.serving_size` - same assumption.
--   Both files are UNTOUCHED by this migration and by the accompanying code
--   change - they still only ever receive canonical grams.
-- - Contrary to the assumption that some foods "already" use piece/slice
--   units: every one of the 38 seeded food_database rows (checked directly)
--   uses serving_size=100, serving_unit='grams' - a pure per-100g USDA
--   convention with NO existing piece/slice representation anywhere.
-- - food_database had no INSERT policy at all (SELECT-only, is_active=true,
--   for the `authenticated` role) - it is a shared, admin-seeded catalog
--   with zero existing write path in the app (confirmed: every reference to
--   food_database in app/ and lib/ is a read).
--
-- WHAT THIS MIGRATION ADDS
--
-- Two new columns, orthogonal to the existing canonical basis:
--   display_unit            - the unit the user enters/sees (g, kg, ml,
--                              piece, slice, serving)
--   grams_per_display_unit   - how many canonical grams one display unit
--                              equals (e.g. 1 piece = 50g for a whole egg)
--
-- The conversion boundary (displayQuantity x grams_per_display_unit =
-- canonicalGrams) lives entirely in application code
-- (lib/nutrition/units.ts) - this migration only stores the per-food
-- configuration, it does not change how nutrition is calculated.
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - Both columns are NOT NULL with defaults (display_unit='g',
--   grams_per_display_unit=1) applied to every existing row automatically,
--   so every existing food keeps `displayQuantity x 1 = canonicalGrams`,
--   i.e. display quantity IS the canonical gram quantity - identical to
--   today's behavior, zero regression risk.
-- - Three existing rows get curated real-world reference weights (standard
--   USDA reference weights, matching this table's own USDA-sourced
--   convention in seed.sql, not invented): Whole Egg (piece, 50g), Egg
--   Whites (piece, 33g), Banana (piece, 118g). This only changes how their
--   quantity is entered/displayed - their calories/protein/carbs/fat and
--   serving_size/serving_unit are completely unchanged.
-- - "Bread"/"Tortilla" from the feature request's examples do not exist in
--   the current 38-row catalog - not fabricated here.
-- - The new INSERT policy lets any authenticated user add a new shared
--   catalog food (explicitly approved) - it does not touch the existing
--   SELECT policy or any other table's RLS.
-- ==============================================================================

ALTER TABLE public.food_database
  ADD COLUMN IF NOT EXISTS display_unit text NOT NULL DEFAULT 'g',
  ADD COLUMN IF NOT EXISTS grams_per_display_unit numeric NOT NULL DEFAULT 1;

ALTER TABLE public.food_database
  ADD CONSTRAINT food_database_display_unit_check
    CHECK (display_unit = ANY (ARRAY['g','kg','ml','piece','slice','serving'])),
  ADD CONSTRAINT food_database_grams_per_display_unit_check
    CHECK (grams_per_display_unit > 0 AND grams_per_display_unit <= 2000);

UPDATE public.food_database SET display_unit = 'piece', grams_per_display_unit = 50 WHERE name = 'Whole Egg, Raw';
UPDATE public.food_database SET display_unit = 'piece', grams_per_display_unit = 33 WHERE name = 'Egg Whites, Raw';
UPDATE public.food_database SET display_unit = 'piece', grams_per_display_unit = 118 WHERE name = 'Banana, Raw';

CREATE POLICY "Authenticated users can add foods" ON public.food_database
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ==============================================================================
-- Verification queries (read-only, safe to run after applying)
-- ==============================================================================

-- 1. Confirm every existing row still resolves to identity conversion unless curated above
-- SELECT name, display_unit, grams_per_display_unit FROM food_database
-- WHERE display_unit <> 'g' OR grams_per_display_unit <> 1;

-- 2. Confirm the CHECK constraints
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'food_database'::regclass AND contype = 'c';

-- 3. Confirm the new INSERT policy
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'food_database';
