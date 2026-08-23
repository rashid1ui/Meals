-- ==============================================================================
-- Migration: food_database supplement SELECT RLS fix
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- Production bug: submitting onboarding with Creatine (or any brand-new
-- supplement config not already in the catalog) failed with "Failed to save
-- your creatine supplement. Please try again." Server logs showed the real
-- Postgres error: "new row violates row-level security policy for table
-- food_database" (confirmed via the live project's query logs).
--
-- Root cause: the existing SELECT policy ("Authenticated users can view
-- active foods") only allows rows where is_active = true. Supplement rows
-- are deliberately inserted with is_active = false (app/onboarding/actions.ts)
-- so they never leak into the general food picker - that's already enforced
-- in application code via explicit `.eq('is_active', true)` filters on every
-- picker/candidate-pool query (app/onboarding/page.tsx, app/dashboard/page.tsx,
-- lib/diet/generate-diet.ts). But Postgres RLS requires a row returned by
-- `INSERT ... RETURNING` to also satisfy the table's SELECT policy - since
-- supplement rows fail `is_active = true`, the RETURNING clause itself
-- violates RLS and the whole insert is rejected. The same SELECT policy also
-- blocked the pre-insert "does this supplement already exist" lookup and the
-- post-conflict "who won the race" lookup, both keyed by name via `.ilike`.
--
-- Fix: widen the SELECT policy to also allow supplement rows (identified by
-- category = 'supplement', which migration 0012 established as the fixed
-- category for all system-generated supplement rows) regardless of
-- is_active. This does NOT expose supplements in any existing picker/AI
-- candidate query, since those already filter `is_active = true` explicitly
-- in application code, independent of RLS - this migration only restores the
-- supplement-lookup code path's ability to see rows it needs.
-- ==============================================================================

DROP POLICY IF EXISTS "Authenticated users can view active foods" ON public.food_database;

CREATE POLICY "Authenticated users can view active foods"
  ON public.food_database
  FOR SELECT
  TO authenticated
  USING (is_active = true OR category = 'supplement');
