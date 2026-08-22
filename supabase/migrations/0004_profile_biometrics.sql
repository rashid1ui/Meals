-- ==============================================================================
-- Migration: profile biometrics for the Nutrition Engine
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- The Nutrition Engine (lib/nutrition/engine.ts) turns a user's sex, age,
-- weight, height, activity level, training days, and goal into a starting
-- calorie/macro target (Mifflin-St Jeor BMR -> TDEE -> goal-adjusted
-- target). None of these fields exist anywhere in the schema today -
-- `profiles` only has id/full_name/email/avatar_url/created_at/updated_at
-- (verified directly against the live project via the Supabase MCP before
-- writing this file, not assumed from local migration history).
--
-- WHAT THIS MIGRATION ADDS
--
-- Nine new columns on `profiles`, matching Part 1 of the nutrition-engine
-- spec exactly:
--   Required by the calculator:  sex, age, height_cm, weight_kg,
--                                 activity_level, training_days_per_week
--   Optional (never required):   body_fat_percent, average_daily_steps,
--                                 current_calorie_intake
--
-- `goal` deliberately does NOT live here - it's per-plan, not per-profile
-- (a user can change goal without erasing their biometrics), so it's added
-- to `diet_plans` instead - see 0005_diet_plans_nutrition_metadata.sql.
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - Every column is NULLABLE with no default. The 4 existing profile rows
--   (verified row count via the Supabase MCP) simply read back NULL for all
--   nine - "not yet collected", not a false zero/default value.
-- - No existing query is affected: app/dashboard/page.tsx and others already
--   do `.select('*')` on profiles, so the new NULL columns ride along
--   harmlessly. No code currently reads these columns before this feature's
--   accompanying app-code changes ship.
-- - Existing users who skip the new onboarding "About You" step, or who
--   onboarded before this feature existed, keep working exactly as today -
--   the manual calorie/macro entry path never reads these columns.
-- - CHECK constraints only bound obviously-invalid input (e.g. negative
--   age); they do not enforce that a value is present.
-- ==============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sex text,
  ADD COLUMN IF NOT EXISTS age smallint,
  ADD COLUMN IF NOT EXISTS height_cm numeric,
  ADD COLUMN IF NOT EXISTS weight_kg numeric,
  ADD COLUMN IF NOT EXISTS activity_level text,
  ADD COLUMN IF NOT EXISTS training_days_per_week smallint,
  ADD COLUMN IF NOT EXISTS body_fat_percent numeric,
  ADD COLUMN IF NOT EXISTS average_daily_steps integer,
  ADD COLUMN IF NOT EXISTS current_calorie_intake integer;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_sex_check
    CHECK (sex IS NULL OR sex IN ('male', 'female')),
  ADD CONSTRAINT profiles_age_check
    CHECK (age IS NULL OR (age > 0 AND age < 120)),
  ADD CONSTRAINT profiles_height_cm_check
    CHECK (height_cm IS NULL OR (height_cm > 0 AND height_cm < 300)),
  ADD CONSTRAINT profiles_weight_kg_check
    CHECK (weight_kg IS NULL OR (weight_kg > 0 AND weight_kg < 500)),
  ADD CONSTRAINT profiles_activity_level_check
    CHECK (activity_level IS NULL OR activity_level IN
      ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extremely_active')),
  ADD CONSTRAINT profiles_training_days_per_week_check
    CHECK (training_days_per_week IS NULL OR (training_days_per_week >= 0 AND training_days_per_week <= 7)),
  ADD CONSTRAINT profiles_body_fat_percent_check
    CHECK (body_fat_percent IS NULL OR (body_fat_percent >= 0 AND body_fat_percent <= 100)),
  ADD CONSTRAINT profiles_average_daily_steps_check
    CHECK (average_daily_steps IS NULL OR average_daily_steps >= 0),
  ADD CONSTRAINT profiles_current_calorie_intake_check
    CHECK (current_calorie_intake IS NULL OR current_calorie_intake >= 0);

-- ==============================================================================
-- Verification queries (read-only, safe to run after applying)
-- ==============================================================================

-- 1. Confirm the new columns exist
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'profiles' AND column_name IN
--   ('sex','age','height_cm','weight_kg','activity_level','training_days_per_week',
--    'body_fat_percent','average_daily_steps','current_calorie_intake');

-- 2. Confirm every existing row is untouched (expected: all nine new columns NULL)
-- SELECT id, sex, age, height_cm, weight_kg, activity_level FROM profiles;
