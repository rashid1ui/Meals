// Computes the "one natural serving" macros + label for a food_database row,
// for display in FoodPickerModal's browse list and quantity header. Bridges
// lib/nutrition/calculator.ts (the generic quantity/serving_size scaler) and
// lib/nutrition/units.ts (display-unit metadata) without either of those
// files needing to know about display concerns - same layering both already
// document for themselves.
//
// Weight/volume foods (display_unit 'g'/'kg'/'ml') show their stored
// per-100g/100ml values directly, unchanged from before this module existed.
// Piece-like foods (display_unit 'piece'/'slice'/'serving' - eggs, bananas,
// whey scoops) show the macros for exactly ONE of that unit, computed via the
// same calculateFoodMacros the rest of the app uses - never a separate
// calculation path - so this can never drift from the real math.

import { calculateFoodMacros, type FoodMacro } from '@/lib/nutrition/calculator'
import { requiresGramsPerUnit, unitLabel } from '@/lib/nutrition/units'

export interface ServingDisplayFood extends FoodMacro {
  display_unit?: string
  grams_per_display_unit?: number
}

export interface ServingDisplay {
  calories: number
  protein: number
  carbs: number
  fat: number
  label: string
}

export function servingDisplayFor(food: ServingDisplayFood): ServingDisplay {
  const displayUnit = food.display_unit || 'g'

  if (!requiresGramsPerUnit(displayUnit)) {
    const unitText = food.serving_unit === 'ml' ? 'ml' : 'g'
    return {
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      label: `per ${food.serving_size}${unitText}`
    }
  }

  const gramsPerUnit = food.grams_per_display_unit || 1
  const oneServing = calculateFoodMacros(gramsPerUnit, food)
  return {
    calories: oneServing.calories,
    protein: oneServing.protein,
    carbs: oneServing.carbs,
    fat: oneServing.fat,
    label: `per ${unitLabel(displayUnit, 1)}`
  }
}
