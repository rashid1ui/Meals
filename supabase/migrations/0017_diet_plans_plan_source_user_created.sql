-- ==============================================================================
-- Migration: diet_plans plan_source widen to include 'user_created'
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- 0015_diet_plans_plan_source.sql introduced plan_source to distinguish
-- 'ai_generated' (produced by app/onboarding/actions.ts's submitOnboarding)
-- from 'user_customized' (produced by app/dashboard/actions.ts's
-- saveDietPlan, the moment a user hand-edits an AI-generated plan).
--
-- The new manual onboarding path (app/onboarding/manual-actions.ts's
-- createManualDietPlan) lets a user build their FIRST plan entirely by hand,
-- with no AI generation step ever involved - 'user_customized' would be
-- misleading here (nothing was ever generated for them to customize). This
-- widens the CHECK constraint to also allow 'user_created' for that case.
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - Purely additive to the allowed value set - every existing row's value
--   ('ai_generated' or 'user_customized') remains valid under the new
--   constraint unchanged.
-- ==============================================================================

ALTER TABLE public.diet_plans DROP CONSTRAINT diet_plans_plan_source_check;

ALTER TABLE public.diet_plans
  ADD CONSTRAINT diet_plans_plan_source_check
    CHECK (plan_source IN ('ai_generated', 'user_customized', 'user_created'));
