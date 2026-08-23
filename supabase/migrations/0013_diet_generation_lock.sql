-- ==============================================================================
-- Migration: Diet generation lock column
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- lib/diet/generation-lock.ts previously reused profiles.updated_at as a
-- makeshift lock: it only protected the single instant between reading and
-- writing that timestamp, not the full ~50s AI generation window that
-- follows - a second request arriving moments later (double tab, a slow
-- first click followed by a retry elsewhere) could read the
-- already-bumped timestamp as its own baseline and acquire "the lock" a
-- second time, allowing concurrent double-generation.
--
-- A dedicated column lets the lock be held for the entire generation
-- window (set on acquire, cleared on release in app/onboarding/actions.ts's
-- try/finally) without overloading a column other code also writes to for
-- unrelated reasons.
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - Purely additive, nullable, no default needed (NULL = unlocked).
-- - profiles.updated_at is untouched and continues to be used exactly as
--   before everywhere else in the app.
-- ==============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS generation_lock_at timestamptz;
