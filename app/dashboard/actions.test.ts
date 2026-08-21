import test from 'node:test'
import assert from 'node:assert'
import {
  validateMealsShape,
  resolveMeal,
  computeFoodRelinkPairs,
  type OriginalFoodRecord
} from '@/lib/diet/save-plan'
import type { FoodMacro } from '@/lib/nutrition/calculator'

const chickenDbRow: FoodMacro = {
  id: 'db-chicken',
  name: 'Chicken Breast, Raw',
  serving_size: 100,
  serving_unit: 'grams',
  calories: 120,
  protein: 22.5,
  carbs: 0,
  fat: 2.6
}

test('validateMealsShape - rejects an empty meal plan', () => {
  assert.match(validateMealsShape([]) || '', /at least one meal/)
})

test('validateMealsShape - rejects a meal with an empty/blank name', () => {
  assert.match(validateMealsShape([{ name: '   ', foods: [] }]) || '', /needs a name/)
})

test('validateMealsShape - accepts a well-formed plan', () => {
  assert.strictEqual(validateMealsShape([{ name: 'Breakfast', foods: [] }]), null)
})

test('resolveMeal - save changes: editable food is recomputed from food_database, never trusting client-sent macros', () => {
  const foodDatabaseById = new Map([[chickenDbRow.id, chickenDbRow]])
  const originalFoodsById = new Map<string, OriginalFoodRecord>()

  const result = resolveMeal(
    { name: 'Dinner', foods: [{ foodDatabaseId: 'db-chicken', originalFoodId: null, quantity: 150, unit: 'grams' }] },
    foodDatabaseById,
    originalFoodsById
  )

  assert.ok('meal' in result)
  if ('meal' in result) {
    assert.strictEqual(result.meal.foods.length, 1)
    // 150g of chicken @ 120kcal/100g = 180kcal, recomputed server-side, not
    // taken from anything the client could have sent.
    assert.strictEqual(result.meal.foods[0].calories, 180)
    assert.strictEqual(result.meal.foods[0].protein, 33.75)
  }
})

test('resolveMeal - rejects an invalid (out-of-range) quantity via isValidQuantity', () => {
  const foodDatabaseById = new Map([[chickenDbRow.id, chickenDbRow]])
  const result = resolveMeal(
    { name: 'Dinner', foods: [{ foodDatabaseId: 'db-chicken', originalFoodId: null, quantity: 5000, unit: 'grams' }] },
    foodDatabaseById,
    new Map()
  )
  assert.ok('error' in result)
  if ('error' in result) assert.match(result.error, /Invalid quantity/)
})

test('resolveMeal - rejects an editable food reference that could not be verified', () => {
  const result = resolveMeal(
    { name: 'Dinner', foods: [{ foodDatabaseId: 'db-unknown', originalFoodId: null, quantity: 100, unit: 'grams' }] },
    new Map(),
    new Map()
  )
  assert.ok('error' in result)
  if ('error' in result) assert.match(result.error, /could not be verified/)
})

test('resolveMeal - locked item uses its own persisted values verbatim, ignoring client quantity', () => {
  const original: OriginalFoodRecord = {
    name: 'Legacy Food', quantity: 80, unit: 'grams', calories: 200, protein: 10, carbs: 20, fat: 5
  }
  const originalFoodsById = new Map([['orig-1', original]])

  const result = resolveMeal(
    // Client sends a different quantity for the locked item (e.g. a stale
    // or tampered payload) - it must be ignored entirely.
    { name: 'Snack', foods: [{ foodDatabaseId: null, originalFoodId: 'orig-1', quantity: 9999, unit: 'grams' }] },
    new Map(),
    originalFoodsById
  )

  assert.ok('meal' in result)
  if ('meal' in result) {
    assert.strictEqual(result.meal.foods[0].quantity, 80)
    assert.strictEqual(result.meal.foods[0].calories, 200)
  }
})

test('resolveMeal - rejects a food entry with neither foodDatabaseId nor originalFoodId', () => {
  const result = resolveMeal(
    { name: 'Snack', foods: [{ foodDatabaseId: null, originalFoodId: null, quantity: 100, unit: 'grams' }] },
    new Map(),
    new Map()
  )
  assert.ok('error' in result)
  if ('error' in result) assert.match(result.error, /Invalid food entry/)
})

test('resolveMeal - trims the meal name (matches persistence behavior)', () => {
  const result = resolveMeal({ name: '  Post-Workout  ', foods: [] }, new Map(), new Map())
  assert.ok('meal' in result)
  if ('meal' in result) assert.strictEqual(result.meal.name, 'Post-Workout')
})

// computeFoodRelinkPairs - saveDietPlan deletes and re-inserts every food on
// every edit, giving unmatched foods a brand new id. This is what keeps
// today's already-recorded food_tracking completions attached to the right
// food across that id churn, instead of going orphaned and (if the user
// re-checks the now-apparently-unchecked box) double-counted.

test('computeFoodRelinkPairs - matches an untouched food in an untouched meal by (meal name, food name)', () => {
  const oldMeals = [{ name: 'Breakfast', foods: [{ id: 'old-egg', name: 'Whole Egg, Raw' }] }]
  const newMeals = [{ id: 'new-meal-1', name: 'Breakfast', foods: [{ id: 'new-egg', name: 'Whole Egg, Raw' }] }]

  const pairs = computeFoodRelinkPairs(oldMeals, newMeals)
  assert.deepStrictEqual(pairs, [{ oldFoodId: 'old-egg', newFoodId: 'new-egg', newMealId: 'new-meal-1' }])
})

test('computeFoodRelinkPairs - a food whose quantity changed is still matched by name (macros in the tracking row stay untouched)', () => {
  const oldMeals = [{ name: 'Lunch', foods: [{ id: 'old-chicken', name: 'Chicken Breast, Raw' }] }]
  const newMeals = [{ id: 'new-meal-1', name: 'Lunch', foods: [{ id: 'new-chicken', name: 'Chicken Breast, Raw' }] }]

  const pairs = computeFoodRelinkPairs(oldMeals, newMeals)
  assert.strictEqual(pairs.length, 1)
  assert.strictEqual(pairs[0].oldFoodId, 'old-chicken')
  assert.strictEqual(pairs[0].newFoodId, 'new-chicken')
})

test('computeFoodRelinkPairs - does not match a food that was actually removed', () => {
  const oldMeals = [{ name: 'Dinner', foods: [{ id: 'old-rice', name: 'White Rice, Dry' }] }]
  const newMeals = [{ id: 'new-meal-1', name: 'Dinner', foods: [] }]

  assert.deepStrictEqual(computeFoodRelinkPairs(oldMeals, newMeals), [])
})

test('computeFoodRelinkPairs - does not match foods in a brand-new meal with no old counterpart', () => {
  const oldMeals: { name: string; foods: { id: string; name: string }[] }[] = []
  const newMeals = [{ id: 'new-meal-1', name: 'Midnight Snack', foods: [{ id: 'new-food', name: 'Almonds, Raw' }] }]

  assert.deepStrictEqual(computeFoodRelinkPairs(oldMeals, newMeals), [])
})

test('computeFoodRelinkPairs - refuses to guess when a food name is ambiguous (repeated) within a meal', () => {
  const oldMeals = [{
    name: 'Snack',
    foods: [{ id: 'old-almonds-1', name: 'Almonds, Raw' }, { id: 'old-almonds-2', name: 'Almonds, Raw' }]
  }]
  const newMeals = [{
    id: 'new-meal-1',
    name: 'Snack',
    foods: [{ id: 'new-almonds-1', name: 'Almonds, Raw' }, { id: 'new-almonds-2', name: 'Almonds, Raw' }]
  }]

  // Two same-named foods on each side - which old maps to which new is
  // genuinely ambiguous, so neither is matched rather than guessed.
  assert.deepStrictEqual(computeFoodRelinkPairs(oldMeals, newMeals), [])
})

test('computeFoodRelinkPairs - matches only the unambiguous foods when a meal has a mix of unique and repeated names', () => {
  const oldMeals = [{
    name: 'Breakfast',
    foods: [
      { id: 'old-egg', name: 'Whole Egg, Raw' },
      { id: 'old-almonds-1', name: 'Almonds, Raw' },
      { id: 'old-almonds-2', name: 'Almonds, Raw' }
    ]
  }]
  const newMeals = [{
    id: 'new-meal-1',
    name: 'Breakfast',
    foods: [
      { id: 'new-egg', name: 'Whole Egg, Raw' },
      { id: 'new-almonds-1', name: 'Almonds, Raw' },
      { id: 'new-almonds-2', name: 'Almonds, Raw' }
    ]
  }]

  const pairs = computeFoodRelinkPairs(oldMeals, newMeals)
  assert.deepStrictEqual(pairs, [{ oldFoodId: 'old-egg', newFoodId: 'new-egg', newMealId: 'new-meal-1' }])
})

test('computeFoodRelinkPairs - does not match across differently-named meals', () => {
  const oldMeals = [{ name: 'Breakfast', foods: [{ id: 'old-egg', name: 'Whole Egg, Raw' }] }]
  const newMeals = [{ id: 'new-meal-1', name: 'Brunch', foods: [{ id: 'new-egg', name: 'Whole Egg, Raw' }] }]

  assert.deepStrictEqual(computeFoodRelinkPairs(oldMeals, newMeals), [])
})
