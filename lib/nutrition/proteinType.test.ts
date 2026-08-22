import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyProteinType, splitProteinByType, zeroProteinBreakdown } from './proteinType'

test('classifyProteinType - keyword fallback classifies common animal foods', () => {
  assert.equal(classifyProteinType('Chicken Breast, Raw'), 'animal')
  assert.equal(classifyProteinType('Nonfat Greek Yogurt'), 'animal')
  assert.equal(classifyProteinType('Cheddar Cheese'), 'animal')
})

test('classifyProteinType - keyword fallback classifies common plant foods', () => {
  assert.equal(classifyProteinType('Rolled Oats, Dry'), 'plant')
  assert.equal(classifyProteinType('Black Beans, Dry'), 'plant')
  assert.equal(classifyProteinType('Tofu, Firm, Raw'), 'plant')
})

test('classifyProteinType - keyword fallback classifies supplements, even when the category says protein', () => {
  assert.equal(classifyProteinType('ON Gold Standard Whey Protein', 'protein'), 'supplement')
})

test('classifyProteinType - falls back to category when no keyword matches', () => {
  assert.equal(classifyProteinType('Mystery Product', 'protein'), 'animal')
  assert.equal(classifyProteinType('Mystery Product', 'dairy'), 'animal')
  assert.equal(classifyProteinType('Mystery Product', 'carbohydrate'), 'plant')
  assert.equal(classifyProteinType('Mystery Product', null), 'plant')
})

test('splitProteinByType - uses the authoritative lookup when present', () => {
  const lookup = new Map([['Chicken Breast, Raw', 'animal' as const]])
  const result = splitProteinByType([{ name: 'Chicken Breast, Raw', protein: 30 }], lookup)
  assert.deepEqual(result, { animal: 30, plant: 0, supplement: 0 })
})

test('splitProteinByType - falls back to the heuristic classifier for an unknown name', () => {
  const lookup = new Map<string, 'animal' | 'plant' | 'supplement' | null>()
  const result = splitProteinByType([{ name: 'Rolled Oats, Dry', protein: 10 }], lookup)
  assert.deepEqual(result, { animal: 0, plant: 10, supplement: 0 })
})

test('splitProteinByType - buckets always sum to exactly the total input protein', () => {
  const lookup = new Map([
    ['Chicken Breast, Raw', 'animal' as const],
    ['Rolled Oats, Dry', 'plant' as const],
    ['ON Gold Standard Whey Protein', 'supplement' as const]
  ])
  const foods = [
    { name: 'Chicken Breast, Raw', protein: 33.2 },
    { name: 'Rolled Oats, Dry', protein: 12.7 },
    { name: 'ON Gold Standard Whey Protein', protein: 24 }
  ]
  const result = splitProteinByType(foods, lookup)
  const total = foods.reduce((sum, f) => sum + f.protein, 0)
  assert.ok(Math.abs(result.animal + result.plant + result.supplement - total) < 1e-9)
})

test('zeroProteinBreakdown - starts every bucket at 0', () => {
  assert.deepEqual(zeroProteinBreakdown(), { animal: 0, plant: 0, supplement: 0 })
})
