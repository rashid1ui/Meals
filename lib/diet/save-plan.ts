import { calculateFoodMacros, isValidQuantity, type FoodMacro } from '@/lib/nutrition/calculator'

// Every food the client sends is one of:
//  - an "editable" item: foodDatabaseId is set (either an existing item the
//    client resolved to a food_database match, or a newly-added item from
//    the Add Food picker). The server always recomputes its macros from a
//    fresh food_database lookup via calculateFoodMacros - the client never
//    sends, and the server never trusts, calorie/protein/carb/fat numbers.
//  - a "locked" item: foodDatabaseId is null and originalFoodId points at a
//    pre-existing `foods` row the client couldn't resolve to a food_database
//    match (and therefore never allowed the user to edit). The server looks
//    up that row's own already-persisted values directly and ignores
//    anything else the client sent for it.
export interface SaveDietPlanFood {
  foodDatabaseId: string | null
  originalFoodId: string | null
  quantity: number
  unit: string
}

export interface SaveDietPlanMeal {
  name: string
  foods: SaveDietPlanFood[]
}

export interface SaveDietPlanPayload {
  meals: SaveDietPlanMeal[]
}

export interface ResolvedFood {
  name: string
  quantity: number
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface ResolvedMeal {
  name: string
  foods: ResolvedFood[]
}

export interface OriginalFoodRecord {
  name: string
  quantity: number
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

// Pure structural validation, independent of the database. Deliberately does
// NOT apply validateMacros's AI-generation tolerance gate - manual edits are
// never blocked by macro tolerance, only by structural validity.
export function validateMealsShape(meals: SaveDietPlanMeal[]): string | null {
  if (!Array.isArray(meals) || meals.length === 0) {
    return 'A meal plan must have at least one meal.'
  }
  for (const meal of meals) {
    if (!meal.name || !meal.name.trim()) {
      return 'Every meal needs a name.'
    }
  }
  return null
}

// Pure resolution of a single client-submitted meal against server-verified
// reference data. Never trusts client-sent macro numbers: editable items are
// recomputed via calculateFoodMacros from a fresh food_database row, and
// locked items are copied verbatim from their own already-persisted row.
export function resolveMeal(
  meal: SaveDietPlanMeal,
  foodDatabaseById: Map<string, FoodMacro>,
  originalFoodsById: Map<string, OriginalFoodRecord>
): { meal: ResolvedMeal } | { error: string } {
  const resolvedFoods: ResolvedFood[] = []

  for (const food of meal.foods) {
    if (food.foodDatabaseId) {
      const dbFood = foodDatabaseById.get(food.foodDatabaseId)
      if (!dbFood) {
        return { error: 'One or more selected foods could not be verified. Please refresh and try again.' }
      }
      if (!isValidQuantity(food.quantity, dbFood.serving_unit)) {
        return { error: `Invalid quantity for ${dbFood.name}.` }
      }
      const calculated = calculateFoodMacros(food.quantity, dbFood)
      resolvedFoods.push({
        name: calculated.name,
        quantity: calculated.quantity,
        unit: calculated.unit,
        calories: calculated.calories,
        protein: calculated.protein,
        carbs: calculated.carbs,
        fat: calculated.fat
      })
    } else if (food.originalFoodId) {
      const orig = originalFoodsById.get(food.originalFoodId)
      if (!orig) {
        return { error: 'One or more locked food items could not be verified. Please refresh and try again.' }
      }
      resolvedFoods.push({
        name: orig.name,
        quantity: orig.quantity,
        unit: orig.unit,
        calories: orig.calories,
        protein: orig.protein,
        carbs: orig.carbs,
        fat: orig.fat
      })
    } else {
      return { error: 'Invalid food entry in the plan.' }
    }
  }

  return { meal: { name: meal.name.trim(), foods: resolvedFoods } }
}
