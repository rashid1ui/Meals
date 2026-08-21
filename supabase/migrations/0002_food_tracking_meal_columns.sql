-- ==============================================================================
-- Migration: food_tracking meal grouping columns
-- ==============================================================================
-- CONTEXT
--
-- public.daily_tracking and public.food_tracking already exist in the live
-- database (created outside this repo's migration history - there was no
-- local .sql file for them prior to this one). They already have correct RLS
-- (`auth.uid() = user_id`, ALL commands) and the exact unique indexes needed
-- for idempotent upserts:
--   daily_tracking_user_id_tracking_date_key   UNIQUE (user_id, tracking_date)
--   food_tracking_user_id_tracking_date_food_id_key
--                                               UNIQUE (user_id, tracking_date, food_id)
--
-- WHY THIS MIGRATION IS REQUIRED
--
-- food_tracking.food_id is `ON DELETE SET NULL` against foods(id, user_id) -
-- correct, since app/dashboard/actions.ts's saveDietPlan fully deletes and
-- re-inserts meals/foods on every edit-save (even a same-day quantity tweak).
-- That means food_id (and any meal grouping derived purely from a live join
-- to meals/foods) does NOT survive a plan edit. food_name/protein/fat/carbs/
-- calories/quantity are already denormalized onto food_tracking for exactly
-- this reason - food_id going NULL doesn't lose the nutrition record.
--
-- There was no equivalent for *meal* grouping: no meal_id, no meal_name.
-- Without it, weekly/monthly "meal adherence %" for a day whose plan was
-- later edited would have no way to know which foods belonged to the same
-- meal. This migration mirrors the exact same denormalize + ON DELETE SET
-- NULL pattern already used for food_id/food_name, applied to meal_id/
-- meal_name, so meal-level adherence stays computable across future plan
-- edits without needing meals/foods rows to still exist.
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - Both new columns are nullable; no backfill needed (0 rows existed in
--   food_tracking at the time this was applied).
-- - meal_id references meals(id, user_id) - the same composite already used
--   by foods_meal_id_user_id_fkey - ON DELETE SET NULL, so deleting a meal
--   during a normal plan edit-save nulls the reference instead of blocking
--   the delete or cascading it away. meal_name is the durable, denormalized
--   label that survives regardless.
-- - Touches only food_tracking. No other table is modified.
-- ==============================================================================

ALTER TABLE public.food_tracking
  ADD COLUMN IF NOT EXISTS meal_id uuid,
  ADD COLUMN IF NOT EXISTS meal_name text;

ALTER TABLE public.food_tracking
  ADD CONSTRAINT food_tracking_meal_id_user_id_fkey
  FOREIGN KEY (meal_id, user_id) REFERENCES public.meals(id, user_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_food_tracking_meal_id
  ON public.food_tracking (meal_id);

-- ==============================================================================
-- Verification queries (read-only, safe to run after applying)
-- ==============================================================================

-- 1. Confirm the new columns exist
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'food_tracking' AND column_name IN ('meal_id', 'meal_name');

-- 2. Confirm the FK's delete rule is SET NULL, not RESTRICT/CASCADE
-- SELECT conname, confdeltype FROM pg_constraint
-- WHERE conname = 'food_tracking_meal_id_user_id_fkey';
