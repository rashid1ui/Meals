// Coverage for the manual onboarding meal builder's data-flow correctness -
// against the *existing, reused* pure helpers (lib/diet/save-plan.ts,
// lib/diet/diff.ts, lib/nutrition/calculator.ts, lib/nutrition/proteinType.ts,
// lib/nutrition/carbType.ts) rather than duplicating their logic. There is
// deliberately no new pure logic inside app/onboarding/manual-actions.ts
// itself to unit-test - it's a 'use server' action whose real behavior
// (DB writes, RLS) is covered separately by
// tests/integration/manual-plan.test.ts.
import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveMeal, validateMealsShape, type SaveDietPlanMeal } from './save-plan'
import { computeMealTotals, computeDailyTotals, type DraftMeal } from './diff'
import { calculateFoodMacros, type FoodMacro } from '../nutrition/calculator'
import { splitProteinByType } from '../nutrition/proteinType'
import { splitCarbsByType } from '../nutrition/carbType'

function dbFood(overrides: Partial<FoodMacro> & { id: string }): FoodMacro {
  return {
    name: 'Chicken Breast, Raw',
    serving_size: 100,
    serving_unit: 'grams',
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    ...overrides
  }
}

test('creating a manual plan - a valid from-scratch payload (every food has foodDatabaseId, nothing locked) resolves correctly', () => {
  const chicken = dbFood({ id: 'chicken', name: 'Chicken Breast, Raw', calories: 165, protein: 31, carbs: 0, fat: 3.6 })
  const rice = dbFood({ id: 'rice', name: 'White Rice, Dry', calories: 365, protein: 7.1, carbs: 80, fat: 0.7 })

  const foodDatabaseById = new Map([
    [chicken.id, chicken],
    [rice.id, rice]
  ])

  const payload: SaveDietPlanMeal[] = [
    {
      name: 'Lunch',
      foods: [
        { foodDatabaseId: 'chicken', originalFoodId: null, quantity: 150, unit: 'grams' },
        { foodDatabaseId: 'rice', originalFoodId: null, quantity: 100, unit: 'grams' }
      ]
    }
  ]

  assert.strictEqual(validateMealsShape(payload), null)

  const result = resolveMeal(payload[0], foodDatabaseById, new Map())
  assert.ok('meal' in result)
  if (!('meal' in result)) return

  assert.strictEqual(result.meal.name, 'Lunch')
  assert.strictEqual(result.meal.foods.length, 2)
  const [resolvedChicken, resolvedRice] = result.meal.foods
  assert.strictEqual(resolvedChicken.calories, 165 * 1.5)
  assert.strictEqual(resolvedChicken.protein, 31 * 1.5)
  assert.strictEqual(resolvedRice.carbs, 80)
})

test('validateMealsShape - rejects an empty meal list and an unnamed meal, same structural rules saveDietPlan enforces', () => {
  assert.notStrictEqual(validateMealsShape([]), null)
  assert.notStrictEqual(validateMealsShape([{ name: '  ', foods: [] }]), null)
  assert.strictEqual(validateMealsShape([{ name: 'Breakfast', foods: [] }]), null)
})

test('adding a food - resolveMeal produces correct macros for a newly-added foodDatabaseId item', () => {
  const oats = dbFood({ id: 'oats', name: 'Rolled Oats, Dry', calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9 })
  const foodDatabaseById = new Map([[oats.id, oats]])

  const meal: SaveDietPlanMeal = {
    name: 'Breakfast',
    foods: [{ foodDatabaseId: 'oats', originalFoodId: null, quantity: 50, unit: 'grams' }]
  }

  const result = resolveMeal(meal, foodDatabaseById, new Map())
  assert.ok('meal' in result)
  if (!('meal' in result)) return

  const [resolved] = result.meal.foods
  const expected = calculateFoodMacros(50, oats)
  assert.strictEqual(resolved.calories, expected.calories)
  assert.strictEqual(resolved.protein, expected.protein)
  assert.strictEqual(resolved.carbs, expected.carbs)
  assert.strictEqual(resolved.fat, expected.fat)
})

test('changing quantity - recomputed macros scale linearly with the new quantity', () => {
  const chicken = dbFood({ id: 'chicken', calories: 165, protein: 31, carbs: 0, fat: 3.6 })

  const at100g = calculateFoodMacros(100, chicken)
  const at250g = calculateFoodMacros(250, chicken)

  assert.strictEqual(at250g.calories, at100g.calories * 2.5)
  assert.strictEqual(at250g.protein, at100g.protein * 2.5)
  assert.strictEqual(at250g.fat, at100g.fat * 2.5)
})

test('resolveMeal - rejects an unresolvable foodDatabaseId rather than silently trusting client-sent macros', () => {
  const meal: SaveDietPlanMeal = {
    name: 'Lunch',
    foods: [{ foodDatabaseId: 'does-not-exist', originalFoodId: null, quantity: 100, unit: 'grams' }]
  }
  const result = resolveMeal(meal, new Map(), new Map())
  assert.ok('error' in result)
})

test('macro calculation correctness - computeMealTotals/computeDailyTotals sum correctly across meals', () => {
  const meals: DraftMeal[] = [
    {
      id: 'm1',
      name: 'Breakfast',
      sortOrder: 0,
      foods: [
        { id: 'f1', foodDatabaseId: 'oats', name: 'Rolled Oats, Dry', quantity: 50, unit: 'grams', calories: 194.5, protein: 8.45, carbs: 33.15, fat: 3.45 }
      ]
    },
    {
      id: 'm2',
      name: 'Lunch',
      sortOrder: 1,
      foods: [
        { id: 'f2', foodDatabaseId: 'chicken', name: 'Chicken Breast, Raw', quantity: 150, unit: 'grams', calories: 247.5, protein: 46.5, carbs: 0, fat: 5.4 },
        { id: 'f3', foodDatabaseId: 'rice', name: 'White Rice, Dry', quantity: 100, unit: 'grams', calories: 365, protein: 7.1, carbs: 80, fat: 0.7 }
      ]
    }
  ]

  const lunchTotals = computeMealTotals(meals[1])
  assert.strictEqual(lunchTotals.calories, 247.5 + 365)
  assert.strictEqual(lunchTotals.protein, 46.5 + 7.1)

  const dailyTotals = computeDailyTotals(meals)
  // Floating-point summation order isn't guaranteed to match a differently-
  // ordered literal sum bit-for-bit - compared with an epsilon, same as this
  // file's other cross-total reconciliation checks below.
  assert.ok(Math.abs(dailyTotals.calories - (194.5 + 247.5 + 365)) < 1e-9)
  assert.ok(Math.abs(dailyTotals.protein - (8.45 + 46.5 + 7.1)) < 1e-9)
  assert.ok(Math.abs(dailyTotals.carbs - (33.15 + 0 + 80)) < 1e-9)
  assert.ok(Math.abs(dailyTotals.fat - (3.45 + 5.4 + 0.7)) < 1e-9)
})

test('macro calculation correctness - splitProteinByType/splitCarbsByType reconcile exactly to the daily totals', () => {
  const meals: DraftMeal[] = [
    {
      id: 'm1',
      name: 'Breakfast',
      sortOrder: 0,
      foods: [
        { id: 'f1', foodDatabaseId: 'oats', name: 'Rolled Oats, Dry', quantity: 50, unit: 'grams', calories: 194.5, protein: 8.45, carbs: 33.15, fat: 3.45 }
      ]
    },
    {
      id: 'm2',
      name: 'Lunch',
      sortOrder: 1,
      foods: [
        { id: 'f2', foodDatabaseId: 'chicken', name: 'Chicken Breast, Raw', quantity: 150, unit: 'grams', calories: 247.5, protein: 46.5, carbs: 0, fat: 5.4 }
      ]
    }
  ]

  const allFoods = meals.flatMap(m => m.foods)
  const dailyTotals = computeDailyTotals(meals)

  const proteinLookup = new Map([
    ['Rolled Oats, Dry', 'plant' as const],
    ['Chicken Breast, Raw', 'animal' as const]
  ])
  const proteinBreakdown = splitProteinByType(allFoods, proteinLookup)
  assert.ok(Math.abs(proteinBreakdown.animal + proteinBreakdown.plant + proteinBreakdown.supplement - dailyTotals.protein) < 1e-9)

  const carbLookup = new Map([['Rolled Oats, Dry', 'complex' as const]])
  const carbBreakdown = splitCarbsByType(allFoods, carbLookup)
  assert.ok(Math.abs(carbBreakdown.simple + carbBreakdown.complex - dailyTotals.carbs) < 1e-9)
})
