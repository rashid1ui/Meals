'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { getUser } from '@/lib/auth/get-user'
import { generateValidatedDiet, type FoodOption } from '@/lib/diet/generate-diet'
import { acquireGenerationLock } from '@/lib/diet/generation-lock'

export type SubmitOnboardingResult = { error: string } | { success: true }

// Deliberately never calls redirect() - it throws a framework control-flow
// exception (NEXT_REDIRECT) that this action's caller (OnboardingForm) needs
// to distinguish from a real failure while still being able to show a
// success state before navigating. Returning a plain result and letting the
// client redirect (via useRouter) keeps "generation succeeded" and
// "generation threw" unambiguous on the client, instead of relying on the
// caller correctly special-casing the redirect digest.
export async function submitOnboarding(formData: FormData): Promise<SubmitOnboardingResult> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()

  // Explicit "start a new meal plan" flow (Settings -> /onboarding?newPlan=true).
  // Signalled through the submitted form so it survives the client-rendered,
  // no-page-reload wizard between page load and final submission.
  const isNewPlanFlow = formData.get('newPlan') === 'true'

  // Prevent duplicate diet generation - Check 1: Existing Plans
  const { data: existingPlans } = await supabase
    .from('diet_plans')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)

  const previousPlanId = existingPlans?.[0]?.id ?? null

  if (previousPlanId && !isNewPlanFlow) {
    // Already onboarded, and this is normal/direct onboarding access rather
    // than an intentional new-plan request - existing behavior, unchanged,
    // just returned instead of thrown so the client can navigate itself.
    const cookieStore = await cookies()
    cookieStore.set('gym_meals_onboarded', 'true', { path: '/' })
    return { success: true }
  }

  // Prevent duplicate diet generation - Check 2: Optimistic Concurrency Lock
  const lockResult = await acquireGenerationLock(supabase, user.id)
  if (!lockResult.ok) return { error: lockResult.error }

  // Parse inputs
  const calories = parseInt(formData.get('calories') as string)
  const protein = parseInt(formData.get('protein') as string)
  const carbs = parseInt(formData.get('carbsTarget') as string)
  const fat = parseInt(formData.get('fat') as string)
  const mealsCount = parseInt(formData.get('meals') as string)
  
  const proteinsList = JSON.parse(formData.get('proteins') as string || '[]')
  const carbsList = JSON.parse(formData.get('carbFoodIds') as string || '[]')
  const fatsList = JSON.parse(formData.get('fats') as string || '[]')

  if (!calories || !protein || !carbs || !fat || !mealsCount) {
    return { error: 'Missing macro targets' }
  }

  if (proteinsList.length === 0 || carbsList.length === 0 || fatsList.length === 0) {
    return { error: 'Must provide at least one food ID for each category.' }
  }

  const allRequestedIds = [...new Set([...proteinsList, ...carbsList, ...fatsList])]

  // Fetch foods from DB to use in prompt
  const { data: dbFoods, error: dbError } = await supabase
    .from('food_database')
    .select('*')
    .in('id', allRequestedIds)
    .eq('is_active', true)

  if (dbError || !dbFoods || dbFoods.length !== allRequestedIds.length) {
    return { error: 'One or more requested foods are inactive or do not exist.' }
  }

  const genResult = await generateValidatedDiet({
    dbFoods: dbFoods as unknown as FoodOption[],
    calories,
    protein,
    carbs,
    fat,
    mealsCount
  })

  if ('error' in genResult) {
    return { error: genResult.error }
  }

  const finalValidatedDiet = genResult.diet

  // 1. Insert Diet Plan. When replacing an existing active plan (new-plan
  // flow), the new row must start inactive - a unique DB index
  // (diet_plans_one_active_per_user) allows at most one is_active=true row
  // per user, so it can't be inserted active while the old one still is.
  // It's flipped to active only after being fully built out below. A
  // first-time plan (no previousPlanId) has no such conflict and can be
  // inserted active immediately, exactly as before.
  const { data: newPlan, error: insertPlanError } = await supabase
    .from('diet_plans')
    .insert({
      user_id: user.id,
      name: finalValidatedDiet.name,
      calories_target: calories,
      protein_target: protein,
      carbs_target: carbs,
      fat_target: fat,
      is_active: !previousPlanId
    })
    .select()
    .single()

  if (insertPlanError || !newPlan) {
    return { error: 'Failed to save diet plan.' }
  }

  // Transaction fallback using manual rollback
  try {
    for (const meal of finalValidatedDiet.meals) {
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

      const foodsToInsert = meal.foods.map((food, idx: number) => ({
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

      const { error: foodsError } = await supabase.from('foods').insert(foodsToInsert)
      if (foodsError) throw new Error('Food insert failed')
    }

    // Set cookie to speed up middleware
    const cookieStore = await cookies()
    cookieStore.set('gym_meals_onboarded', 'true', {
      path: '/',
      secure: process.env.NODE_ENV !== 'development',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365
    })

  } catch {
    // Rollback diet plan. The previous plan (if any) was never touched by
    // this branch, so it remains fully intact.
    await supabase.from('diet_plans').delete().eq('id', newPlan.id)
    return { error: 'Failed to save meals. Rolling back.' }
  }

  // Activate: only now that the new plan is fully and successfully persisted
  // do we hand off "active" status (new-plan flow only). The previous plan is
  // NOT deleted - it becomes plan history (is_active=false), visible under
  // "Previous Plans" on the dashboard. Old is deactivated before the new one
  // is activated so the two updates never violate the one-active-per-user
  // unique index (both is_active=false momentarily is always valid).
  if (previousPlanId) {
    await supabase.from('diet_plans').update({ is_active: false }).eq('id', previousPlanId)
    await supabase.from('diet_plans').update({ is_active: true }).eq('id', newPlan.id)
  }

  // Update profile modified_at just in case
  await supabase.from('profiles').update({ updated_at: new Date().toISOString() }).eq('id', user.id)

  return { success: true }
}
