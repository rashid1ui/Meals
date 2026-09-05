import test from 'node:test'
import assert from 'node:assert'
import { parseFoodAnalysisResponse } from './schema'

test('parses a valid single-item response', () => {
  const raw = JSON.stringify({
    is_food_photo: true,
    items: [
      { name: 'Grilled chicken breast', estimated_weight_g: 180, estimated_portion_description: 'about a palm-sized piece', confidence: 0.8, notes: null }
    ],
    overall_confidence: 0.75,
    meal_description: 'Grilled chicken with a side salad',
    warnings: []
  })
  const parsed = parseFoodAnalysisResponse(raw)
  assert.strictEqual(parsed.ok, true)
  if (!parsed.ok) return
  assert.strictEqual(parsed.result.isFoodPhoto, true)
  assert.strictEqual(parsed.result.items.length, 1)
  assert.strictEqual(parsed.result.items[0].name, 'Grilled chicken breast')
  assert.strictEqual(parsed.result.items[0].estimatedWeightG, 180)
  assert.strictEqual(parsed.result.overallConfidence, 0.75)
})

test('parses multiple distinct food items', () => {
  const raw = JSON.stringify({
    is_food_photo: true,
    items: [
      { name: 'Cheeseburger', estimated_weight_g: 220, estimated_portion_description: null, confidence: 0.6, notes: null },
      { name: 'French fries', estimated_weight_g: 120, estimated_portion_description: 'medium portion', confidence: 0.7, notes: null },
      { name: 'Ketchup', estimated_weight_g: null, estimated_portion_description: 'small dollop', confidence: 0.3, notes: 'amount not clearly visible' }
    ],
    overall_confidence: 0.6,
    meal_description: 'Fast food meal',
    warnings: ['Sauce/condiment amounts are hard to estimate visually']
  })
  const parsed = parseFoodAnalysisResponse(raw)
  assert.strictEqual(parsed.ok, true)
  if (!parsed.ok) return
  assert.strictEqual(parsed.result.items.length, 3)
  assert.strictEqual(parsed.result.items[2].estimatedWeightG, null)
  assert.strictEqual(parsed.result.warnings.length, 1)
})

test('missing weight and null confidence normalize to null, not zero or a fabricated default', () => {
  const raw = JSON.stringify({
    is_food_photo: true,
    items: [{ name: 'Mystery casserole', estimated_weight_g: null, estimated_portion_description: null, confidence: null, notes: 'Ingredients could not be separated' }],
    overall_confidence: null,
    meal_description: null,
    warnings: ['Multiple ingredients appear mixed together and could not be reliably separated']
  })
  const parsed = parseFoodAnalysisResponse(raw)
  assert.strictEqual(parsed.ok, true)
  if (!parsed.ok) return
  assert.strictEqual(parsed.result.items[0].estimatedWeightG, null)
  assert.strictEqual(parsed.result.items[0].confidence, null)
  assert.strictEqual(parsed.result.overallConfidence, null)
})

test('a nullable field omitted entirely (not even sent as null) still normalizes to null', () => {
  const raw = JSON.stringify({
    is_food_photo: true,
    items: [{ name: 'Apple' }],
    warnings: []
  })
  const parsed = parseFoodAnalysisResponse(raw)
  assert.strictEqual(parsed.ok, true)
  if (!parsed.ok) return
  assert.strictEqual(parsed.result.items[0].estimatedWeightG, null)
  assert.strictEqual(parsed.result.items[0].confidence, null)
  assert.strictEqual(parsed.result.overallConfidence, null)
  assert.strictEqual(parsed.result.mealDescription, null)
})

test('rejects malformed JSON', () => {
  const parsed = parseFoodAnalysisResponse('{ this is not valid JSON')
  assert.strictEqual(parsed.ok, false)
  if (parsed.ok) return
  assert.strictEqual(parsed.reason, 'json_parse_error')
})

test('rejects a confidence value outside 0-1', () => {
  const raw = JSON.stringify({
    is_food_photo: true,
    items: [{ name: 'Rice', confidence: 1.5 }],
    warnings: []
  })
  const parsed = parseFoodAnalysisResponse(raw)
  assert.strictEqual(parsed.ok, false)
  if (parsed.ok) return
  assert.strictEqual(parsed.reason, 'schema_validation_error')
})

test('rejects a negative estimated weight', () => {
  const raw = JSON.stringify({
    is_food_photo: true,
    items: [{ name: 'Rice', estimated_weight_g: -50 }],
    warnings: []
  })
  const parsed = parseFoodAnalysisResponse(raw)
  assert.strictEqual(parsed.ok, false)
})

test('rejects an absurdly large estimated weight (hallucinated value)', () => {
  const raw = JSON.stringify({
    is_food_photo: true,
    items: [{ name: 'Rice', estimated_weight_g: 500000 }],
    warnings: []
  })
  const parsed = parseFoodAnalysisResponse(raw)
  assert.strictEqual(parsed.ok, false)
})

test('rejects a blank item name', () => {
  const raw = JSON.stringify({
    is_food_photo: true,
    items: [{ name: '   ' }],
    warnings: []
  })
  const parsed = parseFoodAnalysisResponse(raw)
  assert.strictEqual(parsed.ok, false)
})

test('rejects is_food_photo of the wrong type (not a boolean)', () => {
  const raw = JSON.stringify({
    is_food_photo: 'yes',
    items: [],
    warnings: []
  })
  const parsed = parseFoodAnalysisResponse(raw)
  assert.strictEqual(parsed.ok, false)
})

test('rejects more items than the configured maximum (array limit)', () => {
  const raw = JSON.stringify({
    is_food_photo: true,
    items: Array.from({ length: 50 }, (_, i) => ({ name: `Item ${i}` })),
    warnings: []
  })
  const parsed = parseFoodAnalysisResponse(raw)
  assert.strictEqual(parsed.ok, false)
})

test('an unexpected/hallucinated top-level field is silently dropped, not treated as fatal', () => {
  const raw = JSON.stringify({
    is_food_photo: true,
    items: [{ name: 'Apple' }],
    warnings: [],
    unexpected_field: 'the model invented this key',
    confidence_percent: 95
  })
  const parsed = parseFoodAnalysisResponse(raw)
  assert.strictEqual(parsed.ok, true)
  if (!parsed.ok) return
  assert.strictEqual(parsed.result.items[0].name, 'Apple')
  assert.ok(!('unexpected_field' in parsed.result))
})

test('an unexpected field inside an item object is also silently dropped', () => {
  const raw = JSON.stringify({
    is_food_photo: true,
    items: [{ name: 'Apple', calories: 95, brand: 'Fabricated Brand Inc' }],
    warnings: []
  })
  const parsed = parseFoodAnalysisResponse(raw)
  assert.strictEqual(parsed.ok, true)
  if (!parsed.ok) return
  assert.ok(!('calories' in parsed.result.items[0]), 'the vision layer must never carry a calories field through to the normalized result')
  assert.ok(!('brand' in parsed.result.items[0]))
})

test('is_food_photo=false with no items is valid (correctly identifies a non-food photo)', () => {
  const raw = JSON.stringify({
    is_food_photo: false,
    items: [],
    overall_confidence: 0.9,
    meal_description: null,
    warnings: ['This looks like a restaurant menu, not a photo of food']
  })
  const parsed = parseFoodAnalysisResponse(raw)
  assert.strictEqual(parsed.ok, true)
  if (!parsed.ok) return
  assert.strictEqual(parsed.result.isFoodPhoto, false)
  assert.strictEqual(parsed.result.items.length, 0)
})

test('an empty string item name (after trimming) is rejected even if non-empty before trim', () => {
  const raw = JSON.stringify({
    is_food_photo: true,
    items: [{ name: '\n\t  \n' }],
    warnings: []
  })
  const parsed = parseFoodAnalysisResponse(raw)
  assert.strictEqual(parsed.ok, false)
})
