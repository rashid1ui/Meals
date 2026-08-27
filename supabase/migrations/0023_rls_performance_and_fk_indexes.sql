-- ==============================================================================
-- Migration: RLS auth.uid() performance fix + missing FK indexes
-- ==============================================================================
-- WHY THIS MIGRATION IS REQUIRED
--
-- Supabase's own performance advisor (auth_rls_initplan) flagged every
-- "Users can manage own X" RLS policy in this schema: each one calls
-- auth.uid() directly, which Postgres re-evaluates once PER ROW scanned
-- rather than once per query. Wrapping the call as (select auth.uid())
-- lets Postgres treat it as a stable sub-select the planner can evaluate
-- once and reuse - the standard, Supabase-documented fix - with no change
-- in behavior (auth.uid() is stable within one statement either way).
--
-- Separately, the advisor's unindexed_foreign_keys check flagged five
-- foreign keys with no covering index: food_tracking's two composite FKs
-- (food_id, user_id) and (meal_id, user_id), foods' (meal_id, user_id),
-- meals' (diet_plan_id, user_id), and push_subscriptions' (user_id). Each
-- already has a single-column index on the FIRST column
-- (idx_food_tracking_food_id, idx_food_tracking_meal_id, idx_foods_meal_id,
-- idx_meals_diet_plan_id), but not one covering the exact composite
-- FK the constraint checks against (needed for efficient FK-validation
-- when a referenced diet_plans/meals/foods row is updated/deleted) -
-- push_subscriptions.user_id has no index at all. Adding the missing
-- composite indexes (and the missing push_subscriptions.user_id index)
-- closes this gap.
--
-- SAFETY / BACKWARD COMPATIBILITY
--
-- - RLS policy changes are behavior-preserving rewrites of the exact same
--   condition, not new restrictions - verified against every policy's
--   current qual/with_check (queried live before writing this migration).
-- - Index additions are purely additive and CREATE INDEX IF NOT EXISTS -
--   safe to re-run.
-- ==============================================================================

-- --- RLS: wrap auth.uid() as a sub-select in every "own row" policy ---

ALTER POLICY "Users can manage own daily tracking" ON public.daily_tracking
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can manage own diet plans" ON public.diet_plans
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can manage own food tracking" ON public.food_tracking
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can manage own foods" ON public.foods
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can manage own meals" ON public.meals
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can manage own notification events" ON public.notification_events
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can manage own notification preferences" ON public.notification_preferences
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can manage own push subscriptions" ON public.push_subscriptions
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- profiles' three separate policies each only had USING or only WITH CHECK
-- (never both) - preserved exactly as-is, only wrapping auth.uid().
ALTER POLICY "Users can view own profile" ON public.profiles
  USING ((select auth.uid()) = id);

ALTER POLICY "Users can update own profile" ON public.profiles
  USING ((select auth.uid()) = id);

ALTER POLICY "Users can insert own profile" ON public.profiles
  WITH CHECK ((select auth.uid()) = id);

-- --- Missing foreign-key-covering indexes ---

CREATE INDEX IF NOT EXISTS idx_food_tracking_food_id_user_id ON public.food_tracking (food_id, user_id);
CREATE INDEX IF NOT EXISTS idx_food_tracking_meal_id_user_id ON public.food_tracking (meal_id, user_id);
CREATE INDEX IF NOT EXISTS idx_foods_meal_id_user_id ON public.foods (meal_id, user_id);
CREATE INDEX IF NOT EXISTS idx_meals_diet_plan_id_user_id ON public.meals (diet_plan_id, user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions (user_id);
