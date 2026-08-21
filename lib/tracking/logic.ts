// Pure, framework-free tracking logic - no Supabase, no 'use server'. Mirrors
// lib/diet/diff.ts's split: this module is unit-testable in isolation, and
// app/dashboard/tracking-actions.ts is the thin DB-touching wrapper around it.

export interface TrackableFood {
  id: string
  name: string
  quantity: number
  calories: number
  protein: number
  carbs: number
  fat: number
}

export type MealStatus = 'none' | 'partial' | 'complete'

// A meal with zero foods is never "complete" - there's nothing to eat, so it
// stays 'none' rather than vacuously true.
export function computeMealStatus(foodIds: string[], completedFoodIds: ReadonlySet<string>): MealStatus {
  if (foodIds.length === 0) return 'none'
  const completedCount = foodIds.filter(id => completedFoodIds.has(id)).length
  if (completedCount === 0) return 'none'
  if (completedCount === foodIds.length) return 'complete'
  return 'partial'
}

export interface MacroTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export function zeroMacros(): MacroTotals {
  return { calories: 0, protein: 0, carbs: 0, fat: 0 }
}

export function sumMacros(items: MacroTotals[]): MacroTotals {
  return items.reduce(
    (acc, f) => ({
      calories: acc.calories + Number(f.calories),
      protein: acc.protein + Number(f.protein),
      carbs: acc.carbs + Number(f.carbs),
      fat: acc.fat + Number(f.fat)
    }),
    zeroMacros()
  )
}

// Sums only the foods whose id is in completedFoodIds - "consumed" is never
// the whole meal just because it exists in the plan; only completed foods
// count (see the calling code in tracking-actions.ts for the enforcement of
// this at the database level too - this is the pure version of that rule).
export function sumCompletedMacros(foods: TrackableFood[], completedFoodIds: ReadonlySet<string>): MacroTotals {
  return sumMacros(foods.filter(f => completedFoodIds.has(f.id)))
}

export function pctOf(value: number, target: number): number {
  return target > 0 ? (value / target) * 100 : 0
}

export interface FoodTrackingRowInput {
  userId: string
  trackingDate: string
  mealId: string
  mealName: string
  completed: boolean
  food: TrackableFood
}

export interface FoodTrackingRow {
  user_id: string
  tracking_date: string
  food_id: string
  meal_id: string
  meal_name: string
  completed: boolean
  quantity: number
  food_name: string
  protein: number
  fat: number
  carbs: number
  calories: number
  updated_at: string
}

// Pure row-shaping for the food_tracking upsert payload. Deliberately has NO
// `unit` field - food_tracking has no such column (verified against the live
// schema); including one was the root cause of "Failed to save completion."
// `food.id` is what makes this row-identity-safe even when the same food
// name appears in more than one meal: every meal's foods are their own
// distinct `foods` table rows with independent ids (verified - onboarding
// and saveDietPlan always insert fresh rows per meal), so food_id alone
// already disambiguates "eggs in breakfast" from "eggs in a snack" without
// needing meal_id as part of the identity/unique constraint.
export function buildFoodTrackingRow(
  input: FoodTrackingRowInput,
  now: () => string = () => new Date().toISOString()
): FoodTrackingRow {
  return {
    user_id: input.userId,
    tracking_date: input.trackingDate,
    food_id: input.food.id,
    meal_id: input.mealId,
    meal_name: input.mealName,
    completed: input.completed,
    quantity: input.food.quantity,
    food_name: input.food.name,
    protein: input.food.protein,
    fat: input.food.fat,
    carbs: input.food.carbs,
    calories: input.food.calories,
    updated_at: now()
  }
}
