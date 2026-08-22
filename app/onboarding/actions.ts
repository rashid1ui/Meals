'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { getUser } from '@/lib/auth/get-user'
import { generateValidatedDiet, type FoodOption } from '@/lib/diet/generate-diet'
import { acquireGenerationLock } from '@/lib/diet/generation-lock'
import { isValidHeightCm, HEIGHT_CM_MIN, HEIGHT_CM_MAX } from '@/lib/nutrition/engine'
import { isValidReminderTime } from '@/lib/notifications/schedule'

interface RemindersSubmission {
  enabled: boolean
  timezone?: string | null
  perMeal?: { time?: string; enabled?: boolean }[]
}

const VALID_TRAINING_TIMES = ['morning', 'afternoon', 'evening', 'custom'] as const
const VALID_SUPPLEMENT_TYPES = ['whey', 'creatine', 'other'] as const

interface TrainingNutritionSubmission {
  trainingTime?: (typeof VALID_TRAINING_TIMES)[number] | null
  trainingTimeCustom?: string | null
  supplementType?: (typeof VALID_SUPPLEMENT_TYPES)[number] | null
  proteinBrand?: string | null
  proteinServingLabel?: string | null
  proteinPerServingG?: number | null
}

// Roughly the canonical-gram weight of "1 serving" for a whey supplement
// food_database row (see the food_database.protein_type='supplement' insert
// below). The app has no real scale reading for a scoop - this number only
// exists so the existing display_unit='serving' / grams_per_display_unit
// conversion (lib/nutrition/units.ts) has a basis to convert against; the
// user always sees "1 serving", never this raw gram figure.
const SUPPLEMENT_SERVING_CANONICAL_GRAMS = 30

function escapeForIlike(value: string): string {
  return value.replace(/[%_\\]/g, ch => `\\${ch}`)
}

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

  // Nutrition Engine output (lib/nutrition/engine.ts, computed client-side in
  // OnboardingForm). Both are optional - absent whenever the user hit "Skip"
  // on the Profile step, in which case this submission behaves exactly like
  // today's pure manual-entry flow with no profile/goal data written at all.
  const nutritionProfileRaw = formData.get('nutritionProfile') as string | null
  const nutritionTargetMetaRaw = formData.get('nutritionTargetMeta') as string | null
  const nutritionProfile = nutritionProfileRaw ? JSON.parse(nutritionProfileRaw) : null
  const nutritionTargetMeta = nutritionTargetMetaRaw ? JSON.parse(nutritionTargetMetaRaw) : null

  // Reminders (RemindersStep, computed client-side). Optional/best-effort -
  // an absent or malformed entry never blocks diet generation, it just
  // leaves that meal with no reminder configured (reminder_time: null),
  // same "degrade gracefully, don't fail the submission" treatment as the
  // rest of this non-critical, non-nutrition-math input.
  const remindersRaw = formData.get('reminders') as string | null
  let reminders: RemindersSubmission | null = null
  try {
    reminders = remindersRaw ? JSON.parse(remindersRaw) : null
  } catch {
    reminders = null
  }

  // Training Nutrition Setup (TrainingNutritionStep). Same best-effort,
  // never-blocks-generation treatment as reminders above - a malformed or
  // absent payload just means these optional fields aren't saved this run.
  const trainingNutritionRaw = formData.get('trainingNutrition') as string | null
  let trainingNutrition: TrainingNutritionSubmission | null = null
  try {
    trainingNutrition = trainingNutritionRaw ? JSON.parse(trainingNutritionRaw) : null
  } catch {
    trainingNutrition = null
  }
  if (trainingNutrition?.trainingTime && !VALID_TRAINING_TIMES.includes(trainingNutrition.trainingTime)) {
    trainingNutrition.trainingTime = null
  }
  if (trainingNutrition?.supplementType && !VALID_SUPPLEMENT_TYPES.includes(trainingNutrition.supplementType)) {
    trainingNutrition.supplementType = null
  }

  // Defense in depth: ProfileStep/OnboardingForm already gate this in the
  // browser, but a request can reach a server action directly (bypassing
  // client JS entirely), and this value gets persisted to profiles.height_cm
  // for reuse by future calculator runs - an invalid height here would
  // silently corrupt every BMR/TDEE/calorie/macro number derived from it,
  // now or later. Checked before any DB write or the (slow) AI generation
  // call, not after.
  if (nutritionProfile && !isValidHeightCm(nutritionProfile.heightCm)) {
    return { error: `Height must be a whole number between ${HEIGHT_CM_MIN} and ${HEIGHT_CM_MAX} cm.` }
  }

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

  // ── Supplement handling (whey protein) ──────────────────────────────────
  // Create/find the supplement food_database entry BEFORE AI generation so we
  // can: (a) exclude it from the AI's food pool, and (b) subtract its fixed
  // macro contribution from the targets the AI solves for. The supplement is
  // appended as a dedicated meal AFTER generation, ensuring it appears exactly
  // once at the user's configured serving size — never randomly split by the AI.
  let supplementFoodId: string | null = null
  let supplementName = ''
  let supplementProtein = 0
  let supplementCalories = 0
  const supplementFoodIds = new Set<string>()

  const isWheyConfigured =
    trainingNutrition?.supplementType === 'whey' &&
    trainingNutrition.proteinServingLabel?.trim() &&
    typeof trainingNutrition.proteinPerServingG === 'number' &&
    isFinite(trainingNutrition.proteinPerServingG) &&
    trainingNutrition.proteinPerServingG > 0 &&
    trainingNutrition.proteinPerServingG <= 200

  if (isWheyConfigured) {
    supplementProtein = trainingNutrition!.proteinPerServingG!
    supplementCalories = supplementProtein * 4
    const brand = trainingNutrition!.proteinBrand?.trim()
    supplementName = brand ? `${brand} Whey Protein` : 'Whey Protein'
    const proteinPer100 = (supplementProtein / SUPPLEMENT_SERVING_CANONICAL_GRAMS) * 100
    const caloriesPer100 = proteinPer100 * 4

    // Idempotent create-or-reuse (same pattern as food-actions.ts)
    const { data: existingSupplementFood } = await supabase
      .from('food_database')
      .select('id')
      .ilike('name', escapeForIlike(supplementName))
      .limit(1)
      .maybeSingle()

    supplementFoodId = existingSupplementFood?.id ?? null
    if (!supplementFoodId) {
      const { data: newSupplementFood, error: supplementInsertError } = await supabase
        .from('food_database')
        .insert({
          name: supplementName,
          category: 'protein',
          protein_type: 'supplement',
          serving_size: 100,
          serving_unit: 'grams',
          calories: caloriesPer100,
          protein: proteinPer100,
          carbs: 0,
          fat: 0,
          display_unit: 'serving',
          grams_per_display_unit: SUPPLEMENT_SERVING_CANONICAL_GRAMS,
          is_active: true
        })
        .select('id')
        .single()

      if (supplementInsertError?.code === '23505') {
        const { data: raceWinner } = await supabase
          .from('food_database')
          .select('id')
          .ilike('name', escapeForIlike(supplementName))
          .maybeSingle()
        supplementFoodId = raceWinner?.id ?? null
      } else {
        supplementFoodId = newSupplementFood?.id ?? null
      }
    }

    if (supplementFoodId) {
      supplementFoodIds.add(supplementFoodId)
    }
  }

  // Also exclude any other food_database rows with protein_type='supplement'
  // that the user may have selected as a regular food — prevents the AI from
  // distributing supplement foods across random meals.
  const otherSupplements: FoodOption[] = []
  for (const f of dbFoods) {
    if ((f as Record<string, unknown>).protein_type === 'supplement' && f.id !== supplementFoodId) {
      supplementFoodIds.add(f.id)
      otherSupplements.push(f as unknown as FoodOption)
    }
  }

  // Subtract the supplement's fixed macro contribution from the AI's targets
  // so the regular foods fill the remaining budget. The supplement meal is
  // appended after generation, making the total = solved + supplement = original.
  const aiCalories = supplementFoodId ? Math.max(0, calories - supplementCalories) : calories
  const aiProtein = supplementFoodId ? Math.max(0, protein - supplementProtein) : protein

  // Resolve training time for workout-aware meal naming
  const resolvedTrainingTime = trainingNutrition?.trainingTime ?? null

  const genResult = await generateValidatedDiet({
    dbFoods: dbFoods as unknown as FoodOption[],
    calories: aiCalories,
    protein: aiProtein,
    carbs,
    fat,
    mealsCount,
    supplementFoodIds: supplementFoodIds.size > 0 ? supplementFoodIds : undefined,
    trainingTime: resolvedTrainingTime
  })

  if ('error' in genResult) {
    return { error: genResult.error }
  }

  const finalValidatedDiet = genResult.diet

  // Append supplements. For training users, place them inside the Post-Workout
  // Meal if one exists; otherwise create a standalone "Supplements" meal.
  const hasOtherSupplements = otherSupplements.length > 0
  if ((supplementFoodId && isWheyConfigured) || hasOtherSupplements) {
    const postWorkoutMeal = resolvedTrainingTime
      ? finalValidatedDiet.meals.find(m => m.name === 'Post-Workout Meal')
      : null

    const mealToAppendTo = postWorkoutMeal || {
      name: 'Supplements',
      sort_order: finalValidatedDiet.meals.length,
      foods: [],
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0
    }
    
    if (!postWorkoutMeal) {
      finalValidatedDiet.meals.push(mealToAppendTo)
    }

    if (supplementFoodId && isWheyConfigured && !mealToAppendTo.foods.some(f => f.food_id === supplementFoodId)) {
      mealToAppendTo.foods.push({
        food_id: supplementFoodId,
        name: supplementName,
        quantity: SUPPLEMENT_SERVING_CANONICAL_GRAMS,
        unit: 'grams',
        calories: supplementCalories,
        protein: supplementProtein,
        carbs: 0,
        fat: 0
      })
      mealToAppendTo.calories += supplementCalories
      mealToAppendTo.protein += supplementProtein
    }

    // Append any other supplements (like Creatine) WITHOUT adding to meal macros
    // (since they essentially have 0 impact on macro targets)
    for (const otherSupp of otherSupplements) {
      if (!mealToAppendTo.foods.some(f => f.food_id === otherSupp.id)) {
        mealToAppendTo.foods.push({
          food_id: otherSupp.id,
          name: otherSupp.name,
          quantity: 5, // typical creatine serving size in grams
          unit: 'grams',
          calories: 0, // Exclude from totals as requested
          protein: 0,
          carbs: 0,
          fat: 0
        })
      }
    }
  }

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
      is_active: !previousPlanId,
      // Nutrition Engine provenance - all NULL when nutritionTargetMeta is
      // absent (manual entry / "Skip"), matching today's behavior exactly.
      goal: nutritionTargetMeta?.goal ?? null,
      estimated_maintenance_calories: nutritionTargetMeta?.estimatedMaintenanceCalories ?? null,
      calorie_adjustment_percent: nutritionTargetMeta?.calorieAdjustmentPercent ?? null,
      protein_g_per_kg: nutritionTargetMeta?.proteinGramsPerKg ?? null,
      fat_g_per_kg: nutritionTargetMeta?.fatGramsPerKg ?? null,
      target_weekly_rate_percent: nutritionTargetMeta?.targetWeeklyRatePercent ?? null,
      calculation_version: nutritionTargetMeta?.calculationVersion ?? null,
      targets_source: nutritionTargetMeta?.targetsSource ?? null
    })
    .select()
    .single()

  if (insertPlanError || !newPlan) {
    return { error: 'Failed to save diet plan.' }
  }

  // Transaction fallback using manual rollback
  try {
    for (const meal of finalValidatedDiet.meals) {
      // Reminders were collected by POSITION during onboarding (meal names
      // don't exist until this AI generation step returns them) - matched
      // back up here via sort_order. A bad/missing entry never blocks plan
      // creation, it just leaves that meal reminder-less.
      const reminderForMeal = reminders?.perMeal?.[meal.sort_order]
      const reminderTime =
        reminderForMeal?.time && isValidReminderTime(reminderForMeal.time) ? reminderForMeal.time : null
      const reminderEnabled = reminderForMeal ? Boolean(reminderForMeal.enabled) : true

      const { data: newMeal, error: insertMealError } = await supabase
        .from('meals')
        .insert({
          user_id: user.id,
          diet_plan_id: newPlan.id,
          name: meal.name,
          sort_order: meal.sort_order,
          reminder_time: reminderTime,
          reminder_enabled: reminderEnabled
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

  // Best-effort: never blocks/rolls back the already-fully-persisted plan
  // above. Only written when the wizard actually submitted a reminders
  // payload - an old client or a defensive-missing field leaves whatever
  // notification_preferences row (or lack of one) the user already had
  // untouched, rather than silently overwriting it with all-disabled.
  if (reminders) {
    const { error: prefsError } = await supabase.from('notification_preferences').upsert(
      {
        user_id: user.id,
        reminders_enabled: reminders.enabled,
        timezone: reminders.timezone ?? null,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id' }
    )
    if (prefsError) {
      console.error('[onboarding] failed to save notification preferences:', prefsError)
    }
  }

  // Update profile modified_at just in case, plus biometrics if the
  // Nutrition Engine was used (see the "skip" comment above for why this is
  // conditional - a manual-entry submission must not overwrite/erase any
  // biometrics the user may have saved on a previous, calculator-driven run).
  await supabase
    .from('profiles')
    .update({
      updated_at: new Date().toISOString(),
      ...(nutritionProfile
        ? {
            sex: nutritionProfile.sex,
            age: nutritionProfile.age,
            weight_kg: nutritionProfile.weightKg,
            height_cm: nutritionProfile.heightCm,
            activity_level: nutritionProfile.activityLevel,
            training_days_per_week: nutritionProfile.trainingDaysPerWeek,
            body_fat_percent: nutritionProfile.bodyFatPercent,
            average_daily_steps: nutritionProfile.averageDailySteps,
            current_calorie_intake: nutritionProfile.currentCalorieIntake
          }
        : {}),
      // Training Nutrition Setup - saved whenever the wizard submitted a
      // payload, same conditional treatment as nutritionProfile above (an
      // old client or a defensive-missing field leaves whatever the user
      // already had untouched rather than overwriting it with nulls).
      ...(trainingNutrition
        ? {
            training_time: trainingNutrition.trainingTime ?? null,
            training_time_custom:
              trainingNutrition.trainingTime === 'custom' &&
              trainingNutrition.trainingTimeCustom &&
              isValidReminderTime(trainingNutrition.trainingTimeCustom)
                ? trainingNutrition.trainingTimeCustom
                : null,
            uses_supplements: Boolean(trainingNutrition.supplementType),
            supplement_type: trainingNutrition.supplementType ?? null,
            protein_brand: trainingNutrition.supplementType === 'whey' ? trainingNutrition.proteinBrand ?? null : null,
            protein_serving_label:
              trainingNutrition.supplementType === 'whey' ? trainingNutrition.proteinServingLabel ?? null : null,
            protein_per_serving_g:
              trainingNutrition.supplementType === 'whey' &&
              typeof trainingNutrition.proteinPerServingG === 'number' &&
              isFinite(trainingNutrition.proteinPerServingG)
                ? trainingNutrition.proteinPerServingG
                : null
          }
        : {})
    })
    .eq('id', user.id)

  return { success: true }
}
