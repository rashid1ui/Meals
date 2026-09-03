import type { MacroTotals } from '@/lib/tracking/logic'

export interface PlanTargetColumns {
  // 'user_created' = built entirely by hand in the Manual Meal Builder,
  // never AI-touched (migration 0017). 'ai_generated' / 'user_customized'
  // keep the onboarding-recommended numbers as their target.
  plan_source?: string | null
  calories_target: number
  protein_target: number
  carbs_target: number
  fat_target: number
}

// The daily target that the dashboard rings, today's tracking, and the
// Insights adherence charts compare actual intake against.
//
// For a hand-built plan the user's OWN meal composition IS the target: they
// chose those foods and quantities deliberately, so progress should be
// measured against the plan they built, not the onboarding recommendation.
// Eating the plan as designed then reads as 100% / on-target instead of
// perpetually "slightly under". The onboarding recommendation still lives on
// the diet_plans row (calories_target etc.) for reference and plan history -
// it is just no longer the number progress is scored against for these
// plans.
//
// Every other plan (ai_generated, user_customized) is unchanged: it keeps
// using its stored *_target columns exactly as before.
//
// `planFoodTotals` is the sum of the active plan's own foods (via
// sumMacros). When it is missing (not yet loaded) the stored columns are
// used as a safe fallback so nothing ever renders a zero target.
export function effectiveDailyTarget(
  plan: PlanTargetColumns,
  planFoodTotals: MacroTotals | null | undefined
): MacroTotals {
  if (plan.plan_source === 'user_created' && planFoodTotals) {
    return {
      calories: Math.round(planFoodTotals.calories),
      protein: Math.round(planFoodTotals.protein),
      carbs: Math.round(planFoodTotals.carbs),
      fat: Math.round(planFoodTotals.fat)
    }
  }
  return {
    calories: plan.calories_target,
    protein: plan.protein_target,
    carbs: plan.carbs_target,
    fat: plan.fat_target
  }
}
