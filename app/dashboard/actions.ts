'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import type { FoodMacro } from '@/lib/nutrition/calculator'
import { isPlausibleToday } from '@/lib/tracking/date'
import {
  validateMealsShape,
  resolveMeal,
  computeFoodRelinkPairs,
  type SaveDietPlanPayload,
  type ResolvedMeal,
  type OriginalFoodRecord,
  type NamedMeal,
  type NamedMealWithId
} from '@/lib/diet/save-plan'

export type SaveDietPlanResult = { success: true } | { error: string }

// Persists the user's edited diet plan (quantity changes, added/removed/moved
// foods, added meals) made in the Dashboard editor. Reuses the exact same
// safe persistence ordering as onboarding's new-plan flow: insert the fully
// resolved new plan first, confirm it saved completely, and only then retire
// the old one - so a failure at any point leaves the active plan untouched.
//
// `localDate` (the browser's today, same value used by tracking-actions.ts)
// is optional only for caller-compatibility - when present and plausible, it
// scopes the food_tracking id migration below to today's rows, which is the
// only date with a live UI depending on food_id.
export async function saveDietPlan(payload: SaveDietPlanPayload, localDate?: string): Promise<SaveDietPlanResult> {
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
      .select('id, name, reminder_time, reminder_enabled, foods(id, name)')
      .eq('diet_plan_id', currentPlan.id)

    if (currentMealsError) {
      return { error: 'Could not load your current meal plan. Please try again.' }
    }

    const currentMealIds = (currentMeals || []).map(m => m.id)

    // Meal ids churn on every save (this function always deletes+reinserts
    // meals - see step 6 below), so reminder_time/reminder_enabled would
    // otherwise be silently wiped on every unrelated diet edit (adding a
    // food, changing a quantity, etc). Carried forward by NAME, the same
    // reconciliation approach computeFoodRelinkPairs already uses below for
    // food_tracking rows. A brand-new meal (no name match) simply gets no
    // reminder configured, same as any freshly-added meal today.
    const reminderByMealName = new Map(
      (currentMeals || []).map(m => [m.name, { reminderTime: m.reminder_time, reminderEnabled: m.reminder_enabled }])
    )
    const oldMealsForRelink: NamedMeal[] = (currentMeals || []).map(m => ({
      name: m.name,
      foods: (m.foods || []).map((f: { id: string; name: string }) => ({ id: f.id, name: f.name }))
    }))

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
        // The user just hand-edited this plan's foods - see migration
        // 0015_diet_plans_plan_source.sql. Sticky once set: a plan already
        // 'user_customized' stays that way through further edits (there's
        // no 'ai_generated' plan to fall back to here).
        plan_source: 'user_customized'
      })
      .select()
      .single()

    if (insertPlanError || !newPlan) {
      return { error: 'Failed to save your changes. Your existing plan has not been changed.' }
    }

    const insertedMealIds: string[] = []
    const newMealsForRelink: NamedMealWithId[] = []
    try {
      for (let i = 0; i < resolvedMeals.length; i++) {
        const meal = resolvedMeals[i]
        const carriedReminder = reminderByMealName.get(meal.name)
        const { data: newMeal, error: insertMealError } = await supabase
          .from('meals')
          .insert({
            user_id: user.id,
            diet_plan_id: newPlan.id,
            name: meal.name,
            sort_order: i,
            reminder_time: carriedReminder?.reminderTime ?? null,
            reminder_enabled: carriedReminder?.reminderEnabled ?? true
          })
          .select()
          .single()

        if (insertMealError || !newMeal) throw new Error('Meal insert failed')
        insertedMealIds.push(newMeal.id)

        if (meal.foods.length > 0) {
          const foodsToInsert = meal.foods.map((food, idx) => ({
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
          }))

          const { data: newFoods, error: insertFoodsError } = await supabase
            .from('foods')
            .insert(foodsToInsert)
            .select('id, name')
          if (insertFoodsError) throw new Error('Food insert failed')
          newMealsForRelink.push({ id: newMeal.id, name: meal.name, foods: newFoods || [] })
        } else {
          newMealsForRelink.push({ id: newMeal.id, name: meal.name, foods: [] })
        }
      }
    } catch {
      // Roll back only the new attempt, in dependency order. The user's
      // existing plan was never touched by this branch.
      if (insertedMealIds.length > 0) {
        await supabase.from('foods').delete().in('meal_id', insertedMealIds)
        await supabase.from('meals').delete().in('id', insertedMealIds)
      }
      await supabase.from('diet_plans').delete().eq('id', newPlan.id)
      return { error: 'Failed to save your changes. Your existing plan has not been changed.' }
    }

    // 7. Activate: only now that the new plan is fully and successfully
    // persisted do we retire the old one, in dependency order. Old is
    // deactivated before new is activated so the two updates never violate
    // the one-active-per-user unique index. Edits don't create history, so
    // the old (now-inactive) row is deleted afterward, same as before.
    await supabase.from('diet_plans').update({ is_active: false }).eq('id', currentPlan.id)
    await supabase.from('diet_plans').update({ is_active: true }).eq('id', newPlan.id)

    // 7b. Re-point today's already-recorded food_tracking rows at their
    // replacement food/meal ids before the old rows are deleted below - once
    // deleted, food_tracking.food_id/meal_id go NULL via ON DELETE SET NULL
    // and can no longer be matched. Must run before the deletes: matching
    // requires the old food ids to still be the live value on these rows.
    if (localDate && isPlausibleToday(localDate)) {
      const relinkPairs = computeFoodRelinkPairs(oldMealsForRelink, newMealsForRelink)
      for (const pair of relinkPairs) {
        await supabase
          .from('food_tracking')
          .update({ food_id: pair.newFoodId, meal_id: pair.newMealId })
          .eq('user_id', user.id)
          .eq('tracking_date', localDate)
          .eq('food_id', pair.oldFoodId)
      }
    }

    if (currentMealIds.length > 0) {
      await supabase.from('foods').delete().in('meal_id', currentMealIds)
    }
    await supabase.from('meals').delete().eq('diet_plan_id', currentPlan.id)
    await supabase.from('diet_plans').delete().eq('id', currentPlan.id)

    await supabase.from('profiles').update({ updated_at: new Date().toISOString() }).eq('id', user.id)

    return { success: true }
  } catch (err) {
    console.error('saveDietPlan failed:', err)
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}
