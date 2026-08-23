import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyCarbType, splitCarbsByType, zeroCarbBreakdown } from './carbType'

test('classifyCarbType - keyword fallback classifies common simple-carb foods', () => {
  assert.equal(classifyCarbType('Granulated Sugar'), 'simple')
  assert.equal(classifyCarbType('Raw Honey'), 'simple')
  assert.equal(classifyCarbType('Orange Juice'), 'simple')
  assert.equal(classifyCarbType('White Bread, Sliced'), 'simple')
})

test('classifyCarbType - keyword fallback classifies common complex-carb foods', () => {
  assert.equal(classifyCarbType('Rolled Oats, Dry'), 'complex')
  assert.equal(classifyCarbType('Brown Rice, Dry'), 'complex')
  assert.equal(classifyCarbType('Sweet Potato, Raw'), 'complex')
  assert.equal(classifyCarbType('Quinoa, Dry'), 'complex')
  assert.equal(classifyCarbType('Black Beans, Dry'), 'complex')
})

test('classifyCarbType - falls back to category when no keyword matches', () => {
  assert.equal(classifyCarbType('Mystery Product', 'fruit'), 'simple')
  assert.equal(classifyCarbType('Mystery Product', 'carbohydrate'), 'complex')
  assert.equal(classifyCarbType('Mystery Product', null), 'complex')
})

test('splitCarbsByType - uses the authoritative lookup when present', () => {
  const lookup = new Map([['Rolled Oats, Dry', 'complex' as const]])
  const result = splitCarbsByType([{ name: 'Rolled Oats, Dry', carbs: 27 }], lookup)
  assert.deepEqual(result, { simple: 0, complex: 27 })
})

test('splitCarbsByType - falls back to the heuristic classifier for an unknown name', () => {
  const lookup = new Map<string, 'simple' | 'complex' | null>()
  const result = splitCarbsByType([{ name: 'Granulated Sugar', carbs: 12 }], lookup)
  assert.deepEqual(result, { simple: 12, complex: 0 })
})

test('splitCarbsByType - buckets always sum to exactly the total input carbs', () => {
  const lookup = new Map([
    ['Rolled Oats, Dry', 'complex' as const],
    ['Banana, Raw', 'simple' as const]
  ])
  const foods = [
    { name: 'Rolled Oats, Dry', carbs: 27.3 },
    { name: 'Banana, Raw', carbs: 22.8 },
    { name: 'Mystery Snack', carbs: 15.1 }
  ]
  const result = splitCarbsByType(foods, lookup)
  const total = foods.reduce((sum, f) => sum + f.carbs, 0)
  assert.ok(Math.abs(result.simple + result.complex - total) < 1e-9)
})

test('zeroCarbBreakdown - starts every bucket at 0', () => {
  assert.deepEqual(zeroCarbBreakdown(), { simple: 0, complex: 0 })
})
