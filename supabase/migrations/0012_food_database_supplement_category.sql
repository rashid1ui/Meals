-- ==============================================================================
-- Migration: food_database supplement category
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- Creatine/other supplement rows (app/onboarding/actions.ts) could never be
-- saved: food_database's category CHECK constraint only allowed
-- protein/dairy/carbohydrate/fruit/fat, but the app inserted category='other'
-- for non-whey supplements, which violates that constraint (Postgres 23514)
-- on every single such insert - silently, since the previous code only
-- special-cased the 23505 unique-violation race and otherwise fell through
-- to a null food id with no surfaced error.
--
-- Fix: widen the constraint to also allow 'supplement', and reclassify it as
-- the category ALL system-generated supplement rows use going forward
-- (whey included - previously category='protein', which also caused it to
-- leak into the normal protein-source food picker; see the is_active
-- backfill below and app/onboarding/page.tsx's protein_type filter).
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - Existing categories are untouched; this only ADDS an allowed value.
-- - The two existing supplement rows identified below (confirmed via a
--   direct read of food_database, not a heuristic) were both created by the
--   pre-fix onboarding flow (display_unit='serving', protein_type=
--   'supplement', category='protein') - they are reclassified to
--   category='supplement' and deactivated (is_active=false) so they stop
--   appearing in the general food picker, matching the new convention.
--   Nothing else in food_database matches protein_type='supplement' today,
--   so this backfill is exact, not a guess.
-- ==============================================================================

ALTER TABLE public.food_database DROP CONSTRAINT IF EXISTS food_database_category_valid;
ALTER TABLE public.food_database
  ADD CONSTRAINT food_database_category_valid
  CHECK (category = ANY (ARRAY['protein', 'dairy', 'carbohydrate', 'fruit', 'fat', 'supplement']));

UPDATE public.food_database
SET category = 'supplement', is_active = false
WHERE id IN ('17d581f5-204d-4574-80be-683804763b77', '971c9825-3475-4ba5-bc1d-86146c35116b');
