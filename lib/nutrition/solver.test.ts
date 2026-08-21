import test from 'node:test'
import assert from 'node:assert'
import { solveDietQuantities, MIN_QUANTITY, MAX_QUANTITY } from './solver'
import type { FoodMacro } from './calculator'

const chicken: FoodMacro = {
  id: 'chicken',
  name: 'Chicken Breast, Raw',
  serving_size: 100,
  serving_unit: 'grams',
  calories: 120,
  protein: 22.5,
  carbs: 0,
  fat: 2.6
}

const rice: FoodMacro = {
  id: 'rice',
  name: 'White Rice, Dry',
  serving_size: 100,
  serving_unit: 'grams',
  calories: 365,
  protein: 7.1,
  carbs: 80,
  fat: 0.7
}

const oil: FoodMacro = {
  id: 'oil',
  name: 'Olive Oil',
  serving_size: 100,
  serving_unit: 'grams',
  calories: 884,
  protein: 0,
  carbs: 0,
  fat: 100
}

const oats: FoodMacro = {
  id: 'oats',
  name: 'Oats, Rolled',
  serving_size: 100,
  serving_unit: 'grams',
  calories: 379,
  protein: 13.2,
  carbs: 67.7,
  fat: 6.5
}

test('solveDietQuantities - 1. Simple exact solution', () => {
  // If we just want 120 kcal, 22.5p, 0c, 2.6f, it should perfectly map to 100g chicken
  const result = solveDietQuantities([chicken], 120, 22.5, 0, 2.6)
  assert.strictEqual(result.feasible, true)
  assert.strictEqual(result.quantities['chicken'], 100)
})

test('solveDietQuantities - 2. Protein-heavy target', () => {
  const result = solveDietQuantities([chicken, rice, oil], 1850, 250, 100, 50)
  assert.strictEqual(result.feasible, true)
  // Ensure protein is hit
  assert.ok(result.percentageErrors.protein <= 10) // Should be well within tolerance
})

test('solveDietQuantities - 3. High-carb target', () => {
  const result = solveDietQuantities([chicken, rice, oil], 2500, 100, 400, 50)
  assert.strictEqual(result.feasible, true)
  assert.ok(result.percentageErrors.carbs <= 10)
})

test('solveDietQuantities - 4. High-fat target', () => {
  const result = solveDietQuantities([chicken, rice, oil], 2150, 100, 100, 150)
  assert.strictEqual(result.feasible, true)
  assert.ok(result.percentageErrors.fat <= 10)
})

test('solveDietQuantities - 5. Mixed macro target (The known regression scenario)', () => {
  const result = solveDietQuantities([chicken, rice, oil], 2250, 150, 250, 70)
  assert.strictEqual(result.feasible, true)
  assert.ok(result.percentageErrors.calories <= 5)
  assert.ok(result.percentageErrors.protein <= 10)
  assert.ok(result.percentageErrors.carbs <= 10)
  assert.ok(result.percentageErrors.fat <= 10)
})

test('solveDietQuantities - 6. Multiple foods (4 foods)', () => {
  const result = solveDietQuantities([chicken, rice, oil, oats], 2500, 180, 250, 80)
  assert.strictEqual(result.feasible, true)
  assert.ok(result.quantities['chicken'] >= MIN_QUANTITY)
  assert.ok(result.quantities['rice'] >= MIN_QUANTITY)
  assert.ok(result.quantities['oil'] >= MIN_QUANTITY)
  assert.ok(result.quantities['oats'] >= MIN_QUANTITY)
})

test('solveDietQuantities - 7. 10g minimum quantity', () => {
  // If we only need a tiny bit of fat, oil shouldn't go below 10g
  const result = solveDietQuantities([chicken, rice, oil], 1000, 100, 100, 0) // 0 target fat
  assert.strictEqual(result.quantities['oil'], MIN_QUANTITY)
})

test('solveDietQuantities - 8. 1000g maximum quantity', () => {
  // Need massive amounts of protein, but only chicken is available
  const result = solveDietQuantities([chicken], 10000, 1000, 0, 0)
  assert.strictEqual(result.quantities['chicken'], MAX_QUANTITY)
})

test('solveDietQuantities - 9. Impossible target', () => {
  // 100g protein, but only oil is selected. Impossible.
  const result = solveDietQuantities([oil], 2000, 100, 100, 100)
  assert.strictEqual(result.feasible, false)
  assert.ok(result.reason?.includes('Protein') || result.reason?.includes('Carbs'))
})

test('solveDietQuantities - 13. Very small target', () => {
  const result = solveDietQuantities([chicken, rice], 450, 50, 50, 6)
  assert.strictEqual(result.feasible, true)
})

test('solveDietQuantities - 14. Extreme macro ratios', () => {
  // Keto diet (very low carb, high fat/protein)
  const result = solveDietQuantities([chicken, rice, oil], 2000, 150, 20, 140)
  // Might be infeasible if rice minimum (10g) pushes carbs too high, let's check
  // 10g rice = 8g carbs. Still under 20g target. Should be feasible.
  assert.strictEqual(result.feasible, true)
})
