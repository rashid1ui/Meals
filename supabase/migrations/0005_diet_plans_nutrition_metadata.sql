-- ==============================================================================
-- Migration: diet_plans nutrition target metadata
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- `diet_plans` already stores the four numbers that matter operationally
-- (calories_target/protein_target/carbs_target/fat_target) - that's the
-- existing "single source of truth" the meal generator and dashboard read.
-- This migration does NOT duplicate that. It adds the surrounding
-- provenance the Nutrition Engine (lib/nutrition/engine.ts) computes
-- alongside those four numbers, so the onboarding "why these numbers"
-- explanation panel (and any future recalibration pass) has something to
-- read back, instead of the app re-deriving/guessing it after the fact.
--
-- WHAT THIS MIGRATION ADDS
--
-- Eight new columns on `diet_plans`, mirroring lib/nutrition/engine.ts's
-- NutritionTarget object exactly:
--   goal, estimated_maintenance_calories, calorie_adjustment_percent,
--   protein_g_per_kg, fat_g_per_kg, target_weekly_rate_percent,
--   calculation_version, targets_source ('recommended' | 'custom')
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - Every column is NULLABLE with no default. The 4 existing diet_plans
--   rows (verified via the Supabase MCP) keep their existing
--   calories_target/protein_target/carbs_target/fat_target completely
--   untouched and simply read back NULL for all eight new columns - they
--   are legacy/manually-entered plans with no engine-computed provenance,
--   which is an accurate (not lossy) representation.
-- - app/onboarding/actions.ts's existing insert into diet_plans is
--   unchanged for a "skip the calculator" submission - the new columns are
--   only ever written when the onboarding form actually ran the engine.
-- - No existing read path breaks: app/dashboard/page.tsx's
--   `.select('*')` on diet_plans continues to work, the new columns just
--   ride along.
-- ==============================================================================

ALTER TABLE public.diet_plans
  ADD COLUMN IF NOT EXISTS goal text,
  ADD COLUMN IF NOT EXISTS estimated_maintenance_calories integer,
  ADD COLUMN IF NOT EXISTS calorie_adjustment_percent numeric,
  ADD COLUMN IF NOT EXISTS protein_g_per_kg numeric,
  ADD COLUMN IF NOT EXISTS fat_g_per_kg numeric,
  ADD COLUMN IF NOT EXISTS target_weekly_rate_percent numeric,
  ADD COLUMN IF NOT EXISTS calculation_version text,
  ADD COLUMN IF NOT EXISTS targets_source text;

ALTER TABLE public.diet_plans
  ADD CONSTRAINT diet_plans_goal_check
    CHECK (goal IS NULL OR goal IN ('cut', 'recomp', 'lean_bulk', 'maintain')),
  ADD CONSTRAINT diet_plans_targets_source_check
    CHECK (targets_source IS NULL OR targets_source IN ('recommended', 'custom'));

-- ==============================================================================
-- Verification queries (read-only, safe to run after applying)
-- ==============================================================================

-- 1. Confirm the new columns exist
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'diet_plans' AND column_name IN
--   ('goal','estimated_maintenance_calories','calorie_adjustment_percent',
--    'protein_g_per_kg','fat_g_per_kg','target_weekly_rate_percent',
--    'calculation_version','targets_source');

-- 2. Confirm every existing row's original four targets are untouched
-- SELECT id, calories_target, protein_target, carbs_target, fat_target, goal FROM diet_plans;
