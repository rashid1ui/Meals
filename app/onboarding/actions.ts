'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { getUser } from '@/lib/auth/get-user'
import { generateValidatedDiet, type FoodOption } from '@/lib/diet/generate-diet'
import { acquireGenerationLock, releaseGenerationLock } from '@/lib/diet/generation-lock'
import { validateMacros } from '@/lib/nutrition/calculator'
import { isValidHeightCm, HEIGHT_CM_MIN, HEIGHT_CM_MAX, validateMacroValues } from '@/lib/nutrition/engine'
import { isValidReminderTime } from '@/lib/notifications/schedule'
import {
  computeSupplementMacros,
  validateSupplementSetup,
  findDuplicateSupplementType,
  subtractSupplementsFromTarget,
  appendSupplementsToDiet,
  type ConfiguredSupplement,
  type OtherDbSupplement
} from '@/lib/diet/supplements'
import { ensureSupplementCatalogRow } from '@/lib/diet/supplement-catalog'
import type { SupplementSetup } from '@/lib/types'

interface RemindersSubmission {
  enabled: boolean
  timezone?: string | null
  perMeal?: { time?: string; enabled?: boolean }[]
}

const VALID_TRAINING_TIMES = ['morning', 'afternoon', 'evening', 'custom'] as const

interface TrainingNutritionSubmission {
  trainingTime?: (typeof VALID_TRAINING_TIMES)[number] | null
  trainingTimeCustom?: string | null
  supplements?: SupplementSetup[]
}

// Reasonable server-side bounds for values that only ever reach this action
// through FormData (a request bypassing the client entirely can set anything
// - see the height check below, which predates this and follows the same
// "defense in depth" reasoning). Mirrors the DB's own CHECK constraints
// (profiles.age, profiles.training_days_per_week) so a bad value gets a
// friendly error here instead of a raw Postgres constraint violation later.
const MIN_AGE = 1
const MAX_AGE = 119
const MIN_TRAINING_DAYS = 0
const MAX_TRAINING_DAYS = 7
const MIN_MEALS_COUNT = 1
const MAX_MEALS_COUNT = 10

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

  // Prevent duplicate diet generation - Check 2: full-duration generation
  // lock (lib/diet/generation-lock.ts). Held for the entire body below via
  // the try/finally - always released, success or failure, so a crash can
  // never permanently lock a user out (the lock also self-expires via TTL).
  const lockResult = await acquireGenerationLock(supabase, user.id)
  if (!lockResult.ok) return { error: lockResult.error }

  try {
    // Parse inputs
    const calories = parseInt(formData.get('calories') as string)
    const protein = parseInt(formData.get('protein') as string)
    const carbs = parseInt(formData.get('carbsTarget') as string)
    const fat = parseInt(formData.get('fat') as string)
    const mealsCount = parseInt(formData.get('meals') as string)

    let proteinsList: string[] = []
    let carbsList: string[] = []
    let fatsList: string[] = []
    try {
      proteinsList = JSON.parse((formData.get('proteins') as string) || '[]')
      carbsList = JSON.parse((formData.get('carbFoodIds') as string) || '[]')
      fatsList = JSON.parse((formData.get('fats') as string) || '[]')
    } catch {
      return { error: 'Your food selections could not be read. Please go back and reselect them.' }
    }

    // Nutrition Engine output (lib/nutrition/engine.ts, computed client-side in
    // OnboardingForm). Both are optional - absent whenever the user hit "Skip"
    // on the Profile step, in which case this submission behaves exactly like
    // today's pure manual-entry flow with no profile/goal data written at all.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let nutritionProfile: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let nutritionTargetMeta: any = null
    try {
      const nutritionProfileRaw = formData.get('nutritionProfile') as string | null
      const nutritionTargetMetaRaw = formData.get('nutritionTargetMeta') as string | null
      nutritionProfile = nutritionProfileRaw ? JSON.parse(nutritionProfileRaw) : null
      nutritionTargetMeta = nutritionTargetMetaRaw ? JSON.parse(nutritionTargetMetaRaw) : null
    } catch {
      return { error: 'Your profile data could not be read. Please go back and try again.' }
    }

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
    if (trainingNutrition?.supplements) {
      trainingNutrition.supplements = trainingNutrition.supplements.filter(s => ['whey', 'creatine', 'other'].includes(s.type))

      const duplicateType = findDuplicateSupplementType(trainingNutrition.supplements)
      if (duplicateType) {
        return { error: `You can only configure one ${duplicateType} supplement. Please remove the duplicate and try again.` }
      }

      for (const supp of trainingNutrition.supplements) {
        const validationError = validateSupplementSetup(supp)
        if (validationError) return { error: validationError }
      }
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

    if (nutritionProfile) {
      const age = Number(nutritionProfile.age)
      if (!Number.isFinite(age) || age < MIN_AGE || age > MAX_AGE) {
        return { error: `Age must be a number between ${MIN_AGE} and ${MAX_AGE}.` }
      }
      const trainingDays = Number(nutritionProfile.trainingDaysPerWeek)
      if (!Number.isFinite(trainingDays) || trainingDays < MIN_TRAINING_DAYS || trainingDays > MAX_TRAINING_DAYS) {
        return { error: `Training days per week must be between ${MIN_TRAINING_DAYS} and ${MAX_TRAINING_DAYS}.` }
      }
    }

    // Was previously `if (!calories || !protein || ...)`, which a negative
    // number passes (`!(-500)` is false in JS) - validateMacroValues rejects
    // non-finite values and enforces calories/protein > 0, carbs/fat >= 0.
    const macroCheck = validateMacroValues({ calories, protein, carbs, fat })
    if (!macroCheck.valid) {
      return { error: macroCheck.errors[0] }
    }
    if (!Number.isInteger(mealsCount) || mealsCount < MIN_MEALS_COUNT || mealsCount > MAX_MEALS_COUNT) {
      return { error: `Meals per day must be between ${MIN_MEALS_COUNT} and ${MAX_MEALS_COUNT}.` }
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

    // 3. Prepare AI Prompt & Exclude Supplements
    // Iterate through all configured supplements, insert them into food_database
    // if missing, and prepare them to be appended AFTER generation.
    let totalSupplementCalories = 0
    let totalSupplementProtein = 0
    let totalSupplementCarbs = 0
    let totalSupplementFat = 0
    const supplementFoodIds = new Set<string>()
    const configuredSupplements: ConfiguredSupplement[] = []

    for (const supp of trainingNutrition?.supplements || []) {
      if (!supp.serving_label.trim()) continue

      const computed = computeSupplementMacros(supp)

      totalSupplementCalories += computed.calories
      totalSupplementProtein += computed.protein
      totalSupplementCarbs += computed.carbs
      totalSupplementFat += computed.fat

      // Idempotent create-or-reuse of the food_database row for this exact
      // configuration - shared with the Manual Meal Builder path
      // (manual-actions.ts's ensureManualSupplementFoods) via
      // lib/diet/supplement-catalog.ts, so both paths resolve an equivalent
      // configuration to the same catalog row.
      const ensured = await ensureSupplementCatalogRow(supabase, supp)
      if ('error' in ensured) return { error: ensured.error }
      const suppFoodId = ensured.data.foodId
      const suppName = ensured.data.name

      supplementFoodIds.add(suppFoodId)
      configuredSupplements.push({
        foodId: suppFoodId,
        name: suppName,
        quantity: computed.quantity,
        unit: 'grams',
        calories: computed.calories,
        protein: computed.protein,
        carbs: computed.carbs,
        fat: computed.fat,
        notes: supp.notes
      })
    }

    // Also exclude any other food_database rows with protein_type='supplement'
    // that the user may have selected as a regular food (e.g. a legacy row
    // predating the is_active=false convention above, or a real custom food a
    // user tagged Protein Source = Supplement via CreateFoodForm) - prevents
    // the AI from distributing supplement foods across random meals, and (see
    // appendSupplementsToDiet) uses the row's REAL macros when re-adding it,
    // rather than discarding its nutrition entirely.
    const otherDbSupplements: OtherDbSupplement[] = []
    for (const f of dbFoods) {
      if ((f as Record<string, unknown>).protein_type === 'supplement' && !supplementFoodIds.has(f.id)) {
        supplementFoodIds.add(f.id)
        otherDbSupplements.push(f as unknown as OtherDbSupplement)
      }
    }

    // Subtract the combined supplement macro contributions (including fat -
    // the previous implementation only subtracted calories/protein/carbs)
    // from the AI's targets so the regular foods fill the remaining budget.
    const aiTarget = subtractSupplementsFromTarget(
      { calories, protein, carbs, fat },
      { calories: totalSupplementCalories, protein: totalSupplementProtein, carbs: totalSupplementCarbs, fat: totalSupplementFat }
    )

    // Resolve training time for workout-aware meal naming
    const resolvedTrainingTime = trainingNutrition?.trainingTime ?? null

    const genResult = await generateValidatedDiet({
      dbFoods: dbFoods as unknown as FoodOption[],
      calories: aiTarget.calories,
      protein: aiTarget.protein,
      carbs: aiTarget.carbs,
      fat: aiTarget.fat,
      mealsCount,
      supplementFoodIds: supplementFoodIds.size > 0 ? supplementFoodIds : undefined,
      trainingTime: resolvedTrainingTime
    })

    if ('error' in genResult) {
      return { error: genResult.error }
    }

    // Append supplements. For training users, place them inside the
    // Post-Workout Meal if one exists; otherwise create a standalone
    // "Supplements" meal. Also brings daily_calories/protein/carbs/fat up to
    // date to include them (the previous implementation only updated the
    // per-meal totals, leaving the diet object's daily_* fields stale).
    const finalValidatedDiet = appendSupplementsToDiet(genResult.diet, configuredSupplements, otherDbSupplements, resolvedTrainingTime)

    // Safety net: supplements are appended AFTER the AI's own macro
    // validation loop, so re-validate the fully-assembled diet (AI foods +
    // supplements) against the user's ORIGINAL, full targets before saving
    // anything. When the subtract-then-add-back math above is correct this
    // always passes - the AI hit its reduced target within tolerance, and
    // adding back exactly what was subtracted reconciles to the original
    // target within that same tolerance. A failure here means a real bug
    // (e.g. a supplement large enough to have been clamped during
    // subtraction), and must surface as an error rather than silently
    // persisting an off-target plan.
    const finalCheck = validateMacros(finalValidatedDiet, calories, protein, carbs, fat)
    if (!finalCheck.valid) {
      console.error('[onboarding] post-supplement macro validation failed:', finalCheck.errors)
      return {
        error: 'Your meal plan could not be validated after adding your supplements. Please adjust your supplement setup or targets and try again.'
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
        // AI-generated, as opposed to app/dashboard/actions.ts's saveDietPlan
        // (which marks its output 'user_customized') - see migration
        // 0015_diet_plans_plan_source.sql for why this distinction exists.
        plan_source: 'ai_generated',
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
      console.error('[onboarding] failed to insert diet plan:', insertPlanError)
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
    } catch (err) {
      // Rollback diet plan. The previous plan (if any) was never touched by
      // this branch, so it remains fully intact.
      console.error('[onboarding] failed to save meals/foods, rolling back:', err)
      await supabase.from('diet_plans').delete().eq('id', newPlan.id)
      return { error: 'Failed to save meals. Rolling back.' }
    }

    // Activate: only now that the new plan is fully and successfully persisted
    // do we hand off "active" status (new-plan flow only). The previous plan is
    // NOT deleted - it becomes plan history (is_active=false), visible under
    // "Previous Plans" on the dashboard. Both updates run as ONE atomic
    // transaction (activate_plan_history_swap, migration
    // 0021_activate_plan_history_swap_function.sql) - the SAME RPC
    // app/onboarding/manual-actions.ts already uses - so a crash/timeout
    // between the deactivate and the activate can never leave the user with
    // zero active plans. If the swap fails, the previous plan is still active,
    // exactly as before this call.
    if (previousPlanId) {
      const { error: swapError } = await supabase.rpc('activate_plan_history_swap', {
        p_old_plan_id: previousPlanId,
        p_new_plan_id: newPlan.id
      })
      if (swapError) {
        console.error('[onboarding] failed to activate new plan:', swapError)
        return { error: 'Your new meal plan was created, but we could not switch you over to it. Please try again from Settings.' }
      }
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
    // biometrics the user may have saved on a previous, calculator-driven run),
    // and the Training Nutrition Setup / supplements.
    //
    // BEST-EFFORT ONLY: by this point the plan is fully persisted AND active
    // (the swap above already committed and cannot be undone here). Returning
    // an error now would tell the user "it failed" after the important work
    // succeeded, and the suggested retry ("Generate New Plan") would create a
    // SECOND plan. So a failure here is logged loudly and swallowed - exactly
    // how the notification_preferences write above is already handled. The
    // user can re-save these details from Settings without regenerating.
    const { error: profileUpdateError } = await supabase
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
              // Backward compatibility: legacy single-supplement columns are
              // still populated from the first configured supplement, AND the
              // full array is saved to the new `supplements` JSONB column -
              // both are written together, in the same update, so they can
              // never disagree about whether this write succeeded.
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
      // Logged, not returned - see the BEST-EFFORT note above.
      console.error('[onboarding] failed to update profile (including supplements):', profileUpdateError)
    }

    return { success: true }
  } finally {
    await releaseGenerationLock(supabase, user.id)
  }
}
