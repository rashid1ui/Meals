-- ==============================================================================
-- Migration: Backfill - food_database unique name constraint
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- Already applied directly to the live database (recorded there as
-- "food_database_unique_name", version 20260822074657) but never committed
-- to this migrations folder. Backfilled here, guarded so it's safe to
-- re-run against an environment where the constraint already exists.
-- ==============================================================================

-- Prevent duplicate catalog entries (see seed.sql's own "IDEMPOTENCY
-- WARNING"). Application-level custom-food creation (createFoodDatabaseEntry)
-- pre-checks for an existing same-name row and reuses it instead of
-- inserting a duplicate; this constraint is the race-condition safety net
-- for two concurrent creates of the same name, and stops the AI-facing
-- catalog from ever accumulating duplicate entries.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'food_database_name_unique'
  ) THEN
    ALTER TABLE public.food_database ADD CONSTRAINT food_database_name_unique UNIQUE (name);
  END IF;
END $$;
