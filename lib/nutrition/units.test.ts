import test from 'node:test'
import assert from 'node:assert'
import {
  toCanonicalGrams,
  toDisplayQuantity,
  isWholeDisplayQuantity,
  isValidGramsPerUnit,
  fixedGramsPerUnit,
  requiresGramsPerUnit,
  canonicalServingUnitFor,
  servingSizeFor,
  type UnitConfig
} from './units'

// 1. 200g chicken -> 200g (plain gram food, identity conversion)
test('toCanonicalGrams - 200g chicken stays 200g', () => {
  const config: UnitConfig = { displayUnit: 'g', gramsPerDisplayUnit: 1 }
  assert.strictEqual(toCanonicalGrams(200, config), 200)
})

// 2. 3 eggs x 50g -> 150g
test('toCanonicalGrams - 3 eggs at 50g each is 150g', () => {
  const config: UnitConfig = { displayUnit: 'piece', gramsPerDisplayUnit: 50 }
  assert.strictEqual(toCanonicalGrams(3, config), 150)
})

// 3. 3 bread slices x 35g -> 105g
test('toCanonicalGrams - 3 bread slices at 35g each is 105g', () => {
  const config: UnitConfig = { displayUnit: 'slice', gramsPerDisplayUnit: 35 }
  assert.strictEqual(toCanonicalGrams(3, config), 105)
})

// 4. 1kg food -> 1000g
test('fixedGramsPerUnit - kg is always exactly 1000g', () => {
  assert.strictEqual(fixedGramsPerUnit('kg'), 1000)
  const config: UnitConfig = { displayUnit: 'kg', gramsPerDisplayUnit: 1000 }
  assert.strictEqual(toCanonicalGrams(1, config), 1000)
})

// 5. solver output 150g eggs -> display 3 eggs (exact)
test('toDisplayQuantity - solver output of 150g for a 50g egg displays as exactly 3', () => {
  const config: UnitConfig = { displayUnit: 'piece', gramsPerDisplayUnit: 50 }
  assert.strictEqual(toDisplayQuantity(150, config), 3)
  assert.strictEqual(isWholeDisplayQuantity(150, config), true)
})

// 6. solver output 105g bread -> display 3 slices (exact)
test('toDisplayQuantity - solver output of 105g for a 35g slice displays as exactly 3', () => {
  const config: UnitConfig = { displayUnit: 'slice', gramsPerDisplayUnit: 35 }
  assert.strictEqual(toDisplayQuantity(105, config), 3)
  assert.strictEqual(isWholeDisplayQuantity(105, config), true)
})

test('isWholeDisplayQuantity - a solver output that does not divide evenly is flagged as approximate', () => {
  // 140g of a 50g egg is 2.8 eggs - not a whole number, must be shown as
  // approximate rather than silently rounded to a clean "3".
  const config: UnitConfig = { displayUnit: 'piece', gramsPerDisplayUnit: 50 }
  assert.strictEqual(isWholeDisplayQuantity(140, config), false)
  assert.strictEqual(toDisplayQuantity(140, config), 3) // still rounds for display...
  // ...but the canonical grams are never touched by rounding - only the
  // displayed label is approximate. Callers must consult
  // isWholeDisplayQuantity() before presenting the number as exact.
})

// 7. invalid zero grams-per-unit rejected
test('isValidGramsPerUnit - zero is rejected', () => {
  assert.strictEqual(isValidGramsPerUnit(0), false)
})

// 8. invalid negative grams-per-unit rejected
test('isValidGramsPerUnit - negative is rejected', () => {
  assert.strictEqual(isValidGramsPerUnit(-5), false)
})

test('isValidGramsPerUnit - a sensible positive value is accepted, an absurd one is not', () => {
  assert.strictEqual(isValidGramsPerUnit(50), true)
  assert.strictEqual(isValidGramsPerUnit(2001), false)
})

// 9. existing gram-based foods continue working (identity conversion both ways)
test('existing gram-based foods round-trip with no change - g and ml are identity conversions', () => {
  const gConfig: UnitConfig = { displayUnit: 'g', gramsPerDisplayUnit: 1 }
  const mlConfig: UnitConfig = { displayUnit: 'ml', gramsPerDisplayUnit: 1 }
  assert.strictEqual(toCanonicalGrams(250, gConfig), 250)
  assert.strictEqual(toDisplayQuantity(250, gConfig), 250)
  assert.strictEqual(toCanonicalGrams(330, mlConfig), 330)
  assert.strictEqual(toDisplayQuantity(330, mlConfig), 330)
})

test('requiresGramsPerUnit - only piece/slice/serving require an explicit weight', () => {
  assert.strictEqual(requiresGramsPerUnit('piece'), true)
  assert.strictEqual(requiresGramsPerUnit('slice'), true)
  assert.strictEqual(requiresGramsPerUnit('serving'), true)
  assert.strictEqual(requiresGramsPerUnit('g'), false)
  assert.strictEqual(requiresGramsPerUnit('kg'), false)
  assert.strictEqual(requiresGramsPerUnit('ml'), false)
})

test('servingSizeFor - a scoop-based food uses its own gram weight as serving_size, not 100', () => {
  assert.strictEqual(servingSizeFor('serving', 30), 30)
  assert.strictEqual(servingSizeFor('piece', 50), 50)
  assert.strictEqual(servingSizeFor('slice', 35), 35)
})

test('servingSizeFor - g/kg/ml foods keep the existing per-100 convention', () => {
  assert.strictEqual(servingSizeFor('g', 1), 100)
  assert.strictEqual(servingSizeFor('kg', 1000), 100)
  assert.strictEqual(servingSizeFor('ml', 1), 100)
})

test('canonicalServingUnitFor - ml maps to the existing ml convention, everything else maps to grams', () => {
  assert.strictEqual(canonicalServingUnitFor('ml'), 'ml')
  assert.strictEqual(canonicalServingUnitFor('g'), 'grams')
  assert.strictEqual(canonicalServingUnitFor('kg'), 'grams')
  assert.strictEqual(canonicalServingUnitFor('piece'), 'grams')
  assert.strictEqual(canonicalServingUnitFor('slice'), 'grams')
  assert.strictEqual(canonicalServingUnitFor('serving'), 'grams')
})
