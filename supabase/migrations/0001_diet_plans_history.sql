-- ==============================================================================
-- Migration: diet_plans plan history (is_active)
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- Every part of the application that answers "what is this user's diet plan"
-- (lib/supabase/middleware.ts, app/auth/callback/route.ts,
-- app/onboarding/actions.ts, app/dashboard/page.tsx, app/dashboard/actions.ts)
-- currently does `.eq('user_id', user.id).limit(1)` with no ordering and no
-- status column. That query is only unambiguous because the application has
-- always enforced "at most one diet_plans row per user" by DELETING the old
-- row the instant a new one is generated. There is no way to represent
-- "previous plans" on top of that model without either (a) making the
-- .limit(1) queries genuinely ambiguous once more than one row can exist, or
-- (b) adding a column that distinguishes the current plan from history. This
-- migration takes option (b), plus a database-level constraint so exactly one
-- active plan per user is guaranteed by Postgres, not just application code.
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - All three ALTER TABLE statements use "ADD COLUMN IF NOT EXISTS", so this
--   is safe to run whether or not created_at/updated_at already exist (they
--   likely do; this repo has no prior migrations to confirm that from).
-- - DEFAULT true on is_active means every existing row becomes active on
--   migrate. Since the application has only ever allowed one row per user
--   (via delete-on-replace), this is exactly today's real data shape - no
--   backfill script, no ambiguity, no data loss.
-- - The unique index only indexes rows where is_active = true, so it has zero
--   effect on existing data and only starts constraining future writes.
-- - This file is NOT applied by anything in this repo/session - there is no
--   live Supabase connection available in this environment (.env.local points
--   at a placeholder project). It is provided for deployment against the real
--   project via the Supabase CLI/dashboard.
-- ==============================================================================

ALTER TABLE diet_plans
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE diet_plans
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE diet_plans
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Guarantees at most one active plan per user at the database level, not just
-- in application code. Application code still inserts the new plan as
-- is_active=false, builds it out fully, and only flips is_active on both rows
-- (old -> false, new -> true) once persistence has fully succeeded - see
-- app/onboarding/actions.ts.
CREATE UNIQUE INDEX IF NOT EXISTS diet_plans_one_active_per_user
  ON diet_plans (user_id)
  WHERE is_active = true;

-- Speeds up the new "Previous Plans" list query (user_id + is_active=false,
-- ordered by created_at).
CREATE INDEX IF NOT EXISTS diet_plans_user_history
  ON diet_plans (user_id, created_at DESC)
  WHERE is_active = false;

-- ==============================================================================
-- Verification queries (read-only, safe to run after applying)
-- ==============================================================================

-- 1. Confirm every existing row is active (expected: 0 rows returned)
-- SELECT id, user_id FROM diet_plans WHERE is_active = false;

-- 2. Confirm no user has more than one active plan (expected: 0 rows returned)
-- SELECT user_id, COUNT(*) FROM diet_plans WHERE is_active = true GROUP BY user_id HAVING COUNT(*) > 1;

-- 3. Confirm the new columns exist with the expected defaults
-- SELECT column_name, data_type, column_default FROM information_schema.columns
-- WHERE table_name = 'diet_plans' AND column_name IN ('is_active', 'created_at', 'updated_at');
