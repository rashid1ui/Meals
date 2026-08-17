// Pure, framework-free diffing/aggregation logic for the Dashboard diet editor.
// Deliberately does not duplicate any nutrition math - callers compute each
// food's calories/protein/carbs/fat via lib/nutrition/calculator.ts's
// calculateFoodMacros whenever a quantity is set, and store the result on the
// draft item (mirroring how the `foods` table already stores denormalized
// absolute values). This module only diffs/sums those already-computed values.

export interface DraftFood {
  // Real `foods.id` for items that came from the server; a "new-food-*" id
  // for items added client-side and not yet persisted.
  id: string
  // `food_database.id` reference used to recompute macros on quantity change
  // and on save. Null when the food's name couldn't be matched back to an
  // active food_database row (e.g. renamed/deactivated since generation) -
  // such items are quantity-locked in the UI rather than silently mis-scaled.
  foodDatabaseId: string | null
  name: string
  quantity: number
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface DraftMeal {
  // Real `meals.id` for server-loaded meals; a "new-meal-*" id for meals
  // added client-side and not yet persisted.
  id: string
  name: string
  sortOrder: number
  foods: DraftFood[]
}

export type ChangeEntry =
  | { type: 'meal-added'; mealName: string }
  | { type: 'added'; foodId: string; foodName: string; quantity: number; unit: string; mealName: string }
  | { type: 'removed'; foodId: string; foodName: string; quantity: number; unit: string; mealName: string }
  | { type: 'increased'; foodId: string; foodName: string; fromQuantity: number; toQuantity: number; unit: string; mealName: string }
  | { type: 'decreased'; foodId: string; foodName: string; fromQuantity: number; toQuantity: number; unit: string; mealName: string }
  | { type: 'moved'; foodId: string; foodName: string; quantity: number; unit: string; fromMealName: string; toMealName: string }

interface OriginalFoodEntry {
  food: DraftFood
  mealId: string
  mealName: string
}

// Compares a draft meal/food tree against the last-persisted (or last-saved)
// snapshot and returns a human-readable list of what changed. Identity is by
// id, so a food that only had its quantity edited or was moved to a
// different meal is recognized as the same item, not add+remove.
export function diffMeals(original: DraftMeal[], draft: DraftMeal[]): ChangeEntry[] {
  const changes: ChangeEntry[] = []

  const originalMealIds = new Set(original.map(m => m.id))

  const originalFoodIndex = new Map<string, OriginalFoodEntry>()
  for (const meal of original) {
    for (const food of meal.foods) {
      originalFoodIndex.set(food.id, { food, mealId: meal.id, mealName: meal.name })
    }
  }

  for (const meal of draft) {
    if (!originalMealIds.has(meal.id)) {
      changes.push({ type: 'meal-added', mealName: meal.name })
    }
  }

  const draftFoodIds = new Set<string>()

  for (const meal of draft) {
    for (const food of meal.foods) {
      draftFoodIds.add(food.id)
      const orig = originalFoodIndex.get(food.id)

      if (!orig) {
        changes.push({ type: 'added', foodId: food.id, foodName: food.name, quantity: food.quantity, unit: food.unit, mealName: meal.name })
        continue
      }

      if (orig.mealId !== meal.id) {
        changes.push({ type: 'moved', foodId: food.id, foodName: food.name, quantity: food.quantity, unit: food.unit, fromMealName: orig.mealName, toMealName: meal.name })
      }

      if (orig.food.quantity !== food.quantity) {
        if (food.quantity > orig.food.quantity) {
          changes.push({ type: 'increased', foodId: food.id, foodName: food.name, fromQuantity: orig.food.quantity, toQuantity: food.quantity, unit: food.unit, mealName: meal.name })
        } else {
          changes.push({ type: 'decreased', foodId: food.id, foodName: food.name, fromQuantity: orig.food.quantity, toQuantity: food.quantity, unit: food.unit, mealName: meal.name })
        }
      }
    }
  }

  for (const [id, entry] of originalFoodIndex) {
    if (!draftFoodIds.has(id)) {
      changes.push({ type: 'removed', foodId: id, foodName: entry.food.name, quantity: entry.food.quantity, unit: entry.food.unit, mealName: entry.mealName })
    }
  }

  return changes
}

export interface MacroTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

const ZERO_TOTALS: MacroTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 }

export function computeMealTotals(meal: DraftMeal): MacroTotals {
  return meal.foods.reduce(
    (acc, f) => ({
      calories: acc.calories + f.calories,
      protein: acc.protein + f.protein,
      carbs: acc.carbs + f.carbs,
      fat: acc.fat + f.fat
    }),
    { ...ZERO_TOTALS }
  )
}

export function computeDailyTotals(meals: DraftMeal[]): MacroTotals {
  return meals.reduce((acc, meal) => {
    const t = computeMealTotals(meal)
    return {
      calories: acc.calories + t.calories,
      protein: acc.protein + t.protein,
      carbs: acc.carbs + t.carbs,
      fat: acc.fat + t.fat
    }
  }, { ...ZERO_TOTALS })
}

export type TargetStatus = 'on-target' | 'slightly-over' | 'slightly-under' | 'over' | 'under'

export interface TargetComparison {
  status: TargetStatus
  diff: number
  diffPct: number
}

// Informational-only classification for the UI (e.g. the "On Target" /
// "Slightly Over" badge). This is deliberately independent of
// lib/nutrition/calculator.ts's validateMacros, which is a hard pass/fail
// gate reserved for AI-generated output - manual edits are never blocked by
// macro tolerance, only by structural validity (see isValidQuantity usage
// in app/dashboard/actions.ts).
export function classifyTarget(actual: number, target: number): TargetComparison {
  const diff = actual - target
  const diffPct = target === 0 ? 0 : (diff / target) * 100
  const abs = Math.abs(diffPct)

  let status: TargetStatus
  if (abs <= 5) status = 'on-target'
  else if (abs <= 15) status = diff > 0 ? 'slightly-over' : 'slightly-under'
  else status = diff > 0 ? 'over' : 'under'

  return { status, diff, diffPct }
}

export type FoodBadge = 'added' | 'increased' | 'decreased' | 'moved'

// Which badges (if any) apply to a single rendered food row. A food can be
// both moved and resized in the same edit session, so this returns all that
// apply rather than a single label.
export function getFoodBadges(changes: ChangeEntry[], foodId: string): FoodBadge[] {
  const badges: FoodBadge[] = []
  for (const change of changes) {
    if (change.type === 'meal-added' || change.type === 'removed') continue
    if (change.foodId !== foodId) continue
    badges.push(change.type)
  }
  return badges
}
