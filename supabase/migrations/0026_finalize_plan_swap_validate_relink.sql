-- ==============================================================================
-- Migration: harden finalize_plan_swap - validate the client-supplied relink map
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- finalize_plan_swap (0020) relinks historical food_tracking rows by applying
-- a caller-supplied old-id -> new-id map. That map is built in the browser
-- from DietEditor's own draft state (app/dashboard/actions.ts's mealIdPairs /
-- foodIdPairs), and the function trusted it verbatim: it ran
--   UPDATE food_tracking SET food_id = new_id WHERE food_id = old_id
-- for every pair, without ever checking that `old_id` was actually a food
-- belonging to the plan being retired (p_old_plan_id).
--
-- RLS already bounds the blast radius to the caller's OWN food_tracking rows
-- (user_id = auth.uid()), so this was never a cross-user issue. But a stale
-- or buggy client could still point a still-valid food_tracking.food_id at
-- the wrong new food, silently mis-attributing a past day's consumed macros.
--
-- FIX
--
-- Before relinking, intersect the supplied map with the real membership of
-- the old plan: only pairs whose old_id is genuinely a foods.id (resp.
-- meals.id) under p_old_plan_id and owned by the caller are applied. Pairs
-- that don't match are ignored rather than rejected - a from-scratch client
-- payload that includes a stray id still succeeds, it just has no effect for
-- that entry. Behaviour for every well-formed real edit is unchanged.
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - CREATE OR REPLACE only - same name, same signature, same return shape
--   ({relinkedByFood, relinkedByMeal}), same SECURITY INVOKER model, same
--   grants. No table, column, policy or other function is touched.
-- - Applying against production is safe and reversible (re-apply 0020's body
--   to roll back). Idempotent.
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

  IF NOT EXISTS (SELECT 1 FROM public.diet_plans WHERE id = p_old_plan_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'Old plan not found or not owned by caller';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.diet_plans WHERE id = p_new_plan_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'New plan not found or not owned by caller';
  END IF;

  -- 1. Relink food_tracking rows (every date, not just today) - but only for
  --    map entries whose old_id is genuinely one of THIS old plan's own
  --    foods, owned by the caller. A stray/foreign old_id in the payload is
  --    silently skipped by the inner join rather than blindly applied.
  WITH mapping AS (
    SELECT
      (elem->>'old_id')::uuid AS old_food_id,
      (elem->>'new_id')::uuid AS new_food_id,
      (elem->>'new_meal_id')::uuid AS new_meal_id
    FROM jsonb_array_elements(p_food_id_map) AS elem
  ),
  valid_mapping AS (
    SELECT m.*
    FROM mapping m
    JOIN public.foods f       ON f.id = m.old_food_id AND f.user_id = v_user_id
    JOIN public.meals om      ON om.id = f.meal_id AND om.user_id = v_user_id
    WHERE om.diet_plan_id = p_old_plan_id
      AND EXISTS (SELECT 1 FROM public.foods nf WHERE nf.id = m.new_food_id AND nf.user_id = v_user_id)
      AND EXISTS (SELECT 1 FROM public.meals nm WHERE nm.id = m.new_meal_id AND nm.user_id = v_user_id)
  )
  UPDATE public.food_tracking ft
  SET food_id = vm.new_food_id,
      meal_id = vm.new_meal_id
  FROM valid_mapping vm
  WHERE ft.user_id = v_user_id
    AND ft.food_id = vm.old_food_id;
  GET DIAGNOSTICS v_relinked_by_food = ROW_COUNT;

  -- 2. Meal-level fallback for rows step 1 couldn't move at the food level -
  --    again constrained to meals that genuinely belong to the old plan.
  WITH mapping AS (
    SELECT
      (elem->>'old_id')::uuid AS old_meal_id,
      (elem->>'new_id')::uuid AS new_meal_id
    FROM jsonb_array_elements(p_meal_id_map) AS elem
  ),
  valid_mapping AS (
    SELECT m.*
    FROM mapping m
    JOIN public.meals om ON om.id = m.old_meal_id AND om.user_id = v_user_id
    WHERE om.diet_plan_id = p_old_plan_id
      AND EXISTS (SELECT 1 FROM public.meals nm WHERE nm.id = m.new_meal_id AND nm.user_id = v_user_id)
  )
  UPDATE public.food_tracking ft
  SET meal_id = vm.new_meal_id
  FROM valid_mapping vm
  WHERE ft.user_id = v_user_id
    AND ft.meal_id = vm.old_meal_id;
  GET DIAGNOSTICS v_relinked_by_meal = ROW_COUNT;

  -- 3. Old meals gone (cascades to their foods). 4. Old plan retired.
  DELETE FROM public.meals WHERE diet_plan_id = p_old_plan_id AND user_id = v_user_id;
  DELETE FROM public.diet_plans WHERE id = p_old_plan_id AND user_id = v_user_id;

  -- 5. Activate the new plan only after everything above succeeded.
  UPDATE public.diet_plans SET is_active = true WHERE id = p_new_plan_id AND user_id = v_user_id;

  RETURN jsonb_build_object('relinkedByFood', v_relinked_by_food, 'relinkedByMeal', v_relinked_by_meal);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_plan_swap(uuid, uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_plan_swap(uuid, uuid, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_plan_swap(uuid, uuid, jsonb, jsonb) TO authenticated;
