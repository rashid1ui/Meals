import { calculateFoodMacros, isValidQuantity, type FoodMacro } from '@/lib/nutrition/calculator'

export type PlanSource = 'ai_generated' | 'user_created' | 'user_customized'

// Provenance rule for editing an existing plan (app/dashboard/actions.ts's
// saveDietPlan): editing an 'ai_generated' plan marks it 'user_customized'
// (it was AI-touched, then hand-edited) - but editing a 'user_created' plan
// (built entirely by hand via the Manual Meal Builder, never AI-touched)
// PRESERVES 'user_created' rather than downgrading it to 'user_customized',
// since that value's whole meaning is specifically "was AI, then edited".
// An already-'user_customized' plan simply stays that way (sticky - there's
// no 'ai_generated' plan to fall back to).
export function nextPlanSourceOnEdit(currentPlanSource: PlanSource): PlanSource {
  return currentPlanSource === 'user_created' ? 'user_created' : 'user_customized'
}

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
  // The food's OWN current `foods.id` when it's an existing, already-
  // persisted item the client is editing/moving/resizing (the same id the
  // client's own draft state already tracks as that food's identity - see
  // lib/diet/diff.ts's DraftFood.id) - null/omitted for a brand-new item
  // that has never been saved. Used to build an old-id -> new-id relink
  // mapping for finalize_plan_swap (see app/dashboard/actions.ts), instead
  // of the ambiguous name-based matching computeFoodRelinkPairs used
  // before - a real database id can never collide the way two same-named
  // foods can.
  currentId?: string | null
}

export interface SaveDietPlanMeal {
  name: string
  foods: SaveDietPlanFood[]
  // Same idea as SaveDietPlanFood.currentId, for the meal itself (the
  // client's own current `meals.id`) - null/omitted for a brand-new meal.
  currentId?: string | null
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
  // Carried straight through from SaveDietPlanFood.currentId - null for a
  // brand-new food, otherwise the real, pre-existing `foods.id` this row
  // replaces.
  currentId: string | null
}

export interface ResolvedMeal {
  name: string
  foods: ResolvedFood[]
  currentId: string | null
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

export interface NamedFood {
  id: string
  name: string
}

export interface NamedMeal {
  name: string
  foods: NamedFood[]
}

export interface NamedMealWithId extends NamedMeal {
  id: string
}

export interface FoodRelinkPair {
  oldFoodId: string
  newFoodId: string
  newMealId: string
}

// saveDietPlan below always deletes and re-inserts every meal/food row on
// every edit-save (even a same-day quantity tweak to one food), so every
// food gets a brand new id - not just the one that was actually touched.
// Without this, today's already-recorded food_tracking completions (which
// key off food_id) go orphaned for the ENTIRE day on any edit: the
// Dashboard's checkboxes appear to reset even for meals nobody touched, and
// re-checking one to "fix" it double-counts it in daily_tracking (the old
// orphaned row and the new one are both still completed=true).
//
// This computes a conservative id migration: a food is matched old->new
// only when its name occurs exactly once in the same-named old meal AND
// exactly once in the same-named new meal - i.e. only when there's no
// ambiguity about which new row replaces it. A meal that's new, renamed, or
// has an ambiguous (repeated) food name is simply left unmatched, which is
// exactly today's existing (imperfect but safe) behavior - never a guess
// that could attach a completion to the wrong food.
export function computeFoodRelinkPairs(
  oldMeals: NamedMeal[],
  newMeals: NamedMealWithId[]
): FoodRelinkPair[] {
  const oldFoodsByMealName = new Map<string, NamedFood[]>()
  for (const meal of oldMeals) {
    oldFoodsByMealName.set(meal.name, meal.foods)
  }

  const pairs: FoodRelinkPair[] = []

  for (const newMeal of newMeals) {
    const oldFoods = oldFoodsByMealName.get(newMeal.name)
    if (!oldFoods || oldFoods.length === 0 || newMeal.foods.length === 0) continue

    const oldNameCounts = new Map<string, number>()
    for (const f of oldFoods) oldNameCounts.set(f.name, (oldNameCounts.get(f.name) || 0) + 1)

    const newNameCounts = new Map<string, number>()
    for (const f of newMeal.foods) newNameCounts.set(f.name, (newNameCounts.get(f.name) || 0) + 1)

    for (const [name, count] of oldNameCounts) {
      if (count === 1 && newNameCounts.get(name) === 1) {
        const oldFood = oldFoods.find(f => f.name === name)
        const newFood = newMeal.foods.find(f => f.name === name)
        if (oldFood && newFood) {
          pairs.push({ oldFoodId: oldFood.id, newFoodId: newFood.id, newMealId: newMeal.id })
        }
      }
    }
  }

  return pairs
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
        fat: calculated.fat,
        currentId: food.currentId ?? null
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
        fat: orig.fat,
        // A locked item's own id (food.originalFoodId) IS the current id -
        // it was already looked up by that exact id above.
        currentId: food.originalFoodId
      })
    } else {
      return { error: 'Invalid food entry in the plan.' }
    }
  }

  return { meal: { name: meal.name.trim(), foods: resolvedFoods, currentId: meal.currentId ?? null } }
}
