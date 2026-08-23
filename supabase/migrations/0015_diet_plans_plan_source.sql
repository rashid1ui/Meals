-- ==============================================================================
-- Migration: diet_plans plan_source (AI-generated vs. user-customized)
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- Editing philosophy change: the AI only creates the INITIAL plan. Once
-- generated, the user owns it - editing quantities, moving foods, adding/
-- removing foods is normal use, not "breaking the plan" (see
-- app/dashboard/components/FoodRow.tsx / ChangeSummaryPanel.tsx, which no
-- longer show edits as INCREASED/DECREASED warnings).
--
-- `diet_plans.is_active` only distinguishes current vs. historical, and
-- `targets_source` only describes where the macro TARGETS came from
-- (Nutrition Engine vs. manual entry) - neither says whether the plan's
-- FOODS were ever hand-edited via the Dashboard. `plan_source` is that
-- missing, explicit separation: 'ai_generated' for a plan exactly as
-- produced by generation (app/onboarding/actions.ts's submitOnboarding),
-- 'user_customized' the moment the user saves any edit via
-- app/dashboard/actions.ts's saveDietPlan (which always inserts a fresh
-- active plan row - see its own comments on why edits aren't in-place
-- updates). Purely informational - it does not gate or block anything;
-- regeneration (Settings > Generate New Plan) already only ever replaces the
-- active plan on explicit user confirmation (app/settings/GenerateNewPlanButton.tsx),
-- regardless of this value.
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - NOT NULL with a default, so every existing plan (all of which were
--   produced by generation, never partially migrated) is correctly and
--   automatically classified 'ai_generated' with no backfill needed.
-- ==============================================================================

ALTER TABLE public.diet_plans
  ADD COLUMN IF NOT EXISTS plan_source text NOT NULL DEFAULT 'ai_generated';

ALTER TABLE public.diet_plans
  ADD CONSTRAINT diet_plans_plan_source_check
    CHECK (plan_source IN ('ai_generated', 'user_customized'));
