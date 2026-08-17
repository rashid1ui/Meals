import test from 'node:test'
import assert from 'node:assert'
import { validateMealsShape, resolveMeal, type OriginalFoodRecord } from '@/lib/diet/save-plan'
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
