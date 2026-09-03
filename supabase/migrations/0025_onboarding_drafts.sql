-- ==============================================================================
-- Migration: onboarding_drafts (cross-device onboarding continuity)
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- The onboarding wizard (app/onboarding/OnboardingForm.tsx) persists its
-- in-progress state - biometrics, macro targets, food selections, manually
-- built meals - so an accidental refresh or closed tab doesn't lose it.
-- Until now that draft lived ONLY in localStorage, which is per-browser.
-- A user who started onboarding on their phone and then opened the same
-- account on a Mac got a blank wizard on the Mac: the draft never left the
-- first device. (This is separate from the finished state - once onboarding
-- completes there is a diet_plans row and every read path is already
-- server-side and device-independent.)
--
-- This table is the account-scoped, cross-device source of truth for an
-- *incomplete* onboarding. The client still writes localStorage first (for
-- instant, offline-safe, same-device resume) and treats this row as the
-- copy a second device can pick up.
--
-- DESIGN
--
-- - One row per user: user_id is the PRIMARY KEY and a FOREIGN KEY to
--   auth.users(id) with ON DELETE CASCADE (deleting the auth user removes
--   the draft automatically).
-- - The draft payload is stored opaquely as jsonb. Its shape is owned by the
--   client (OnboardingForm's OnboardingDraft interface); the server reads and
--   writes the blob without interpreting it, so future wizard changes need no
--   migration.
-- - RLS: identical ownership rule to every other user-scoped table in this
--   schema (profiles / diet_plans / meals / food_tracking / ...): a user can
--   only ever see or write their own row, enforced by Postgres, keyed on the
--   authenticated identity via (select auth.uid()) - never on any
--   client-supplied value. The (select ...) wrapper matches migration 0023's
--   auth_rls_initplan performance fix.
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - Purely additive: a brand-new table only. No existing table is altered,
--   no data is backfilled, moved, or deleted.
-- - Reversible: `DROP TABLE public.onboarding_drafts;`.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.onboarding_drafts (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  draft jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own onboarding draft" ON public.onboarding_drafts;
CREATE POLICY "Users can manage own onboarding draft"
  ON public.onboarding_drafts
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ==============================================================================
-- Verification queries (read-only, safe to run after applying)
-- ==============================================================================

-- 1. Table exists with the expected shape
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'onboarding_drafts' ORDER BY ordinal_position;

-- 2. RLS is enabled and the single ALL policy is present
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'public.onboarding_drafts'::regclass;
-- SELECT policyname, cmd, qual, with_check FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'onboarding_drafts';
