'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { getUser } from '@/lib/auth/get-user'
import type { FoodMacro } from '@/lib/nutrition/calculator'
import {
  validateMealsShape,
  resolveMeal,
  type SaveDietPlanPayload,
  type ResolvedMeal,
  type OriginalFoodRecord
} from '@/lib/diet/save-plan'
import { isValidHeightCm, HEIGHT_CM_MIN, HEIGHT_CM_MAX, validateMacroValues, type Goal } from '@/lib/nutrition/engine'
import { isValidReminderTime } from '@/lib/notifications/schedule'
import { validateSupplementSetup, findDuplicateSupplementType } from '@/lib/diet/supplements'
import { ensureSupplementCatalogRow, type EnsuredSupplementFood } from '@/lib/diet/supplement-catalog'
import { acquireManualPlanLock, releaseManualPlanLock } from '@/lib/diet/manual-plan-lock'
import type { SupplementSetup } from '@/lib/types'

const VALID_TRAINING_TIMES = ['morning', 'afternoon', 'evening', 'custom'] as const

// Same server-side bounds as app/onboarding/actions.ts's submitOnboarding -
// see that file's comment for why these exist (defense in depth against a
// request that bypasses the client entirely).
const MIN_AGE = 1
const MAX_AGE = 119
const MIN_TRAINING_DAYS = 0
const MAX_TRAINING_DAYS = 7

export interface ManualPlanTargets {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface ManualNutritionProfileMeta {
  sex: string
  age: number
  weightKg: number | null
  heightCm: number | null
  activityLevel: string
  trainingDaysPerWeek: number
  bodyFatPercent: number | null
  averageDailySteps: number | null
  currentCalorieIntake: number | null
}

export interface ManualNutritionTargetMeta {
  goal: Goal
  targetsSource: 'recommended' | 'custom'
  estimatedMaintenanceCalories: number
  calorieAdjustmentPercent: number
  proteinGramsPerKg: number
  fatGramsPerKg: number
  targetWeeklyRatePercent: number
  calculationVersion: string
}

export interface ManualTrainingNutritionMeta {
  trainingTime: (typeof VALID_TRAINING_TIMES)[number] | null
  trainingTimeCustom: string | null
  supplements: SupplementSetup[]
}

export interface CreateManualDietPlanMeta {
  targets: ManualPlanTargets
  nutritionProfile: ManualNutritionProfileMeta | null
  nutritionTargetMeta: ManualNutritionTargetMeta | null
  trainingNutrition: ManualTrainingNutritionMeta | null
  isNewPlanFlow: boolean
}

export interface CreatedMeal {
  id: string
  name: string
  sortOrder: number
}

export type CreateManualDietPlanResult = { success: true; meals: CreatedMeal[] } | { error: string }

// Creates the user's FIRST plan entirely by hand - no AI call, no
// generation lock (deterministic and fast, see the plan doc). Structure
// mirrors submitOnboarding (app/onboarding/actions.ts) for the parts that
// carry over (idempotency guard, profile/training-nutrition persistence) and
// saveDietPlan (app/dashboard/actions.ts) for the "insert new tree, verify
// server-side" pattern - simpler here since there's no AI output to merge
// and (for a first-time user) no old tree to preserve reminder times from.
export async function createManualDietPlan(
  payload: SaveDietPlanPayload,
  meta: CreateManualDietPlanMeta
): Promise<CreateManualDietPlanResult> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()

  // Dedicated manual-plan lock (never the AI generation lock - see
  // lib/diet/manual-plan-lock.ts's own comment on why they're separate).
  // Held for the ENTIRE rest of this function so a rapid double-click, two
  // open tabs, or a retried request racing its own earlier attempt can
  // never both pass the idempotency check below and both attempt an insert -
  // the loser gets a clear "already being processed" error instead of a
  // confusing generic failure from the diet_plans_one_active_per_user
  // unique-index race that guard alone used to leave as the only backstop.
  const lock = await acquireManualPlanLock(supabase, user.id)
  if (!lock.ok) return { error: lock.error }

  try {
    return await createManualDietPlanLocked(supabase, user.id, payload, meta)
  } finally {
    await releaseManualPlanLock(supabase, user.id)
  }
}

async function createManualDietPlanLocked(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  payload: SaveDietPlanPayload,
  meta: CreateManualDietPlanMeta
): Promise<CreateManualDietPlanResult> {
  const user = { id: userId }

  // Idempotency guard, identical to submitOnboarding's Check 1: never
  // silently overwrite/duplicate an existing active plan outside an explicit
  // regenerate flow.
  const { data: existingPlans } = await supabase
    .from('diet_plans')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)

  const previousPlanId = existingPlans?.[0]?.id ?? null

  if (previousPlanId && !meta.isNewPlanFlow) {
    // The normal UI flow can't reach this (step 9 has no "back" to step 8),
    // so this only fires from a genuinely stale session - e.g. the user
    // already completed onboarding in another tab, or navigated back to
    // /onboarding without the ?newPlan=true flag while already having an
    // active plan. Previously this silently returned {success:true,
    // meals:[]} - the caller then walked the user through an empty,
    // meal-less Reminders screen and declared "success" with no
    // indication that nothing new was actually created. Now it fails
    // loudly with a specific, actionable message instead, so the user
    // knows exactly what happened and how to actually replace their plan
    // if that's what they meant to do.
    return {
      error:
        'You already have an active meal plan. Refresh the page to go to your Dashboard, or use Settings > Generate New Plan if you want to replace it.'
    }
  }

  const shapeError = validateMealsShape(payload.meals)
  if (shapeError) return { error: shapeError }

  const macroCheck = validateMacroValues(meta.targets)
  if (!macroCheck.valid) return { error: macroCheck.errors[0] }

  // Defense in depth on the optional Nutrition Engine payload - same checks
  // submitOnboarding applies before ever writing to profiles.
  if (meta.nutritionProfile) {
    if (!isValidHeightCm(meta.nutritionProfile.heightCm ?? NaN)) {
      return { error: `Height must be a whole number between ${HEIGHT_CM_MIN} and ${HEIGHT_CM_MAX} cm.` }
    }
    const age = Number(meta.nutritionProfile.age)
    if (!Number.isFinite(age) || age < MIN_AGE || age > MAX_AGE) {
      return { error: `Age must be a number between ${MIN_AGE} and ${MAX_AGE}.` }
    }
    const trainingDays = Number(meta.nutritionProfile.trainingDaysPerWeek)
    if (!Number.isFinite(trainingDays) || trainingDays < MIN_TRAINING_DAYS || trainingDays > MAX_TRAINING_DAYS) {
      return { error: `Training days per week must be between ${MIN_TRAINING_DAYS} and ${MAX_TRAINING_DAYS}.` }
    }
  }

  // Sanitize the training/supplement payload before it's ever written to
  // profiles - same validation submitOnboarding applies. The food_database
  // row for each configured supplement is materialized earlier, by
  // ensureManualSupplementFoods below (called when the user finishes the
  // Training & Supplements step, before they ever reach the Meal Builder) -
  // by the time this function runs, the user has already added those rows
  // to their meals as regular food items via the manual builder's food
  // library, exactly like anything else.
  let trainingNutrition = meta.trainingNutrition
  if (trainingNutrition?.trainingTime && !VALID_TRAINING_TIMES.includes(trainingNutrition.trainingTime)) {
    trainingNutrition = { ...trainingNutrition, trainingTime: null }
  }
  if (trainingNutrition?.supplements) {
    const filteredSupplements = trainingNutrition.supplements.filter(s => ['whey', 'creatine', 'other'].includes(s.type))
    trainingNutrition = { ...trainingNutrition, supplements: filteredSupplements }

    const duplicateType = findDuplicateSupplementType(trainingNutrition.supplements)
    if (duplicateType) {
      return { error: `You can only configure one ${duplicateType} supplement. Please remove the duplicate and try again.` }
    }
    for (const supp of trainingNutrition.supplements) {
      const validationError = validateSupplementSetup(supp)
      if (validationError) return { error: validationError }
    }
  }

  // Never trust client-submitted macro numbers: re-verify every submitted
  // foodDatabaseId against a fresh food_database query. The OR mirrors the
  // 0014 RLS SELECT policy exactly (active foods, plus supplement rows which
  // are always is_active=false) so a supplement added from the manual
  // builder's food library resolves correctly here too.
  const foodDatabaseIds = Array.from(new Set(
    payload.meals.flatMap(m => m.foods.map(f => f.foodDatabaseId).filter((id): id is string => !!id))
  ))

  const foodDatabaseById = new Map<string, FoodMacro>()
  if (foodDatabaseIds.length > 0) {
    const { data: dbFoods, error: dbFoodsError } = await supabase
      .from('food_database')
      .select('*')
      .in('id', foodDatabaseIds)
      .or('is_active.eq.true,category.eq.supplement')

    if (dbFoodsError || !dbFoods || dbFoods.length !== foodDatabaseIds.length) {
      return { error: 'One or more selected foods are inactive or no longer exist. Please refresh and try again.' }
    }
    for (const f of dbFoods) foodDatabaseById.set(f.id, f as FoodMacro)
  }

  // A from-scratch manual plan never has "locked" items (originalFoodId set,
  // foodDatabaseId null) - there is no pre-existing `foods` row for a brand
  // new plan to lock to. Passed through resolveMeal anyway so a malformed
  // client payload that does send one is rejected the same way saveDietPlan
  // rejects it, rather than silently accepted.
  const originalFoodsById = new Map<string, OriginalFoodRecord>()

  const resolvedMeals: ResolvedMeal[] = []
  for (const meal of payload.meals) {
    const result = resolveMeal(meal, foodDatabaseById, originalFoodsById)
    if ('error' in result) return { error: result.error }
    resolvedMeals.push(result.meal)
  }

  // Insert Diet Plan. Inserted inactive when replacing an existing active
  // plan (new-plan flow) - the unique diet_plans_one_active_per_user index
  // allows only one is_active=true row per user - and activated only after
  // it's fully persisted below, same two-step ordering submitOnboarding uses.
  const { data: newPlan, error: insertPlanError } = await supabase
    .from('diet_plans')
    .insert({
      user_id: user.id,
      name: 'My Meal Plan',
      calories_target: meta.targets.calories,
      protein_target: meta.targets.protein,
      carbs_target: meta.targets.carbs,
      fat_target: meta.targets.fat,
      is_active: !previousPlanId,
      // Built entirely by hand, with no AI generation step ever involved -
      // see migration 0017_diet_plans_plan_source_user_created.sql.
      plan_source: 'user_created',
      goal: meta.nutritionTargetMeta?.goal ?? null,
      estimated_maintenance_calories: meta.nutritionTargetMeta?.estimatedMaintenanceCalories ?? null,
      calorie_adjustment_percent: meta.nutritionTargetMeta?.calorieAdjustmentPercent ?? null,
      protein_g_per_kg: meta.nutritionTargetMeta?.proteinGramsPerKg ?? null,
      fat_g_per_kg: meta.nutritionTargetMeta?.fatGramsPerKg ?? null,
      target_weekly_rate_percent: meta.nutritionTargetMeta?.targetWeeklyRatePercent ?? null,
      calculation_version: meta.nutritionTargetMeta?.calculationVersion ?? null,
      targets_source: meta.nutritionTargetMeta?.targetsSource ?? null
    })
    .select()
    .single()

  if (insertPlanError || !newPlan) {
    console.error('[manual-onboarding] failed to insert diet plan:', insertPlanError)
    return { error: 'Failed to save diet plan.' }
  }

  // Manual rollback on failure - same pattern as submitOnboarding/saveDietPlan.
  const createdMeals: CreatedMeal[] = []
  try {
    for (let i = 0; i < resolvedMeals.length; i++) {
      const meal = resolvedMeals[i]
      const { data: newMeal, error: insertMealError } = await supabase
        .from('meals')
        .insert({
          user_id: user.id,
          diet_plan_id: newPlan.id,
          name: meal.name,
          sort_order: i,
          // Insert-time defaults only - the manual builder's meal count/names
          // aren't fixed until this point, so reminders can't be collected
          // up front the way the AI path does. Once these real meal ids
          // exist, the caller (OnboardingForm's step 9, "Meal Reminders")
          // configures actual values against them via saveMealReminders
          // below - addressed directly by id, no position/name matching
          // needed.
          reminder_time: null,
          reminder_enabled: true
        })
        .select()
        .single()

      if (insertMealError || !newMeal) throw new Error('Meal insert failed')
      createdMeals.push({ id: newMeal.id, name: newMeal.name, sortOrder: newMeal.sort_order })

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

        const { error: foodsError } = await supabase.from('foods').insert(foodsToInsert)
        if (foodsError) throw new Error('Food insert failed')
      }
    }

    const cookieStore = await cookies()
    cookieStore.set('gym_meals_onboarded', 'true', {
      path: '/',
      secure: process.env.NODE_ENV !== 'development',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365
    })
  } catch (err) {
    console.error('[manual-onboarding] failed to save meals/foods, rolling back:', err)
    await supabase.from('diet_plans').delete().eq('id', newPlan.id)
    return { error: 'Failed to save meals. Rolling back.' }
  }

  // Activate: only once the new plan is fully and successfully persisted.
  // The previous plan is kept as plan history (is_active=false), same as
  // submitOnboarding. Both updates now run as ONE atomic transaction
  // (activate_plan_history_swap, migration
  // 0021_activate_plan_history_swap_function.sql) instead of two separate
  // calls, so a crash/timeout between them can never leave the user with
  // zero active plans - if the swap fails, the previous plan is still
  // active, exactly as before this call.
  if (previousPlanId) {
    const { error: swapError } = await supabase.rpc('activate_plan_history_swap', {
      p_old_plan_id: previousPlanId,
      p_new_plan_id: newPlan.id
    })
    if (swapError) {
      console.error('[manual-onboarding] failed to activate new plan:', swapError)
      return { error: 'Your new meal plan was created, but we could not switch you over to it. Please try again from Settings.' }
    }
  }

  // Update profile biometrics (if the Nutrition Engine was used) and
  // training/supplement fields - exact same conditional field list and
  // backward-compat legacy-column writes as submitOnboarding's final update.
  const { error: profileUpdateError } = await supabase
    .from('profiles')
    .update({
      updated_at: new Date().toISOString(),
      ...(meta.nutritionProfile
        ? {
            sex: meta.nutritionProfile.sex,
            age: meta.nutritionProfile.age,
            weight_kg: meta.nutritionProfile.weightKg,
            height_cm: meta.nutritionProfile.heightCm,
            activity_level: meta.nutritionProfile.activityLevel,
            training_days_per_week: meta.nutritionProfile.trainingDaysPerWeek,
            body_fat_percent: meta.nutritionProfile.bodyFatPercent,
            average_daily_steps: meta.nutritionProfile.averageDailySteps,
            current_calorie_intake: meta.nutritionProfile.currentCalorieIntake
          }
        : {}),
      ...(trainingNutrition
        ? {
            training_time: trainingNutrition.trainingTime ?? null,
            training_time_custom:
              trainingNutrition.trainingTime === 'custom' &&
              trainingNutrition.trainingTimeCustom &&
              isValidReminderTime(trainingNutrition.trainingTimeCustom)
                ? trainingNutrition.trainingTimeCustom
                : null,
            uses_supplements: (trainingNutrition?.supplements?.length ?? 0) > 0,
            supplement_type: trainingNutrition?.supplements?.[0]?.type ?? null,
            protein_brand: trainingNutrition?.supplements?.[0]?.brand ?? null,
            protein_serving_label: trainingNutrition?.supplements?.[0]?.serving_label ?? null,
            protein_per_serving_g: trainingNutrition?.supplements?.[0]?.amount_per_serving_g ?? null,
            supplements: trainingNutrition?.supplements ?? []
          }
        : {})
    })
    .eq('id', user.id)

  if (profileUpdateError) {
    console.error('[manual-onboarding] failed to update profile (including supplements):', profileUpdateError)
    return {
      error:
        'Your meal plan was created, but we could not save your profile details (including supplements). Please try Settings > Generate New Plan again.'
    }
  }

  return { success: true, meals: createdMeals }
}

// Configures reminder times against the plan's real, already-persisted
// meals - runs only after createManualDietPlan above has fully succeeded
// (OnboardingForm's step 9, "Meal Reminders"). Addressed directly by
// meals.id, unlike the AI path's sort_order-keyed matching in
// submitOnboarding (needed there only because AI-generated meal names don't
// exist yet at reminder-collection time) - the manual builder's meals are
// already real rows with real names by this point, so no matching heuristic
// is needed at all.
export interface MealReminderInput {
  mealId: string
  time: string | null
  enabled: boolean
}

export type SaveMealRemindersResult = { success: true } | { error: string }

export async function saveMealReminders(
  mealReminders: MealReminderInput[],
  remindersEnabled: boolean,
  timezone: string | null
): Promise<SaveMealRemindersResult> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()

  for (const entry of mealReminders) {
    const reminderTime = entry.time && isValidReminderTime(entry.time) ? entry.time : null
    // Ownership-scoped (user_id = user.id) - mirrors every other per-row
    // write in this codebase (see saveDietPlan/submitOnboarding) so one
    // user's reminder update can never reach another user's meal row.
    const { error: updateError } = await supabase
      .from('meals')
      .update({ reminder_time: reminderTime, reminder_enabled: Boolean(entry.enabled) })
      .eq('id', entry.mealId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('[manual-onboarding] failed to save a meal reminder:', updateError)
      return { error: 'Your plan was saved, but we could not save your reminder times. You can set them later in Settings.' }
    }
  }

  const { error: prefsError } = await supabase.from('notification_preferences').upsert(
    {
      user_id: user.id,
      reminders_enabled: remindersEnabled,
      timezone: timezone ?? null,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'user_id' }
  )

  if (prefsError) {
    console.error('[manual-onboarding] failed to save notification preferences:', prefsError)
    return { error: 'Your plan was saved, but we could not save your reminder preferences. You can set them later in Settings.' }
  }

  return { success: true }
}

export interface EnsuredSupplementFoodOption {
  id: string
  name: string
  category: 'supplement'
  serving_size: number
  serving_unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  protein_type: 'supplement'
  carb_type: null
  display_unit: 'serving'
  grams_per_display_unit: number
}

export type EnsureManualSupplementFoodsResult = { data: EnsuredSupplementFoodOption[] } | { error: string }

// Called when the user finishes the Training & Supplements step of the
// Manual Meal Builder path (before they reach the Meal Builder step itself),
// so their configured whey/creatine/other supplement immediately appears in
// the Manual Meal Builder's food library's Supplements tab - without this,
// the food_database row was never created for the manual path at all (see
// migration 0018_food_database_expand_catalog.sql's own comment: "That left
// the user's own real whey/creatine invisible to the manual food picker"),
// so a user had no way to log their configured supplement without manually
// re-entering the exact same brand/serving data a second time via "Add a
// new food."
//
// Shares the exact same create-or-reuse catalog logic the AI path uses
// (lib/diet/supplement-catalog.ts's ensureSupplementCatalogRow) - a manually
// configured supplement resolves to the same catalog row an equivalent
// AI-path configuration would, and this is idempotent: calling it again
// with the same configuration (e.g. the user navigates back and forth
// between onboarding steps) returns the same food_database row rather than
// creating duplicates.
export async function ensureManualSupplementFoods(
  supplements: SupplementSetup[]
): Promise<EnsureManualSupplementFoodsResult> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  const filtered = supplements.filter(s => ['whey', 'creatine', 'other'].includes(s.type) && s.serving_label?.trim())

  const duplicateType = findDuplicateSupplementType(filtered)
  if (duplicateType) {
    return { error: `You can only configure one ${duplicateType} supplement. Please remove the duplicate and try again.` }
  }
  for (const supp of filtered) {
    const validationError = validateSupplementSetup(supp)
    if (validationError) return { error: validationError }
  }

  const supabase = await createClient()
  const results: EnsuredSupplementFoodOption[] = []

  for (const supp of filtered) {
    const ensured: { data: EnsuredSupplementFood } | { error: string } = await ensureSupplementCatalogRow(supabase, supp)
    if ('error' in ensured) return { error: ensured.error }
    results.push({
      id: ensured.data.foodId,
      name: ensured.data.name,
      category: ensured.data.category,
      serving_size: ensured.data.serving_size,
      serving_unit: ensured.data.serving_unit,
      calories: ensured.data.calories,
      protein: ensured.data.protein,
      carbs: ensured.data.carbs,
      fat: ensured.data.fat,
      protein_type: ensured.data.protein_type,
      carb_type: null,
      display_unit: ensured.data.display_unit,
      grams_per_display_unit: ensured.data.grams_per_display_unit
    })
  }

  return { data: results }
}
