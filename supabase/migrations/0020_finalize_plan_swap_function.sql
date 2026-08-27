-- ==============================================================================
-- Migration: Atomic plan-swap function (finalize_plan_swap)
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- app/dashboard/actions.ts's saveDietPlan (and, to a lesser extent,
-- app/onboarding/manual-actions.ts's createManualDietPlan when replacing an
-- existing plan) always deletes and re-inserts every meal/food row on
-- every edit-save, giving every row a brand new id. The final "swap" step
-- - deactivate the old plan, relink historical food_tracking rows onto the
-- new ids, delete the old plan/meals, activate the new plan - was
-- previously several separate, unchecked Supabase calls from application
-- code:
--   1. It only relinked TODAY's food_tracking rows (by tracking_date), so
--      every OTHER date's tracking rows referencing the deleted old
--      meals/foods went meal_id/food_id = NULL via each table's own
--      ON DELETE SET NULL foreign key the moment the old rows were
--      deleted - silently corrupting "meals completed" history for every
--      previously-tracked day, not just today.
--   2. It was not atomic: a crash/timeout between the deactivate-old and
--      activate-new steps (or between deleting the old plan and activating
--      the new one) could leave a user with zero active plans.
--
-- This function performs the entire swap - relink ALL historical
-- food_tracking rows (every date, not just today), delete the old plan's
-- meals (cascades to their foods via foods_meal_id_user_id_fkey's
-- ON DELETE CASCADE), delete the old plan, then activate the new one - as
-- ONE Postgres function call, which Postgres executes as a single atomic
-- transaction: if any statement raises, every effect of every statement
-- before it in this function is rolled back too, so a user can never be
-- left with zero active plans because of a mid-sequence failure. This is
-- the only mechanism available in this architecture (plain Supabase JS
-- client calls have no multi-statement transaction API) that gives real
-- atomicity across multiple tables.
--
-- Relinking is done by an explicit, caller-supplied old-id -> new-id
-- mapping (built from the real `meals.id`/`foods.id` the client already
-- tracks for every existing item it edited - see lib/diet/save-plan.ts's
-- SaveDietPlanMeal.currentId/SaveDietPlanFood.currentId), NOT by matching
-- meal/food names - the previous name-based matching
-- (computeFoodRelinkPairs) silently produced no match at all whenever two
-- meals/foods shared the same name, or a meal was renamed, orphaning
-- tracking history in exactly those cases. A real database id is
-- unambiguous by construction.
--
-- SECURITY MODEL
--
-- SECURITY INVOKER (the default - stated explicitly here for clarity,
-- given this codebase's own audit flagged an existing SECURITY DEFINER
-- function, handle_new_user, for being callable by anon/authenticated with
-- no additional check). Running as the CALLER's own role means every
-- statement inside this function is still subject to the exact same RLS
-- policies ("Users can manage own X") as if the caller ran them directly -
-- this function grants no elevated privilege, it only makes several
-- already-permitted statements atomic. An explicit auth.uid()/ownership
-- check is still included below, so a caller who somehow passes a plan id
-- it doesn't own gets a clear, loud exception instead of a silent no-op.
-- EXECUTE is revoked from PUBLIC and granted only to `authenticated` -
-- never `anon`.
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - Purely additive: one new function, no existing table/column/policy is
--   modified.
-- - Application code (app/dashboard/actions.ts, manual-actions.ts) must be
--   updated to call this via supabase.rpc('finalize_plan_swap', ...)
--   instead of the previous separate update/delete calls - done in the
--   same change that introduces this migration.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.finalize_plan_swap(
  p_old_plan_id uuid,
  p_new_plan_id uuid,
  p_meal_id_map jsonb,
  p_food_id_map jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_relinked_by_food int := 0;
  v_relinked_by_meal int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_meal_id_map IS NULL OR jsonb_typeof(p_meal_id_map) <> 'array' THEN
    RAISE EXCEPTION 'p_meal_id_map must be a JSON array';
  END IF;
  IF p_food_id_map IS NULL OR jsonb_typeof(p_food_id_map) <> 'array' THEN
    RAISE EXCEPTION 'p_food_id_map must be a JSON array';
  END IF;

  -- Ownership check: both plans must belong to the caller. Under RLS every
  -- statement below would already be a no-op for a plan the caller doesn't
  -- own, but this fails loudly and specifically instead of silently
  -- touching zero rows.
  IF NOT EXISTS (SELECT 1 FROM public.diet_plans WHERE id = p_old_plan_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'Old plan not found or not owned by caller';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.diet_plans WHERE id = p_new_plan_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'New plan not found or not owned by caller';
  END IF;

  -- 1. Relink food_tracking rows (every date, not just today) whose
  --    food_id matches an old->new food id pair, moving them onto the new
  --    food AND its new meal in one update.
  WITH mapping AS (
    SELECT
      (elem->>'old_id')::uuid AS old_food_id,
      (elem->>'new_id')::uuid AS new_food_id,
      (elem->>'new_meal_id')::uuid AS new_meal_id
    FROM jsonb_array_elements(p_food_id_map) AS elem
  )
  UPDATE public.food_tracking ft
  SET food_id = m.new_food_id,
      meal_id = m.new_meal_id
  FROM mapping m
  WHERE ft.user_id = v_user_id
    AND ft.food_id = m.old_food_id;
  GET DIAGNOSTICS v_relinked_by_food = ROW_COUNT;

  -- 2. For any remaining rows still pointing at an old meal (food_id
  --    already NULL from a prior edit before this fix shipped, or a food
  --    that was genuinely removed this time - nothing left to relink at
  --    the food level), at least keep the meal-level association current
  --    so per-meal completion counts don't regress further. Runs after
  --    step 1, so it only touches rows step 1 didn't already move onto a
  --    new meal.
  WITH mapping AS (
    SELECT
      (elem->>'old_id')::uuid AS old_meal_id,
      (elem->>'new_id')::uuid AS new_meal_id
    FROM jsonb_array_elements(p_meal_id_map) AS elem
  )
  UPDATE public.food_tracking ft
  SET meal_id = m.new_meal_id
  FROM mapping m
  WHERE ft.user_id = v_user_id
    AND ft.meal_id = m.old_meal_id;
  GET DIAGNOSTICS v_relinked_by_meal = ROW_COUNT;

  -- 3. Old meals are no longer needed - delete them (cascades to their
  --    foods via foods_meal_id_user_id_fkey's ON DELETE CASCADE). Any
  --    food_tracking row still referencing them was already relinked
  --    above, or has nothing left to relink to, and correctly goes
  --    meal_id/food_id = NULL via food_tracking's own ON DELETE SET NULL -
  --    its denormalized food_name/quantity/macros columns are unaffected
  --    either way, so no nutrition history is ever lost.
  DELETE FROM public.meals WHERE diet_plan_id = p_old_plan_id AND user_id = v_user_id;

  -- 4. Old plan is now fully retired.
  DELETE FROM public.diet_plans WHERE id = p_old_plan_id AND user_id = v_user_id;

  -- 5. Only now, after the old plan and its dependents are gone and every
  --    reachable tracking row has been relinked, activate the new plan.
  --    If anything above raised, this line never runs and the whole
  --    transaction rolls back - the old plan is still there and still
  --    active, exactly as if this call had never happened.
  UPDATE public.diet_plans SET is_active = true WHERE id = p_new_plan_id AND user_id = v_user_id;

  RETURN jsonb_build_object('relinkedByFood', v_relinked_by_food, 'relinkedByMeal', v_relinked_by_meal);
END;
$$;

-- REVOKE ... FROM PUBLIC alone is not sufficient in this project: Supabase
-- grants EXECUTE on newly created public-schema functions to `anon`,
-- `authenticated`, and `service_role` directly (via ALTER DEFAULT
-- PRIVILEGES), not just via the PUBLIC pseudo-role - confirmed by querying
-- information_schema.routine_privileges immediately after creating this
-- function, which still listed `anon` despite the PUBLIC revoke below.
-- `anon` must be revoked explicitly, or an unauthenticated request could
-- call this function directly (auth.uid() would be NULL, which the
-- function already rejects via its own check, but defense in depth means
-- not exposing it to anon at all - the same class of issue this codebase's
-- own audit flagged for the pre-existing handle_new_user() function).
REVOKE ALL ON FUNCTION public.finalize_plan_swap(uuid, uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_plan_swap(uuid, uuid, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_plan_swap(uuid, uuid, jsonb, jsonb) TO authenticated;
