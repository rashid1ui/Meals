import test from 'node:test'
import assert from 'node:assert'
import { servingDisplayFor, type ServingDisplayFood } from './servingDisplay'

const chicken: ServingDisplayFood = {
  id: 'chicken',
  name: 'Chicken Breast, Raw',
  serving_size: 100,
  serving_unit: 'grams',
  calories: 120,
  protein: 22.5,
  carbs: 0,
  fat: 2.6,
  display_unit: 'g',
  grams_per_display_unit: 1
}

// Matches the real "Limitless Whey Protein (25g protein/serving)" row: a
// 30g scoop is stated per-100g-of-powder in storage (83.33g protein/100g),
// which correctly derives to 25g protein for one 30g scoop.
const whey: ServingDisplayFood = {
  id: 'whey',
  name: 'Limitless Whey Protein (25g protein/serving)',
  serving_size: 100,
  serving_unit: 'grams',
  calories: 333.33333333333337,
  protein: 83.33333333333334,
  carbs: 0,
  fat: 0,
  display_unit: 'serving',
  grams_per_display_unit: 30
}

// A newly-created serving-based food (this feature's fix): serving_size ==
// grams_per_display_unit, and stored macros ARE the per-serving values
// directly (no per-100g derivation).
const newScoopFood: ServingDisplayFood = {
  id: 'new-scoop',
  name: 'New Whey',
  serving_size: 30,
  serving_unit: 'grams',
  calories: 120,
  protein: 25,
  carbs: 3,
  fat: 2,
  display_unit: 'serving',
  grams_per_display_unit: 30
}

test('weight-based food shows its stored per-100g values unchanged, labeled "per 100g"', () => {
  const display = servingDisplayFor(chicken)
  assert.strictEqual(display.calories, 120)
  assert.strictEqual(display.protein, 22.5)
  assert.strictEqual(display.label, 'per 100g')
})

test('a scoop-based supplement (serving_size=100 storage convention) displays per-scoop macros, not per-100g', () => {
  const display = servingDisplayFor(whey)
  assert.ok(Math.abs(display.protein - 25) < 0.001, `expected ~25g protein per scoop, got ${display.protein}`)
  assert.strictEqual(display.label, 'per serving')
  // The raw stored value (83.33g/100g) must NOT be what's shown.
  assert.notStrictEqual(Math.round(display.protein), Math.round(whey.protein))
})

test('a food created with serving_size = grams_per_display_unit shows its direct per-serving values', () => {
  const display = servingDisplayFor(newScoopFood)
  assert.strictEqual(display.protein, 25)
  assert.strictEqual(display.calories, 120)
})
