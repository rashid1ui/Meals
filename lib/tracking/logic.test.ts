import test from 'node:test'
import assert from 'node:assert'
import {
  computeFoodStatus,
  deriveMealStatus,
  sumMacros,
  computeActualFoodMacros,
  buildFoodTrackingRow,
  type TrackableFood
} from './logic'

function food(id: string, name: string, quantity: number, calories: number, protein: number, carbs: number, fat: number): TrackableFood {
  return { id, name, quantity, calories, protein, carbs, fat }
}

// computeFoodStatus - the tri-state per-food classification a quantity is
// compared against its current planned quantity to derive.

test('computeFoodStatus - zero consumed is none', () => {
  assert.strictEqual(computeFoodStatus(0, 100), 'none')
})

test('computeFoodStatus - consuming the full planned quantity is complete', () => {
  assert.strictEqual(computeFoodStatus(100, 100), 'complete')
})

test('computeFoodStatus - consuming less than planned is partial', () => {
  assert.strictEqual(computeFoodStatus(60, 100), 'partial')
})

test('computeFoodStatus - 2 of 3 eggs (66.67g of 100g at 33.33g/egg) reads as partial, not complete', () => {
  assert.strictEqual(computeFoodStatus(66.67, 100), 'partial')
})

test('computeFoodStatus - a value within floating-point rounding of the full planned quantity still reads as complete', () => {
  // 3 eggs at 33.33g/egg = 99.99, not exactly 100 - must not get stuck at "partial".
  assert.strictEqual(computeFoodStatus(99.99, 100), 'complete')
})

test('computeFoodStatus - logging more than planned is still complete, never an invalid fourth state', () => {
  assert.strictEqual(computeFoodStatus(120, 100), 'complete')
})

// deriveMealStatus - meal completion is ALWAYS derived from its foods'
// statuses, never set independently.

test('deriveMealStatus - a meal with no foods is none, never vacuously complete', () => {
  assert.strictEqual(deriveMealStatus([]), 'none')
})

test('deriveMealStatus - every food none is none', () => {
  assert.strictEqual(deriveMealStatus(['none', 'none']), 'none')
})

test('deriveMealStatus - every food complete is complete', () => {
  assert.strictEqual(deriveMealStatus(['complete', 'complete']), 'complete')
})

test('deriveMealStatus - a mix of none/partial/complete is partial', () => {
  assert.strictEqual(deriveMealStatus(['complete', 'none']), 'partial')
  assert.strictEqual(deriveMealStatus(['complete', 'partial']), 'partial')
  assert.strictEqual(deriveMealStatus(['partial', 'none']), 'partial')
})

test('deriveMealStatus - two of three foods completed is partial (Breakfast: eggs + bread eaten, oats not)', () => {
  assert.strictEqual(deriveMealStatus(['complete', 'complete', 'none']), 'partial')
})

// computeActualFoodMacros - reuses calculateFoodMacros to scale a food's own
// planned macros down to whatever quantity was actually consumed.

test('computeActualFoodMacros - eating the full planned quantity returns the full planned macros', () => {
  const chicken = food('f1', 'Chicken Breast', 200, 240, 45, 0, 5.2)
  assert.deepStrictEqual(computeActualFoodMacros(200, chicken), { calories: 240, protein: 45, carbs: 0, fat: 5.2 })
})

test('computeActualFoodMacros - 120g of a 200g planned chicken portion scales macros proportionally, not to the full amount', () => {
  const chicken = food('f1', 'Chicken Breast', 200, 240, 45, 0, 5.2)
  const actual = computeActualFoodMacros(120, chicken)
  assert.strictEqual(actual.calories, 144)
  assert.strictEqual(actual.protein, 27)
  assert.strictEqual(actual.fat, 3.12)
})

test('computeActualFoodMacros - 2 of 3 eggs (planned 100g for 3 eggs) scales down, not the full 3-egg macros', () => {
  const eggs = food('f1', 'Whole Egg', 100, 143, 12.6, 0.7, 9.5)
  const actual = computeActualFoodMacros(66.67, eggs) // ~2 of 3 eggs at 33.33g each
  assert.ok(actual.calories < 143 && actual.calories > 90)
  assert.ok(Math.abs(actual.calories - 95.36) < 0.1)
})

test('computeActualFoodMacros - zero consumed is zero macros, not the full planned amount', () => {
  const rice = food('f1', 'White Rice', 150, 200, 4, 44, 0.4)
  assert.deepStrictEqual(computeActualFoodMacros(0, rice), { calories: 0, protein: 0, carbs: 0, fat: 0 })
})

// buildFoodTrackingRow - now shapes rows from the ACTUAL consumed
// quantity/macros the caller already resolved, and derives `completed` from
// quantity rather than trusting a separately-passed flag.

test('buildFoodTrackingRow - two foods with the same name in different meals build independent rows keyed by food_id', () => {
  const breakfastEggs = food('breakfast-eggs-id', 'Eggs', 100, 143, 12.6, 0.7, 9.5)
  const snackEggs = food('snack-eggs-id', 'Eggs', 0, 0, 0, 0, 0)

  const rowA = buildFoodTrackingRow(
    { userId: 'u1', trackingDate: '2026-08-21', mealId: 'breakfast-id', mealName: 'Breakfast', food: breakfastEggs },
    () => '2026-08-21T00:00:00.000Z'
  )
  const rowB = buildFoodTrackingRow(
    { userId: 'u1', trackingDate: '2026-08-21', mealId: 'snack-id', mealName: 'Snack', food: snackEggs },
    () => '2026-08-21T00:00:00.000Z'
  )

  assert.notStrictEqual(rowA.food_id, rowB.food_id)
  assert.strictEqual(rowA.meal_id, 'breakfast-id')
  assert.strictEqual(rowB.meal_id, 'snack-id')
  assert.strictEqual(rowA.completed, true)
  assert.strictEqual(rowB.completed, false)
  // Confirms the row shape has no `unit` field - the root cause of the
  // original "Failed to save completion" error was upserting a `unit` key
  // that food_tracking has no column for.
  assert.strictEqual('unit' in rowA, false)
})

test('buildFoodTrackingRow - a fully-eaten food is stored with completed=true', () => {
  const eggs = food('f1', 'Eggs', 100, 143, 12.6, 0.7, 9.5)
  const row = buildFoodTrackingRow(
    { userId: 'u1', trackingDate: '2026-08-21', mealId: 'm1', mealName: 'Breakfast', food: eggs },
    () => '2026-08-21T00:00:00.000Z'
  )
  assert.strictEqual(row.calories, 143)
  assert.strictEqual(row.food_name, 'Eggs')
  assert.strictEqual(row.quantity, 100)
  assert.strictEqual(row.completed, true)
})

test('buildFoodTrackingRow - a partially-eaten food (already-scaled actual macros) is still completed=true', () => {
  const chicken = food('f1', 'Chicken', 120, 144, 27, 0, 3.12) // caller already scaled this to the consumed amount
  const row = buildFoodTrackingRow(
    { userId: 'u1', trackingDate: '2026-08-21', mealId: 'm1', mealName: 'Lunch', food: chicken },
    () => '2026-08-21T00:00:00.000Z'
  )
  assert.strictEqual(row.quantity, 120)
  assert.strictEqual(row.calories, 144)
  assert.strictEqual(row.completed, true)
})

test('buildFoodTrackingRow - logging zero quantity (un-marking) is stored with completed=false', () => {
  const eggs = food('f1', 'Eggs', 0, 0, 0, 0, 0)
  const row = buildFoodTrackingRow(
    { userId: 'u1', trackingDate: '2026-08-21', mealId: 'm1', mealName: 'Breakfast', food: eggs },
    () => '2026-08-21T00:00:00.000Z'
  )
  assert.strictEqual(row.completed, false)
})

test('sumMacros - sums a list of already-actual per-food macros into a meal/day total', () => {
  const totals = sumMacros([
    { calories: 144, protein: 27, carbs: 0, fat: 3.12 },
    { calories: 95.36, protein: 8.4, carbs: 0.47, fat: 6.34 }
  ])
  assert.strictEqual(Math.round(totals.calories), 239)
  assert.strictEqual(Math.round(totals.protein * 10) / 10, 35.4)
})
