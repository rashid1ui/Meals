// Pure, framework-free tracking logic - no Supabase, no 'use server'. Mirrors
// lib/diet/diff.ts's split: this module is unit-testable in isolation, and
// app/dashboard/tracking-actions.ts is the thin DB-touching wrapper around it.

import { calculateFoodMacros, type FoodMacro } from '@/lib/nutrition/calculator'

export interface TrackableFood {
  id: string
  name: string
  quantity: number
  calories: number
  protein: number
  carbs: number
  fat: number
}

export type TrackingStatus = 'none' | 'partial' | 'complete'

// Kept as an alias - "meal status" and "food status" are the exact same
// tri-state, just applied at two levels. Existing callers importing
// `MealStatus` keep working unchanged.
export type MealStatus = TrackingStatus

// Floating-point/rounding guard, not a real quantity threshold - a consumed
// quantity within 0.01g/ml of 0 or of the planned amount is treated as
// exactly that boundary, so unit conversions (e.g. 3 pieces at 33.33g each)
// never get stuck showing "partial" for a food the user fully logged.
const QUANTITY_EPSILON = 0.01

// A food's completion is a quantity comparison, not a flag: 0 consumed is
// 'none', anything at or above the current planned quantity is 'complete',
// anything in between is 'partial'. Comparing against the LIVE planned
// quantity (not a snapshot) means editing the plan later correctly re-grades
// an already-logged food (see app/dashboard/tracking-actions.ts).
export function computeFoodStatus(consumedQuantity: number, plannedQuantity: number): TrackingStatus {
  if (consumedQuantity <= QUANTITY_EPSILON) return 'none'
  if (consumedQuantity >= plannedQuantity - QUANTITY_EPSILON) return 'complete'
  return 'partial'
}

// A meal's status is purely derived from its foods' statuses - there is no
// independent "meal complete" flag anywhere (matches the product requirement
// that meal completion can never be set independently of food completion).
// A meal with zero foods is never "complete" - there's nothing to eat, so it
// stays 'none' rather than vacuously true.
export function deriveMealStatus(foodStatuses: TrackingStatus[]): TrackingStatus {
  if (foodStatuses.length === 0) return 'none'
  if (foodStatuses.every(s => s === 'none')) return 'none'
  if (foodStatuses.every(s => s === 'complete')) return 'complete'
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

export function pctOf(value: number, target: number): number {
  return target > 0 ? (value / target) * 100 : 0
}

// The five buckets the Insights calendar colors a day by, plus 'none' for a
// date with no daily_tracking row at all (never tracked - distinct from a
// tracked day that happened to score 0%). Thresholds mirror the language
// already used elsewhere in the app (on-target/slightly-over/over in
// classifyTarget) rather than inventing a new vocabulary.
export type AdherenceTier = 'excellent' | 'good' | 'partial' | 'low' | 'verylow' | 'none'

export function adherenceTier(pct: number | null): AdherenceTier {
  if (pct === null) return 'none'
  if (pct >= 90) return 'excellent'
  if (pct >= 75) return 'good'
  if (pct >= 50) return 'partial'
  if (pct >= 25) return 'low'
  return 'verylow'
}

// A single day's overall adherence, for the Insights calendar - the average
// of each macro's own percent-of-target (via pctOf, the same helper the
// weekly/monthly averages already use), each capped at 100 so overeating one
// macro can't inflate the score past what "fully on target" means. Not a new
// nutrition calculation - purely an aggregation of the existing per-macro
// percentages into one number for a calendar cell.
export function computeDayAdherencePct(consumed: MacroTotals, target: MacroTotals): number {
  const cappedPct = (value: number, targetValue: number) => Math.min(100, pctOf(value, targetValue))
  const avg =
    (cappedPct(consumed.calories, target.calories) +
      cappedPct(consumed.protein, target.protein) +
      cappedPct(consumed.carbs, target.carbs) +
      cappedPct(consumed.fat, target.fat)) /
    4
  return Math.round(avg)
}

// Scales a food's own currently-planned macros down to whatever quantity was
// actually consumed - reuses calculateFoodMacros (the SAME linear
// quantity-scaling the solver/calculator already use everywhere else) rather
// than inventing a second nutrition calculation. The food's own planned
// quantity/macros are used as the scaling "serving" basis instead of a fresh
// food_database lookup, since foods.calories/protein/carbs/fat are already
// the correct absolute values for foods.quantity - exactly what
// calculateFoodMacros expects as serving_size/calories/etc.
export function computeActualFoodMacros(consumedQuantity: number, plannedFood: TrackableFood): MacroTotals {
  const basis: FoodMacro = {
    id: plannedFood.id,
    name: plannedFood.name,
    serving_size: plannedFood.quantity,
    serving_unit: 'grams',
    calories: plannedFood.calories,
    protein: plannedFood.protein,
    carbs: plannedFood.carbs,
    fat: plannedFood.fat
  }
  const scaled = calculateFoodMacros(consumedQuantity, basis)
  return { calories: scaled.calories, protein: scaled.protein, carbs: scaled.carbs, fat: scaled.fat }
}

export interface FoodTrackingRowInput {
  userId: string
  trackingDate: string
  mealId: string
  mealName: string
  // The ACTUAL consumed quantity/macros to persist for this food - never the
  // full planned amount unless that's genuinely what was eaten. `completed`
  // is derived from quantity below rather than passed in, so the stored flag
  // can never disagree with the stored quantity.
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
    completed: input.food.quantity > QUANTITY_EPSILON,
    quantity: input.food.quantity,
    food_name: input.food.name,
    protein: input.food.protein,
    fat: input.food.fat,
    carbs: input.food.carbs,
    calories: input.food.calories,
    updated_at: now()
  }
}
