'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import type { FoodMacro } from '@/lib/nutrition/calculator'
import {
  validateMealsShape,
  resolveMeal,
  type SaveDietPlanPayload,
  type ResolvedMeal,
  type OriginalFoodRecord
} from '@/lib/diet/save-plan'

export type SaveDietPlanResult = { success: true } | { error: string }

// Persists the user's edited diet plan (quantity changes, added/removed/moved
// foods, added meals) made in the Dashboard editor. Reuses the exact same
// safe persistence ordering as onboarding's new-plan flow: insert the fully
// resolved new plan first, confirm it saved completely, and only then retire
// the old one - so a failure at any point leaves the active plan untouched.
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
      .select('id')
      .eq('diet_plan_id', currentPlan.id)

    if (currentMealsError) {
      return { error: 'Could not load your current meal plan. Please try again.' }
    }

    const currentMealIds = (currentMeals || []).map(m => m.id)

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
    // one is fully and successfully saved.
    const { data: newPlan, error: insertPlanError } = await supabase
      .from('diet_plans')
      .insert({
        user_id: user.id,
        name: currentPlan.name,
        calories_target: currentPlan.calories_target,
        protein_target: currentPlan.protein_target,
        carbs_target: currentPlan.carbs_target,
        fat_target: currentPlan.fat_target
      })
      .select()
      .single()

    if (insertPlanError || !newPlan) {
      return { error: 'Failed to save your changes. Your existing plan has not been changed.' }
    }

    const insertedMealIds: string[] = []
    try {
      for (let i = 0; i < resolvedMeals.length; i++) {
        const meal = resolvedMeals[i]
        const { data: newMeal, error: insertMealError } = await supabase
          .from('meals')
          .insert({
            user_id: user.id,
            diet_plan_id: newPlan.id,
            name: meal.name,
            sort_order: i
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

          const { error: insertFoodsError } = await supabase.from('foods').insert(foodsToInsert)
          if (insertFoodsError) throw new Error('Food insert failed')
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
    // persisted do we retire the old one, in dependency order.
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
