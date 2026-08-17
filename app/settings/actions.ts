'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import { generateValidatedDiet, type FoodOption } from '@/lib/diet/generate-diet'
import { acquireGenerationLock } from '@/lib/diet/generation-lock'

export type RegenerateDietPlanResult = { success: true } | { error: string }

const isProteinCategory = (category: string) => ['protein', 'dairy'].includes((category || '').toLowerCase().trim())
const isCarbCategory = (category: string) => ['carbohydrate', 'fruit'].includes((category || '').toLowerCase().trim())
const isFatCategory = (category: string) => (category || '').toLowerCase().trim() === 'fat'

// Generates a brand new meal plan using the user's already-saved nutrition
// targets and food preferences, without sending them through onboarding again.
//
// Data-safety ordering: Generate -> Validate -> Persist new plan -> Activate.
// The new plan is inserted as an entirely separate row first; the user's
// existing plan is only removed after the new one is fully and successfully
// persisted. If generation or persistence fails at any point before that,
// the existing plan is never touched.
export async function regenerateDietPlan(): Promise<RegenerateDietPlanResult> {
  try {
    const user = await getUser()
    if (!user) return { error: 'Not authenticated' }

    const supabase = await createClient()

    // 1. Load the user's current active plan. The server derives the user
    // identity from the authenticated session only - never from client input.
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
      return { error: 'No active meal plan found. Please complete onboarding first.' }
    }

    // 2. Duplicate-submission / concurrency protection - same mechanism onboarding uses.
    const lockResult = await acquireGenerationLock(supabase, user.id)
    if (!lockResult.ok) return { error: lockResult.error }

    // 3. Reconstruct the user's saved preferences from what's actually persisted.
    // calories/protein/carbs/fat targets are stored directly on diet_plans.
    const calories = currentPlan.calories_target
    const protein = currentPlan.protein_target
    const carbs = currentPlan.carbs_target
    const fat = currentPlan.fat_target

    if (!calories || !protein || !carbs || !fat) {
      return { error: 'Your saved nutrition targets are missing or incomplete. Please contact support.' }
    }

    // Meals-per-day and food selections aren't stored as their own preference
    // record, so they're derived from the current plan's own meals/foods.
    const { data: currentMeals, error: currentMealsError } = await supabase
      .from('meals')
      .select('id')
      .eq('diet_plan_id', currentPlan.id)

    if (currentMealsError) {
      return { error: 'Could not load your current meal plan. Please try again.' }
    }

    const currentMealIds = (currentMeals || []).map(m => m.id)
    const mealsCount = currentMealIds.length

    if (mealsCount === 0) {
      return { error: 'Your current meal plan is incomplete and cannot be used to generate a new plan. Please contact support.' }
    }

    const { data: currentFoods, error: currentFoodsError } = await supabase
      .from('foods')
      .select('name')
      .in('meal_id', currentMealIds)

    if (currentFoodsError) {
      return { error: 'Could not load your current meal plan. Please try again.' }
    }

    const usedFoodNames = Array.from(new Set((currentFoods || []).map(f => f.name)))
    if (usedFoodNames.length === 0) {
      return { error: 'Your saved food preferences are missing or incomplete. Please contact support.' }
    }

    const { data: matchedFoods, error: matchedFoodsError } = await supabase
      .from('food_database')
      .select('*')
      .in('name', usedFoodNames)
      .eq('is_active', true)

    if (matchedFoodsError || !matchedFoods) {
      return { error: 'Could not load your saved food preferences. Please try again.' }
    }

    const hasProtein = matchedFoods.some(f => isProteinCategory(f.category))
    const hasCarb = matchedFoods.some(f => isCarbCategory(f.category))
    const hasFat = matchedFoods.some(f => isFatCategory(f.category))

    if (!hasProtein || !hasCarb || !hasFat) {
      return { error: 'Your saved food preferences are missing or incomplete. Please contact support or re-select your foods.' }
    }

    // 4. Generate + validate through the exact same engine onboarding uses.
    const genResult = await generateValidatedDiet({
      dbFoods: matchedFoods as unknown as FoodOption[],
      calories,
      protein,
      carbs,
      fat,
      mealsCount
    })

    if ('error' in genResult) {
      return { error: genResult.error }
    }

    const newDiet = genResult.diet

    // 5. Persist the new plan as a separate row. The existing plan has not
    // been touched by anything above this point.
    const { data: newPlan, error: insertPlanError } = await supabase
      .from('diet_plans')
      .insert({
        user_id: user.id,
        name: newDiet.name,
        calories_target: calories,
        protein_target: protein,
        carbs_target: carbs,
        fat_target: fat
      })
      .select()
      .single()

    if (insertPlanError || !newPlan) {
      return { error: 'Failed to save your new meal plan. Your existing plan has not been changed.' }
    }

    const insertedMealIds: string[] = []
    try {
      for (const meal of newDiet.meals) {
        const { data: newMeal, error: insertMealError } = await supabase
          .from('meals')
          .insert({
            user_id: user.id,
            diet_plan_id: newPlan.id,
            name: meal.name,
            sort_order: meal.sort_order
          })
          .select()
          .single()

        if (insertMealError || !newMeal) throw new Error('Meal insert failed')
        insertedMealIds.push(newMeal.id)

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
    } catch {
      // Roll back only the failed new attempt, in dependency order. The
      // user's existing plan was never touched by this branch.
      if (insertedMealIds.length > 0) {
        await supabase.from('foods').delete().in('meal_id', insertedMealIds)
        await supabase.from('meals').delete().in('id', insertedMealIds)
      }
      await supabase.from('diet_plans').delete().eq('id', newPlan.id)
      return { error: 'Failed to save your new meal plan. Your existing plan has not been changed.' }
    }

    // 6. Activate: only now that the new plan is fully and successfully
    // persisted do we remove the old one, in dependency order.
    if (currentMealIds.length > 0) {
      await supabase.from('foods').delete().in('meal_id', currentMealIds)
    }
    await supabase.from('meals').delete().eq('diet_plan_id', currentPlan.id)
    await supabase.from('diet_plans').delete().eq('id', currentPlan.id)

    await supabase.from('profiles').update({ updated_at: new Date().toISOString() }).eq('id', user.id)

    return { success: true }
  } catch (err) {
    console.error('regenerateDietPlan failed:', err)
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}
