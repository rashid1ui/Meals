'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import type { FoodMacro } from '@/lib/nutrition/calculator'
import {
  validateMealsShape,
  resolveMeal,
  nextPlanSourceOnEdit,
  type SaveDietPlanPayload,
  type ResolvedMeal,
  type OriginalFoodRecord,
  type PlanSource
} from '@/lib/diet/save-plan'
import { buildMealImageCarryForwardIndex, decideMealImageCarryForward } from '@/lib/images/mealCarryForward'
import { scheduleMealImageResolution } from '@/lib/images/schedule'

export type SaveDietPlanResult = { success: true } | { error: string }

// Persists the user's edited diet plan (quantity changes, added/removed/moved
// foods, added meals) made in the Dashboard editor. Reuses the exact same
// safe persistence ordering as onboarding's new-plan flow: insert the fully
// resolved new plan first, confirm it saved completely, and only then retire
// the old one - so a failure at any point leaves the active plan untouched.
//
// The actual "retire old, activate new" swap (step 7 below) is delegated to
// the finalize_plan_swap Postgres function (migration
// 0020_finalize_plan_swap_function.sql) so it runs as ONE atomic
// transaction - relinking EVERY historical food_tracking row (not just
// today's, unlike the previous localDate-scoped implementation) by real
// old-id -> new-id pairs (not ambiguous name matching), then retiring the
// old plan and activating the new one, all-or-nothing.
export async function saveDietPlan(payload: SaveDietPlanPayload): Promise<SaveDietPlanResult> {
  try {
    const user = await getUser()
    if (!user) return { error: 'Not authenticated' }

    const supabase = await createClient()

    // 1. Load the current active plan.
    const { data: currentPlans, error: currentPlanError } = await supabase
      .from('diet_plans')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)

    if (currentPlanError) {
      return { error: 'Could not load your current meal plan. Please try again.' }
    }

    const currentPlan = currentPlans?.[0]
    if (!currentPlan) {
      return { error: 'No active meal plan found.' }
    }

    // 2. Structural validation.
    const shapeError = validateMealsShape(payload.meals)
    if (shapeError) return { error: shapeError }

    // 3. Only meals belonging to the user's OWN current plan may be
    // referenced by "locked" items - this prevents one user's edit from
    // reading another user's food rows via a crafted originalFoodId.
    const { data: currentMeals, error: currentMealsError } = await supabase
      .from('meals')
      .select(
        'id, name, reminder_time, reminder_enabled, image_url, image_alt, image_attribution, image_status, image_checked_at, image_composition_key, foods(id, name)'
      )
      .eq('diet_plan_id', currentPlan.id)

    if (currentMealsError) {
      return { error: 'Could not load your current meal plan. Please try again.' }
    }

    const currentMealIds = (currentMeals || []).map(m => m.id)

    // Meal ids churn on every save (this function always deletes+reinserts
    // meals - see step 6 below), so reminder_time/reminder_enabled would
    // otherwise be silently wiped on every unrelated diet edit (adding a
    // food, changing a quantity, etc). Carried forward by the meal's own
    // real id (SaveDietPlanMeal.currentId - the client's existing DraftMeal.id
    // for an item it's editing) rather than by name, so two same-named
    // meals never collide - a brand-new meal (no currentId, or a currentId
    // that doesn't match any current meal) simply gets no reminder
    // configured, same as any freshly-added meal today.
    const reminderByMealId = new Map(
      (currentMeals || []).map(m => [m.id, { reminderTime: m.reminder_time, reminderEnabled: m.reminder_enabled }])
    )

    // Meal images are "resolve once -> store -> reuse". Meal rows are
    // deleted+reinserted on every save, so the stored image must be carried
    // forward explicitly or it is lost - see lib/images/mealCarryForward.ts
    // (extracted there so this exact decision has direct unit-test coverage:
    // quantity/reorder/tracking never re-resolve, only a real composition
    // change re-resolves that one meal, a user-provided image always wins).
    const mealImageCarryForwardIndex = buildMealImageCarryForwardIndex(
      (currentMeals || []).map(m => ({
        id: m.id,
        name: m.name,
        foods: ((m as { foods?: { name: string }[] }).foods || []).map(f => ({ foodDatabaseId: null, name: f.name })),
        image_url: (m as { image_url?: string | null }).image_url ?? null,
        image_alt: (m as { image_alt?: string | null }).image_alt ?? null,
        image_attribution: (m as { image_attribution?: unknown }).image_attribution ?? null,
        image_status: (m as { image_status?: string | null }).image_status ?? null,
        image_checked_at: (m as { image_checked_at?: string | null }).image_checked_at ?? null,
        image_composition_key: (m as { image_composition_key?: string | null }).image_composition_key ?? null
      }))
    )

    const originalFoodIds = Array.from(new Set(
      payload.meals.flatMap(m => m.foods.map(f => f.originalFoodId).filter((id): id is string => !!id))
    ))

    const originalFoodsById = new Map<string, OriginalFoodRecord>()
    if (originalFoodIds.length > 0) {
      if (currentMealIds.length === 0) {
        return { error: 'Could not verify your current meal plan. Please refresh and try again.' }
      }
      const { data: originalFoods, error: originalFoodsError } = await supabase
        .from('foods')
        .select('*')
        .in('id', originalFoodIds)
        .in('meal_id', currentMealIds)

      if (originalFoodsError || !originalFoods || originalFoods.length !== originalFoodIds.length) {
        return { error: 'One or more locked food items could not be verified. Please refresh and try again.' }
      }
      for (const f of originalFoods) originalFoodsById.set(f.id, f)
    }

    // 4. Resolve editable items against a fresh food_database lookup.
    const foodDatabaseIds = Array.from(new Set(
      payload.meals.flatMap(m => m.foods.map(f => f.foodDatabaseId).filter((id): id is string => !!id))
    ))

    const foodDatabaseById = new Map<string, FoodMacro>()
    if (foodDatabaseIds.length > 0) {
      const { data: dbFoods, error: dbFoodsError } = await supabase
        .from('food_database')
        .select('*')
        .in('id', foodDatabaseIds)
        .eq('is_active', true)

      if (dbFoodsError || !dbFoods || dbFoods.length !== foodDatabaseIds.length) {
        return { error: 'One or more selected foods are inactive or no longer exist. Please refresh and try again.' }
      }
      for (const f of dbFoods) foodDatabaseById.set(f.id, f as FoodMacro)
    }

    // 5. Build the fully server-verified meal/food set to persist.
    const resolvedMeals: ResolvedMeal[] = []
    for (const meal of payload.meals) {
      const result = resolveMeal(meal, foodDatabaseById, originalFoodsById)
      if ('error' in result) return { error: result.error }
      resolvedMeals.push(result.meal)
    }

    // 6. Persist as a new plan first; only remove the old one once the new
    // one is fully and successfully saved. Inserted inactive - a unique DB
    // index (diet_plans_one_active_per_user) allows only one is_active=true
    // row per user, so this can't be active while currentPlan still is.
    // Dashboard edits don't create plan history (unlike onboarding's new-plan
    // flow) - the old row is deleted once the swap completes, same as before.
    const { data: newPlan, error: insertPlanError } = await supabase
      .from('diet_plans')
      .insert({
        user_id: user.id,
        name: currentPlan.name,
        calories_target: currentPlan.calories_target,
        protein_target: currentPlan.protein_target,
        carbs_target: currentPlan.carbs_target,
        fat_target: currentPlan.fat_target,
        is_active: false,
        // Provenance rules (migrations 0015/0017_diet_plans_plan_source*.sql):
        // editing an 'ai_generated' plan marks it 'user_customized' (it was
        // AI-touched, then hand-edited) - but editing a 'user_created' plan
        // (built entirely by hand via the Manual Meal Builder, never
        // AI-touched) PRESERVES 'user_created' rather than downgrading it
        // to 'user_customized', since that value's whole meaning is
        // specifically "was AI, then edited" - collapsing every edit to
        // 'user_customized' unconditionally (the previous behavior) would
        // permanently and irreversibly erase whether AI was ever involved,
        // for every manually-built plan the moment it was edited once.
        // Already-'user_customized' plans simply stay that way (sticky,
        // there's no 'ai_generated' plan to fall back to).
        plan_source: nextPlanSourceOnEdit(currentPlan.plan_source as PlanSource)
      })
      .select()
      .single()

    if (insertPlanError || !newPlan) {
      return { error: 'Failed to save your changes. Your existing plan has not been changed.' }
    }

    const insertedMealIds: string[] = []
    // Old-id -> new-id pairs, built from the client's own currentId (the
    // food/meal's real, pre-existing database id) rather than by matching
    // names - a real id can never collide the way two same-named
    // meals/foods can. Handed to finalize_plan_swap below so it can relink
    // EVERY historical food_tracking row referencing the old ids, not just
    // today's.
    const mealIdPairs: { old_id: string; new_id: string }[] = []
    const foodIdPairs: { old_id: string; new_id: string; new_meal_id: string }[] = []
    // New meal ids whose image composition changed (or is brand new) - image
    // resolution is scheduled for these only, AFTER the swap succeeds.
    const mealsToResolveImages: string[] = []
    try {
      for (let i = 0; i < resolvedMeals.length; i++) {
        const meal = resolvedMeals[i]
        const carriedReminder = meal.currentId ? reminderByMealId.get(meal.currentId) : undefined

        // See lib/images/mealCarryForward.ts: a user-provided image is
        // matched by the meal's own stable id and wins unconditionally, even
        // across a composition change; otherwise composition-fingerprint
        // matching applies (quantity/order/tracking never affect it).
        const { compositionKey, carriedImage } = decideMealImageCarryForward(
          { currentId: meal.currentId, name: meal.name, foods: meal.foods.map(f => ({ foodDatabaseId: null, name: f.name })) },
          mealImageCarryForwardIndex
        )

        const { data: newMeal, error: insertMealError } = await supabase
          .from('meals')
          .insert({
            user_id: user.id,
            diet_plan_id: newPlan.id,
            name: meal.name,
            sort_order: i,
            reminder_time: carriedReminder?.reminderTime ?? null,
            reminder_enabled: carriedReminder?.reminderEnabled ?? true,
            image_composition_key: compositionKey,
            // Same composition as before -> reuse the stored image verbatim
            // (0 API calls). Otherwise mark pending and resolve after the swap.
            image_url: carriedImage?.image_url ?? null,
            image_alt: carriedImage?.image_alt ?? null,
            image_attribution: carriedImage?.image_attribution ?? null,
            image_status: carriedImage ? carriedImage.image_status : 'pending',
            // Carried forward verbatim (including a preserved null) - only a
            // genuine fresh resolution attempt (scheduled below) ever sets a
            // new image_checked_at.
            image_checked_at: carriedImage?.image_checked_at ?? null
          })
          .select()
          .single()

        if (insertMealError || !newMeal) {
          console.error('saveDietPlan: meal insert failed:', insertMealError)
          throw new Error('Meal insert failed')
        }
        insertedMealIds.push(newMeal.id)
        if (!carriedImage) mealsToResolveImages.push(newMeal.id)
        if (meal.currentId) mealIdPairs.push({ old_id: meal.currentId, new_id: newMeal.id })

        // Inserted one row at a time (not a single bulk array insert) so
        // each insert's own returned id is unambiguously paired with the
        // food object it came from - a bulk insert's return order is not a
        // guarantee this pairing can safely rely on, especially with
        // duplicate-named foods in the same meal.
        for (let idx = 0; idx < meal.foods.length; idx++) {
          const food = meal.foods[idx]
          const { data: newFood, error: insertFoodError } = await supabase
            .from('foods')
            .insert({
              user_id: user.id,
              meal_id: newMeal.id,
              name: food.name,
              quantity: food.quantity,
              unit: food.unit,
              protein: food.protein,
              fat: food.fat,
              carbs: food.carbs,
              calories: food.calories,
              sort_order: idx
            })
            .select('id')
            .single()

          if (insertFoodError || !newFood) {
            console.error('saveDietPlan: food insert failed:', insertFoodError)
            throw new Error('Food insert failed')
          }
          if (food.currentId) {
            foodIdPairs.push({ old_id: food.currentId, new_id: newFood.id, new_meal_id: newMeal.id })
          }
        }
      }
    } catch (insertErr) {
      // Roll back only the new attempt, in dependency order. The user's
      // existing plan was never touched by this branch.
      console.error('saveDietPlan: rolling back new plan attempt:', insertErr)
      if (insertedMealIds.length > 0) {
        const { error: rollbackFoodsError } = await supabase.from('foods').delete().in('meal_id', insertedMealIds)
        if (rollbackFoodsError) console.error('saveDietPlan: rollback foods delete failed:', rollbackFoodsError)
        const { error: rollbackMealsError } = await supabase.from('meals').delete().in('id', insertedMealIds)
        if (rollbackMealsError) console.error('saveDietPlan: rollback meals delete failed:', rollbackMealsError)
      }
      const { error: rollbackPlanError } = await supabase.from('diet_plans').delete().eq('id', newPlan.id)
      if (rollbackPlanError) console.error('saveDietPlan: rollback plan delete failed:', rollbackPlanError)
      return { error: 'Failed to save your changes. Your existing plan has not been changed.' }
    }

    // 7. Atomically relink EVERY historical food_tracking row referencing
    // the old meal/food ids (every date, not just today), delete the old
    // plan/meals, and activate the new plan - all in one Postgres
    // transaction (finalize_plan_swap, migration
    // 0020_finalize_plan_swap_function.sql), so a failure partway through
    // can never leave the user with zero active plans: if this call fails,
    // the old plan is still there and still active, exactly as if this
    // request had never happened.
    const { error: swapError } = await supabase.rpc('finalize_plan_swap', {
      p_old_plan_id: currentPlan.id,
      p_new_plan_id: newPlan.id,
      p_meal_id_map: mealIdPairs,
      p_food_id_map: foodIdPairs
    })

    if (swapError) {
      console.error('saveDietPlan: finalize_plan_swap failed:', swapError)
      // The new plan/meals/foods are fully persisted but never became
      // active (the RPC's own transaction rolled back before reaching the
      // activation step) - clean up this abandoned attempt so it doesn't
      // linger as an orphaned inactive plan. The old plan was never
      // touched and remains the active one.
      const { error: cleanupFoodsError } = await supabase.from('foods').delete().in('meal_id', insertedMealIds)
      if (cleanupFoodsError) console.error('saveDietPlan: post-swap-failure foods cleanup failed:', cleanupFoodsError)
      const { error: cleanupMealsError } = await supabase.from('meals').delete().in('id', insertedMealIds)
      if (cleanupMealsError) console.error('saveDietPlan: post-swap-failure meals cleanup failed:', cleanupMealsError)
      const { error: cleanupPlanError } = await supabase.from('diet_plans').delete().eq('id', newPlan.id)
      if (cleanupPlanError) console.error('saveDietPlan: post-swap-failure plan cleanup failed:', cleanupPlanError)
      return { error: 'Failed to activate your changes. Your existing plan has not been changed.' }
    }

    const { error: touchProfileError } = await supabase
      .from('profiles')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', user.id)
    if (touchProfileError) {
      // Not fatal - the plan swap already succeeded and is the source of
      // truth; this is a cosmetic timestamp bump only.
      console.error('saveDietPlan: failed to touch profile updated_at:', touchProfileError)
    }

    // Non-blocking, after the response: resolve a fresh image only for the
    // meals whose composition changed (or are new). Unchanged meals kept
    // their image verbatim above - no Pexels call for a quantity edit,
    // reorder or tracking change.
    scheduleMealImageResolution(mealsToResolveImages)

    return { success: true }
  } catch (err) {
    console.error('saveDietPlan failed:', err)
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}
