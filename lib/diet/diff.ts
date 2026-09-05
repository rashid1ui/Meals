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
  // Presentation-only (migration 0030) - a resolved, stored meal photo.
  // Absent/null on a client-added meal until the next save + resolution.
  imageUrl?: string | null
  imageAlt?: string | null
  imageAttribution?: import('@/lib/food/foodImage').FoodImageAttribution | null
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

// Removes an entire meal slot - and every food assigned to it - from the
// builder tree by id. A no-op (returns `meals` as-is) when the id isn't
// present. The order of the remaining meals is preserved exactly: their
// array positions are what persistence writes as sort_order, so nothing is
// renumbered here. Keeping at least one meal is the caller's responsibility
// (the Manual Meal Builder hides the control on the last remaining meal) -
// validateMealsShape is the server-side backstop that rejects an empty plan.
export function removeMeal(meals: DraftMeal[], mealId: string): DraftMeal[] {
  if (!meals.some(m => m.id === mealId)) return meals
  return meals.filter(m => m.id !== mealId)
}

// Reorders one meal by a single position - 'up' swaps it with the meal
// immediately before it, 'down' with the meal immediately after. Only those
// two adjacent slots change; every other meal, and every meal's foods,
// stays the exact same object. A no-op (returns `meals` as-is) when the id
// isn't found, or when the meal is already at the relevant edge (first meal
// 'up', last meal 'down'). The returned array order is authoritative:
// handleManualSubmit maps it 1:1 and the server writes sort_order straight
// from the array index, so no target/type/timing sort is ever applied.
export function moveMeal(meals: DraftMeal[], mealId: string, direction: 'up' | 'down'): DraftMeal[] {
  const index = meals.findIndex(m => m.id === mealId)
  if (index === -1) return meals

  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= meals.length) return meals

  const next = meals.slice()
  ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
  return next
}

// Moves a food from one meal to another by id, unchanged otherwise - the
// food's quantity/unit/macros are carried over verbatim (no recompute), so
// computeMealTotals/computeDailyTotals reflect the move for free once called
// against the returned tree. A no-op (returns `meals` as-is) if the source/
// target meal or the food itself can't be found, or if they're the same meal.
export function moveFood(meals: DraftMeal[], sourceMealId: string, foodId: string, targetMealId: string): DraftMeal[] {
  if (sourceMealId === targetMealId) return meals

  let movedFood: DraftFood | null = null
  const withoutFood = meals.map(meal => {
    if (meal.id !== sourceMealId) return meal
    const found = meal.foods.find(f => f.id === foodId)
    if (!found) return meal
    movedFood = found
    return { ...meal, foods: meal.foods.filter(f => f.id !== foodId) }
  })

  if (!movedFood) return meals
  if (!withoutFood.some(m => m.id === targetMealId)) return meals

  return withoutFood.map(meal =>
    meal.id === targetMealId ? { ...meal, foods: [...meal.foods, movedFood as DraftFood] } : meal
  )
}

// Auto-generates a distinct meal name when the requested one already exists
// among the current meals (case-insensitive - "breakfast" and "Breakfast"
// are the same collision), instead of silently allowing two meals with the
// exact same name. Duplicate meal names are no longer a data-corruption
// risk (see SaveDietPlanMeal.currentId - meal identity for persistence/
// tracking-relink purposes is now the meal's own database id, never its
// name), but two identically-named meals are still confusing on their own
// merits (which "Breakfast" is which?), so this keeps names distinct at
// the point of creation. Appends " (2)", " (3)", etc. - the first available
// suffix - rather than rejecting the add outright, so "Add Meal" never
// requires a retry/error round trip for the common case of re-adding a
// default meal type.
export function uniqueMealName(existingNames: string[], desiredName: string): string {
  const trimmed = desiredName.trim()
  const existingLower = new Set(existingNames.map(n => n.trim().toLowerCase()))
  if (!existingLower.has(trimmed.toLowerCase())) return trimmed

  let suffix = 2
  while (existingLower.has(`${trimmed.toLowerCase()} (${suffix})`)) {
    suffix++
  }
  return `${trimmed} (${suffix})`
}

// Sensible default meal names for the Manual Meal Builder's initial seed,
// keyed by the "Meals Per Day" count chosen on the shared Daily Targets
// step (3/4/5/6 - the only options that step's <select> offers). Previously
// handleSelectManualPath (app/onboarding/OnboardingForm.tsx) ignored this
// count entirely and always seeded exactly 3 fixed meals - a user could
// select "6 Meals" and still land on 3, with the selector having had zero
// effect on the one path it's actually reachable through (AI generation,
// which WOULD have used it, is "Coming Soon"). Falls back to "Meal N" for
// any count outside the offered options rather than guessing a spacing
// pattern.
const DEFAULT_MEAL_NAME_PATTERNS: Record<number, string[]> = {
  1: ['Meal 1'],
  2: ['Breakfast', 'Dinner'],
  3: ['Breakfast', 'Lunch', 'Dinner'],
  4: ['Breakfast', 'Lunch', 'Dinner', 'Snack'],
  5: ['Breakfast', 'Morning Snack', 'Lunch', 'Afternoon Snack', 'Dinner'],
  6: ['Breakfast', 'Morning Snack', 'Lunch', 'Afternoon Snack', 'Dinner', 'Evening Snack']
}

export function defaultMealNamesForCount(count: number): string[] {
  const safeCount = Math.max(1, Math.round(count))
  const pattern = DEFAULT_MEAL_NAME_PATTERNS[safeCount]
  if (pattern) return pattern
  return Array.from({ length: safeCount }, (_, i) => `Meal ${i + 1}`)
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
