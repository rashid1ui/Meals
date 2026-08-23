import { calculateFoodMacros, type FoodMacro } from '@/lib/nutrition/calculator'
import type { CalculatedDiet, CalculatedMeal } from '@/lib/nutrition/calculator'
import type { SupplementSetup } from '@/lib/types'

// Pure, framework-free supplement logic used by app/onboarding/actions.ts -
// same pattern as lib/diet/save-plan.ts (pure helpers extracted out of the
// 'use server' file so they're unit-testable without a live Supabase/AI
// call). Nothing here touches the database or the network.

// Roughly the canonical-gram weight of "1 serving" for a whey supplement
// food_database row. The app has no real scale reading for a scoop - this
// number only exists so the existing display_unit='serving' /
// grams_per_display_unit conversion (lib/nutrition/units.ts) has a basis to
// convert against; the user always sees "1 serving", never this raw figure.
export const SUPPLEMENT_SERVING_CANONICAL_GRAMS = 30

// Reasonable upper bounds for server-side validation, mirroring the client's
// own <Input max=...> hints in TrainingNutritionStep.tsx (those are HTML
// attributes only and don't block a direct/bypassing submission).
export const WHEY_PROTEIN_PER_SERVING_MAX_G = 200
export const CREATINE_PER_SERVING_MAX_G = 100
// "Other" supplement macros aren't collected by any current UI (the Other
// Supplement form only asks for a name/serving label), but SupplementSetup's
// `macros` field is a valid, typed input a direct server-action call could
// still populate - bounded the same way app/dashboard/food-actions.ts bounds
// a custom food's per-100g nutrition values.
export const OTHER_SUPPLEMENT_MACRO_MAX = 2000

export interface ComputedSupplementMacros {
  calories: number
  protein: number
  carbs: number
  fat: number
  quantity: number
}

/**
 * Derives a supplement's macro contribution exactly as onboarding always has:
 *  - whey: amount_per_serving_g IS the protein grams per scoop; calories are
 *    derived at 4 kcal/g protein, carbs/fat are always 0.
 *  - creatine: always 0 calories/protein/carbs/fat, regardless of input -
 *    creatine has no caloric content and must never affect macro targets.
 *  - other: only affects macros if the caller explicitly provided them via
 *    `macros` (no current UI does); otherwise 0, same as creatine.
 */
export function computeSupplementMacros(supp: SupplementSetup): ComputedSupplementMacros {
  const quantity = supp.amount_per_serving_g || 5 // default 5g for creatine/other if not specified

  if (supp.type === 'whey' && supp.amount_per_serving_g) {
    const protein = supp.amount_per_serving_g
    return { calories: protein * 4, protein, carbs: 0, fat: 0, quantity: SUPPLEMENT_SERVING_CANONICAL_GRAMS }
  }

  if (supp.type !== 'creatine' && supp.macros) {
    return { calories: supp.macros.calories, protein: supp.macros.protein, carbs: supp.macros.carbs, fat: supp.macros.fat, quantity }
  }

  // Creatine (always) and "other" without macros: inert.
  return { calories: 0, protein: 0, carbs: 0, fat: 0, quantity }
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/**
 * Server-side sanity check for one supplement entry. Returns a
 * user-friendly error string, or null when the entry is acceptable.
 * Mirrors the bounds already hinted at client-side (TrainingNutritionStep's
 * <Input max=...>) so a request that bypasses the client can't smuggle in
 * negative or wildly unrealistic values.
 */
export function validateSupplementSetup(supp: SupplementSetup): string | null {
  if (supp.amount_per_serving_g != null) {
    if (!isFiniteNumber(supp.amount_per_serving_g) || supp.amount_per_serving_g <= 0) {
      return 'Supplement serving amount must be a positive number.'
    }
    if (supp.type === 'whey' && supp.amount_per_serving_g > WHEY_PROTEIN_PER_SERVING_MAX_G) {
      return `Whey protein per scoop must be ${WHEY_PROTEIN_PER_SERVING_MAX_G}g or less.`
    }
    if (supp.type === 'creatine' && supp.amount_per_serving_g > CREATINE_PER_SERVING_MAX_G) {
      return `Creatine per serving must be ${CREATINE_PER_SERVING_MAX_G}g or less.`
    }
  }

  if (supp.type === 'creatine' && supp.macros) {
    const { calories, protein, carbs, fat } = supp.macros
    if ([calories, protein, carbs, fat].some(v => v !== 0)) {
      return 'Creatine cannot have non-zero calories, protein, carbs, or fat.'
    }
  }

  if (supp.type === 'other' && supp.macros) {
    const entries: [string, number][] = [
      ['calories', supp.macros.calories],
      ['protein', supp.macros.protein],
      ['carbs', supp.macros.carbs],
      ['fat', supp.macros.fat]
    ]
    for (const [label, value] of entries) {
      if (!isFiniteNumber(value) || value < 0 || value > OTHER_SUPPLEMENT_MACRO_MAX) {
        return `Please enter a valid ${label} value for this supplement.`
      }
    }
  }

  return null
}

/** Returns the first duplicated supplement type, or null if none. The UI
 * prevents this by construction (TrainingNutritionStep toggles by type), so
 * this only ever fires against a request that bypasses the client. */
export function findDuplicateSupplementType(supplements: SupplementSetup[]): string | null {
  const seen = new Set<string>()
  for (const supp of supplements) {
    if (seen.has(supp.type)) return supp.type
    seen.add(supp.type)
  }
  return null
}

/**
 * Builds the food_database identity name for a configured supplement.
 * Deliberately encodes brand + type + the actual serving numbers (not just
 * type+brand) so two users configuring "generic Whey Protein" with different
 * protein-per-scoop amounts never collide on the same shared catalog row -
 * each distinct configuration gets its own row, while identical
 * configurations still naturally reuse one (case-insensitive exact match).
 */
export function buildSupplementCatalogName(supp: SupplementSetup, computed: ComputedSupplementMacros): string {
  const brand = supp.brand?.trim()
  let base: string
  if (supp.type === 'whey') base = brand ? `${brand} Whey Protein` : 'Whey Protein'
  else if (supp.type === 'creatine') base = brand ? `${brand} Creatine` : 'Creatine'
  else base = brand || 'Supplement'

  const distinguisher =
    supp.type === 'whey'
      ? `${Math.round(computed.protein)}g protein/serving`
      : supp.type === 'creatine'
        ? `${Math.round(computed.quantity)}g/serving`
        : (supp.serving_label || '').trim() || 'custom'

  return `${base} (${distinguisher})`
}

export type SupplementInsertErrorClass = 'unique_violation' | 'fatal'

/** Classifies a Supabase/Postgres insert error so the caller never silently
 * swallows anything other than the expected create-or-reuse race (23505). */
export function classifySupplementInsertError(error: { code?: string } | null): SupplementInsertErrorClass | null {
  if (!error) return null
  return error.code === '23505' ? 'unique_violation' : 'fatal'
}

export interface MacroTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

/** Subtracts the combined supplement macro contribution from a target,
 * clamped so no field ever goes negative. Includes fat (the original
 * implementation only subtracted calories/protein/carbs, letting a
 * fat-bearing supplement silently push the final diet over its fat target). */
export function subtractSupplementsFromTarget(target: MacroTotals, totals: MacroTotals): MacroTotals {
  return {
    calories: Math.max(0, target.calories - totals.calories),
    protein: Math.max(0, target.protein - totals.protein),
    carbs: Math.max(0, target.carbs - totals.carbs),
    fat: Math.max(0, target.fat - totals.fat)
  }
}

export interface ConfiguredSupplement {
  foodId: string
  name: string
  quantity: number
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  notes?: string
}

export interface OtherDbSupplement extends FoodMacro {
  id: string
}

/**
 * Appends configured supplements (and any other food_database rows tagged
 * protein_type='supplement' the user separately selected as a regular food)
 * to the AI-generated diet, after generation and after the AI's own macro
 * validation - supplements always have a fixed, non-solved quantity.
 *
 * Placement: inside the "Post-Workout Meal" when the user trains, otherwise
 * a standalone "Supplements" meal. Returns a NEW CalculatedDiet with
 * daily_calories/daily_protein/daily_carbs/daily_fat correctly updated to
 * include the appended supplements - the previous implementation only
 * updated the per-meal totals, leaving the diet's daily_* fields stale.
 *
 * "Other" supplements now correctly use the food_database row's own real
 * per-100g macros (via calculateFoodMacros, same function every other food
 * in the app uses) instead of being hardcoded to zero.
 */
export function appendSupplementsToDiet(
  diet: CalculatedDiet,
  configuredSupplements: ConfiguredSupplement[],
  otherDbSupplements: OtherDbSupplement[],
  trainingTime: string | null
): CalculatedDiet {
  if (configuredSupplements.length === 0 && otherDbSupplements.length === 0) {
    return diet
  }

  const meals: CalculatedMeal[] = diet.meals.map(m => ({ ...m, foods: [...m.foods] }))
  const postWorkoutMeal = trainingTime ? meals.find(m => m.name === 'Post-Workout Meal') : undefined

  const mealToAppendTo: CalculatedMeal =
    postWorkoutMeal || { name: 'Supplements', sort_order: meals.length, foods: [], calories: 0, protein: 0, carbs: 0, fat: 0 }
  if (!postWorkoutMeal) meals.push(mealToAppendTo)

  let addedCalories = 0
  let addedProtein = 0
  let addedCarbs = 0
  let addedFat = 0

  for (const supp of configuredSupplements) {
    if (mealToAppendTo.foods.some(f => f.food_id === supp.foodId)) continue
    mealToAppendTo.foods.push({
      food_id: supp.foodId,
      name: supp.name,
      quantity: supp.quantity,
      unit: supp.unit,
      calories: supp.calories,
      protein: supp.protein,
      carbs: supp.carbs,
      fat: supp.fat,
      notes: supp.notes
    })
    mealToAppendTo.calories += supp.calories
    mealToAppendTo.protein += supp.protein
    mealToAppendTo.carbs += supp.carbs
    mealToAppendTo.fat += supp.fat
    addedCalories += supp.calories
    addedProtein += supp.protein
    addedCarbs += supp.carbs
    addedFat += supp.fat
  }

  for (const otherSupp of otherDbSupplements) {
    if (mealToAppendTo.foods.some(f => f.food_id === otherSupp.id)) continue
    const quantity = otherSupp.serving_size > 0 ? otherSupp.serving_size : 100
    const calculated = calculateFoodMacros(quantity, otherSupp)
    mealToAppendTo.foods.push({
      food_id: otherSupp.id,
      name: otherSupp.name,
      quantity: calculated.quantity,
      unit: calculated.unit,
      calories: calculated.calories,
      protein: calculated.protein,
      carbs: calculated.carbs,
      fat: calculated.fat
    })
    mealToAppendTo.calories += calculated.calories
    mealToAppendTo.protein += calculated.protein
    mealToAppendTo.carbs += calculated.carbs
    mealToAppendTo.fat += calculated.fat
    addedCalories += calculated.calories
    addedProtein += calculated.protein
    addedCarbs += calculated.carbs
    addedFat += calculated.fat
  }

  return {
    ...diet,
    meals,
    daily_calories: diet.daily_calories + addedCalories,
    daily_protein: diet.daily_protein + addedProtein,
    daily_carbs: diet.daily_carbs + addedCarbs,
    daily_fat: diet.daily_fat + addedFat
  }
}
