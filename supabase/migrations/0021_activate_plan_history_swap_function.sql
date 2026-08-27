-- ==============================================================================
-- Migration: Atomic history-preserving plan-activation function
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- app/onboarding/manual-actions.ts's createManualDietPlan (when replacing
-- an existing plan via Settings > Generate New Plan) deliberately KEEPS the
-- previous plan as history (is_active=false, never deleted) rather than
-- deleting it - unlike app/dashboard/actions.ts's saveDietPlan, which
-- always replaces the plan entirely. This preserves migration
-- 0001_diet_plans_history.sql's intended model for the onboarding
-- regenerate flow.
--
-- That deactivate-old/activate-new pair was previously two separate,
-- individually-checked (good) but non-atomic UPDATE statements. A
-- crash/timeout between them could leave a user with zero active plans -
-- the same class of gap finalize_plan_swap
-- (0020_finalize_plan_swap_function.sql) fixes for the delete-based
-- Dashboard-edit path, but that function is unsuitable here since it always
-- DELETES the old plan, which would wrongly destroy the history this flow
-- is specifically designed to preserve.
--
-- This function performs both updates as one atomic transaction with no
-- deletion at all - if the activate step fails, the deactivate step's
-- effect is rolled back too, so the previous plan is never left inactive
-- with no replacement active.
--
-- SECURITY MODEL
--
-- Same as finalize_plan_swap: SECURITY INVOKER (RLS still fully applies,
-- no elevated privilege), explicit ownership checks, EXECUTE revoked from
-- PUBLIC and anon, granted only to authenticated.
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - Purely additive: one new function, no existing table/column/policy is
--   modified.
-- - Application code (manual-actions.ts) must be updated to call this via
--   supabase.rpc('activate_plan_history_swap', ...) instead of the
--   previous two separate update calls - done in the same change that
--   introduces this migration.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.activate_plan_history_swap(
  p_old_plan_id uuid,
  p_new_plan_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.diet_plans WHERE id = p_old_plan_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'Old plan not found or not owned by caller';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.diet_plans WHERE id = p_new_plan_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'New plan not found or not owned by caller';
  END IF;

  UPDATE public.diet_plans SET is_active = false WHERE id = p_old_plan_id AND user_id = v_user_id;
  UPDATE public.diet_plans SET is_active = true WHERE id = p_new_plan_id AND user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_plan_history_swap(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.activate_plan_history_swap(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.activate_plan_history_swap(uuid, uuid) TO authenticated;
