-- ==============================================================================
-- Migration: Reconcile local migration history with production (drift fix)
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- A production audit found that the live database has 3 applied migrations
-- with no corresponding file in this local supabase/migrations/ folder:
--
--   version 20260822074639  remove_pork_tenderloin_from_default_foods
--   version 20260822074657  food_database_unique_name
--   version 20260822080849  remove_ggg_test_food
--
-- (Verified live via supabase_migrations.schema_migrations - their
-- `backfill_*` follow-ups, which DO have local files - 0009 and 0011 - are
-- separate, later migrations that cleaned up remaining duplicates after
-- these three ran.) This meant a fresh `supabase db reset` run against
-- only this local folder would NOT reproduce the production schema/data
-- exactly - it would be missing these 3 operations entirely.
--
-- This migration reproduces the EXACT same 3 operations (statements copied
-- verbatim from the live schema_migrations record), so that local and
-- production converge on the same end state. It is deliberately NOT
-- inserted as 3 separate files matching their true chronological position
-- (which would require renumbering every existing sequential local
-- migration file, a much larger and riskier change than the actual goal
-- here) - each operation is idempotent/order-independent (see below), so
-- applying them together as one later migration produces the identical
-- final schema/data state as applying them in their original position
-- would have.
--
-- Per-statement ordering safety (verified before writing this):
--   1 & 3 (soft-delete by exact name) depend only on a row with that exact
--     name existing - nothing in migrations 0004-0018 renames or
--     reactivates either "Pork Tenderloin, Raw" or "ggg", so running these
--     later than their original position is equivalent.
--   2 (UNIQUE constraint on name) requires no duplicate names exist at the
--     moment it runs - this constraint has held continuously on production
--     since it was first added (verified: food_database_name_unique index
--     still exists today), so no migration since has introduced a
--     duplicate; adding it again at the end of a fresh local replay is
--     equally safe. Guarded with a DO block so it's also a safe no-op
--     against the live database, where it already exists.
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - Every statement is idempotent: the UPDATEs are safe to re-run
--   (already-inactive rows simply match 0 additional rows), and the ADD
--   CONSTRAINT is wrapped to no-op if the constraint already exists.
-- - Does not delete, rename, or alter any existing migration file or any
--   production history - purely reconciles the LOCAL file set forward.
-- ==============================================================================

-- Originally version 20260822074639 (remove_pork_tenderloin_from_default_foods)
UPDATE public.food_database SET is_active = false WHERE name = 'Pork Tenderloin, Raw';

-- Originally version 20260822074657 (food_database_unique_name). Postgres
-- raises duplicate_table (42P07, not duplicate_object) for this specific
-- case, because UNIQUE (name) creates a backing index sharing the
-- constraint's name, and that index - not just the constraint - already
-- exists on production; both exception classes are caught defensively.
DO $$
BEGIN
  ALTER TABLE public.food_database ADD CONSTRAINT food_database_name_unique UNIQUE (name);
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN
    NULL; -- already exists on production - safe no-op
END $$;

-- Originally version 20260822080849 (remove_ggg_test_food)
UPDATE public.food_database SET is_active = false WHERE name = 'ggg';
