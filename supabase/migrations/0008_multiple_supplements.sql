-- ==============================================================================
-- Migration: Multiple Supplements
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- Adds support for users selecting multiple supplements (Whey, Creatine, Other)
-- simultaneously during onboarding without breaking the existing schema.
--
--  1. `profiles` gains a `supplements` JSONB column to store an array of
--     supplement objects.
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - Existing legacy columns (supplement_type, protein_brand, etc.) remain untouched
--   for backward compatibility. New logic prefers the `supplements` JSONB column.
-- - A CHECK constraint enforces the column always holds a JSON array (never an
--   object/scalar/malformed value) - app-level validation (lib/diet/supplements.ts)
--   handles per-element shape/range/duplicate-type checks, this is just a
--   structural backstop so a bug can never persist something the app can't parse.
-- ==============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS supplements jsonb DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_supplements_is_array'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_supplements_is_array
      CHECK (supplements IS NULL OR jsonb_typeof(supplements) = 'array');
  END IF;
END $$;
