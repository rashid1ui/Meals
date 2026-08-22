import test from 'node:test'
import assert from 'node:assert'
import {
  computeMealStatus,
  sumMacros,
  sumCompletedMacros,
  buildFoodTrackingRow,
  adherenceTier,
  dailyAdherencePct,
  type TrackableFood
} from './logic'

function food(id: string, name: string, quantity: number, calories: number, protein: number, carbs: number, fat: number): TrackableFood {
  return { id, name, quantity, calories, protein, carbs, fat }
}

// 1/2. Complete one food / uncomplete one food -> reflected in the
// completed-id set the caller passes in (tracking-actions.ts owns
// persisting that set; this tests the pure classification on top of it).
test('computeMealStatus - a single completed food out of many is partial, not complete', () => {
  const foods = [food('f1', 'Eggs', 100, 143, 12.6, 0.7, 9.5), food('f2', 'Bread', 60, 160, 6, 30, 1.5)]
  const status = computeMealStatus(foods.map(f => f.id), new Set(['f1']))
  assert.strictEqual(status, 'partial')
})

test('computeMealStatus - uncompleting the only completed food returns to none', () => {
  const foods = [food('f1', 'Eggs', 100, 143, 12.6, 0.7, 9.5)]
  const status = computeMealStatus(foods.map(f => f.id), new Set())
  assert.strictEqual(status, 'none')
})

// 3/4/6. Complete entire meal / uncomplete entire meal / auto-detect fully
// completed meal.
test('computeMealStatus - every food completed is complete', () => {
  const foods = [food('f1', 'Eggs', 100, 143, 12.6, 0.7, 9.5), food('f2', 'Oats', 50, 129, 4, 23, 2)]
  const status = computeMealStatus(foods.map(f => f.id), new Set(['f1', 'f2']))
  assert.strictEqual(status, 'complete')
})

test('computeMealStatus - unchecking one food out of a fully completed meal drops it to partial', () => {
  const foods = [food('f1', 'Eggs', 100, 143, 12.6, 0.7, 9.5), food('f2', 'Oats', 50, 129, 4, 23, 2)]
  // Started complete (both ids), then Oats (f2) is unchecked.
  const status = computeMealStatus(foods.map(f => f.id), new Set(['f1']))
  assert.strictEqual(status, 'partial')
})

test('computeMealStatus - unchecking every food returns none', () => {
  const foods = [food('f1', 'Eggs', 100, 143, 12.6, 0.7, 9.5), food('f2', 'Oats', 50, 129, 4, 23, 2)]
  const status = computeMealStatus(foods.map(f => f.id), new Set())
  assert.strictEqual(status, 'none')
})

test('computeMealStatus - a meal with no foods is none, never vacuously complete', () => {
  assert.strictEqual(computeMealStatus([], new Set()), 'none')
})

// 5. Partial meal state (explicit two-of-three case matching the audit's
// Breakfast example: eggs + bread completed, oats not).
test('computeMealStatus - two of three foods completed is partial', () => {
  const foods = [
    food('f1', 'Eggs', 100, 143, 12.6, 0.7, 9.5),
    food('f2', 'Bread', 60, 160, 6, 30, 1.5),
    food('f3', 'Oats', 50, 129, 4, 23, 2)
  ]
  const status = computeMealStatus(foods.map(f => f.id), new Set(['f1', 'f2']))
  assert.strictEqual(status, 'partial')
})

// 7/8. Correct consumed macros for a partial meal vs. a complete meal -
// matches the audit's worked example exactly (eggs completed, oats not).
test('sumCompletedMacros - partial meal only counts the completed foods', () => {
  const eggs = food('f1', 'Eggs', 100, 228, 48, 3, 1)
  const oats = food('f2', 'Oats', 50, 129, 4, 23, 2)
  const totals = sumCompletedMacros([eggs, oats], new Set(['f1']))
  assert.deepStrictEqual(totals, { calories: 228, protein: 48, carbs: 3, fat: 1 })
})

test('sumCompletedMacros - complete meal counts every food, equalling the full meal total', () => {
  const eggs = food('f1', 'Eggs', 100, 228, 48, 3, 1)
  const oats = food('f2', 'Oats', 50, 129, 4, 23, 2)
  const totals = sumCompletedMacros([eggs, oats], new Set(['f1', 'f2']))
  const fullMeal = sumMacros([eggs, oats])
  assert.deepStrictEqual(totals, fullMeal)
  assert.deepStrictEqual(totals, { calories: 357, protein: 52, carbs: 26, fat: 3 })
})

test('sumCompletedMacros - no foods completed contributes nothing', () => {
  const eggs = food('f1', 'Eggs', 100, 228, 48, 3, 1)
  const totals = sumCompletedMacros([eggs], new Set())
  assert.deepStrictEqual(totals, { calories: 0, protein: 0, carbs: 0, fat: 0 })
})

// 11. Same food name appearing in more than one meal - identity must be by
// food_id (a distinct row per meal), never by name, so completing "Eggs" in
// Breakfast must not affect a separate "Eggs" row in a Snack.
test('buildFoodTrackingRow - two foods with the same name in different meals build independent rows keyed by food_id', () => {
  const breakfastEggs = food('breakfast-eggs-id', 'Eggs', 100, 143, 12.6, 0.7, 9.5)
  const snackEggs = food('snack-eggs-id', 'Eggs', 50, 71.5, 6.3, 0.35, 4.75)

  const rowA = buildFoodTrackingRow(
    { userId: 'u1', trackingDate: '2026-08-21', mealId: 'breakfast-id', mealName: 'Breakfast', completed: true, food: breakfastEggs },
    () => '2026-08-21T00:00:00.000Z'
  )
  const rowB = buildFoodTrackingRow(
    { userId: 'u1', trackingDate: '2026-08-21', mealId: 'snack-id', mealName: 'Snack', completed: false, food: snackEggs },
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

test('buildFoodTrackingRow - snapshots the food nutrition onto the row, independent of a later edit', () => {
  const eggs = food('f1', 'Eggs', 100, 143, 12.6, 0.7, 9.5)
  const row = buildFoodTrackingRow(
    { userId: 'u1', trackingDate: '2026-08-21', mealId: 'm1', mealName: 'Breakfast', completed: true, food: eggs },
    () => '2026-08-21T00:00:00.000Z'
  )
  assert.strictEqual(row.calories, 143)
  assert.strictEqual(row.food_name, 'Eggs')
  assert.strictEqual(row.quantity, 100)
})

// Insights calendar tier boundaries - each threshold is inclusive at its
// lower bound (90 is 'excellent', 89 is 'good'), and null (no daily_tracking
// row) is always 'none' regardless of any number.
test('adherenceTier - buckets percentages at the documented boundaries', () => {
  assert.strictEqual(adherenceTier(100), 'excellent')
  assert.strictEqual(adherenceTier(90), 'excellent')
  assert.strictEqual(adherenceTier(89), 'good')
  assert.strictEqual(adherenceTier(75), 'good')
  assert.strictEqual(adherenceTier(74), 'partial')
  assert.strictEqual(adherenceTier(50), 'partial')
  assert.strictEqual(adherenceTier(49), 'low')
  assert.strictEqual(adherenceTier(25), 'low')
  assert.strictEqual(adherenceTier(24), 'verylow')
  assert.strictEqual(adherenceTier(0), 'verylow')
  assert.strictEqual(adherenceTier(null), 'none')
})

test('dailyAdherencePct - averages all four macros hitting target exactly to 100', () => {
  const target = { calories: 2000, protein: 150, carbs: 200, fat: 70 }
  const pct = dailyAdherencePct(target, target)
  assert.strictEqual(pct, 100)
})

test('dailyAdherencePct - caps an over-target macro at 100 instead of inflating the average', () => {
  const target = { calories: 2000, protein: 150, carbs: 200, fat: 70 }
  // Calories at 200% of target, everything else untouched - an uncapped
  // average would read 137.5%, which would wrongly outrank a clean 100% day.
  const consumed = { calories: 4000, protein: 0, carbs: 0, fat: 0 }
  const pct = dailyAdherencePct(consumed, target)
  assert.strictEqual(pct, 25)
})

test('dailyAdherencePct - a target of 0 contributes 0, never divides by zero', () => {
  const consumed = { calories: 1000, protein: 50, carbs: 0, fat: 0 }
  const target = { calories: 2000, protein: 100, carbs: 0, fat: 0 }
  // calories 50% + protein 50% + carbs 0% (no target) + fat 0% (no target), / 4
  const pct = dailyAdherencePct(consumed, target)
  assert.strictEqual(pct, 25)
})
