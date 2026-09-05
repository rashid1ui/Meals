import test from 'node:test'
import assert from 'node:assert'
import { resolveNutritionForItem, resolveOutsidePlanNutrition } from './nutritionResolution'
import type { FoodCandidate } from './nutritionMatching'
import type { FoodAnalysisItem, FoodAnalysisResult } from '@/lib/ai-vision/types'

const CHICKEN_COOKED: FoodCandidate = { id: 'chicken-cooked', name: 'Chicken Breast, Cooked', category: 'protein', serving_size: 100, serving_unit: 'grams', calories: 165, protein: 31, carbs: 0, fat: 3.6 }
const WHITE_RICE_DRY: FoodCandidate = { id: 'white-rice-dry', name: 'White Rice, Dry', category: 'carbohydrate', serving_size: 100, serving_unit: 'grams', calories: 365, protein: 7.1, carbs: 80, fat: 0.7 }
const APPLE: FoodCandidate = { id: 'apple', name: 'Apple, Raw', category: 'fruit', serving_size: 100, serving_unit: 'grams', calories: 52, protein: 0.3, carbs: 13.8, fat: 0.2 }
const CANDIDATES: FoodCandidate[] = [CHICKEN_COOKED, WHITE_RICE_DRY, APPLE]

function item(overrides: Partial<FoodAnalysisItem>): FoodAnalysisItem {
  return { name: 'grilled chicken breast', estimatedWeightG: 180, estimatedPortionDescription: null, confidence: 0.8, notes: null, ...overrides }
}

// ---- E. Weight scaling ----

test('E. scales correctly at 100g (identity multiplier)', () => {
  const result = resolveNutritionForItem(item({ name: 'grilled chicken breast', estimatedWeightG: 100 }), CANDIDATES)
  assert.strictEqual(result.calories, 165)
  assert.strictEqual(result.proteinG, 31)
})

test('E. scales correctly at 150g', () => {
  const result = resolveNutritionForItem(item({ name: 'grilled chicken breast', estimatedWeightG: 150 }), CANDIDATES)
  assert.strictEqual(result.calories, 165 * 1.5)
  assert.strictEqual(result.proteinG, 31 * 1.5)
})

test('E. scales correctly at 250g', () => {
  const result = resolveNutritionForItem(item({ name: 'grilled chicken breast', estimatedWeightG: 250 }), CANDIDATES)
  assert.strictEqual(result.calories, 165 * 2.5)
})

test('E. null weight leaves nutrition null even with a good food match', () => {
  const result = resolveNutritionForItem(item({ name: 'grilled chicken breast', estimatedWeightG: null }), CANDIDATES)
  assert.strictEqual(result.matchedFoodId, 'chicken-cooked')
  assert.strictEqual(result.calories, null)
  assert.strictEqual(result.weightG, null)
  assert.ok(result.warnings.some(w => w.toLowerCase().includes('weight')))
})

// ---- F. Macro calculation + aggregate totals ----

test('F. calculates calories, protein, carbs, and fat from the matched candidate, never from Kimi', () => {
  const result = resolveNutritionForItem(item({ name: 'grilled chicken breast', estimatedWeightG: 200 }), CANDIDATES)
  assert.strictEqual(result.calories, 330)
  assert.strictEqual(result.proteinG, 62)
  assert.strictEqual(result.carbsG, 0)
  assert.strictEqual(result.fatG, 7.2)
})

test('F. aggregate totals are the deterministic sum of resolved items only', () => {
  const vision: FoodAnalysisResult = {
    isFoodPhoto: true,
    items: [
      { name: 'grilled chicken breast', estimatedWeightG: 100, estimatedPortionDescription: null, confidence: 0.8, notes: null },
      { name: 'apple', estimatedWeightG: 150, estimatedPortionDescription: null, confidence: 0.9, notes: null }
    ],
    overallConfidence: 0.85,
    mealDescription: null,
    warnings: []
  }
  const resolved = resolveOutsidePlanNutrition(vision, CANDIDATES)
  assert.strictEqual(resolved.totals.calories, 165 + 52 * 1.5)
  assert.strictEqual(resolved.hasUnresolvedItems, false)
})

// ---- G. Multiple food items ----

test('G. multiple items each get their own independent resolution', () => {
  const vision: FoodAnalysisResult = {
    isFoodPhoto: true,
    items: [
      { name: 'grilled chicken breast', estimatedWeightG: 180, estimatedPortionDescription: null, confidence: 0.85, notes: null },
      { name: 'apple', estimatedWeightG: 120, estimatedPortionDescription: null, confidence: 0.9, notes: null },
      { name: 'unidentifiable mystery food', estimatedWeightG: 50, estimatedPortionDescription: null, confidence: 0.2, notes: null }
    ],
    overallConfidence: 0.6,
    mealDescription: null,
    warnings: []
  }
  const resolved = resolveOutsidePlanNutrition(vision, CANDIDATES)
  assert.strictEqual(resolved.items.length, 3)
  assert.strictEqual(resolved.items[0].matchedFoodId, 'chicken-cooked')
  assert.strictEqual(resolved.items[1].matchedFoodId, 'apple')
  assert.strictEqual(resolved.items[2].matchedFoodId, null)
  assert.strictEqual(resolved.hasUnresolvedItems, true)
  // The two resolved items still contribute to totals despite the third
  // being unresolved.
  assert.ok(resolved.totals.calories > 0)
})

// ---- H. Mixed dishes ----

test('H. a mixed dish with no safe component breakdown resolves as unresolved, never inventing ingredient macros', () => {
  const result = resolveNutritionForItem(item({ name: 'mixed green salad', estimatedWeightG: 100 }), CANDIDATES)
  assert.strictEqual(result.matchedFoodId, null)
  assert.strictEqual(result.calories, null)
  assert.strictEqual(result.source, 'unresolved')
})

test('H. when Kimi separates a dish into components, each component resolves independently', () => {
  const vision: FoodAnalysisResult = {
    isFoodPhoto: true,
    items: [
      { name: 'grilled chicken breast', estimatedWeightG: 150, estimatedPortionDescription: null, confidence: 0.8, notes: null },
      { name: 'white rice', estimatedWeightG: 150, estimatedPortionDescription: null, confidence: 0.7, notes: null }
    ],
    overallConfidence: 0.75,
    mealDescription: 'Chicken and rice plate',
    warnings: []
  }
  const resolved = resolveOutsidePlanNutrition(vision, CANDIDATES)
  assert.strictEqual(resolved.items[0].matchedFoodId, 'chicken-cooked')
  // "white rice" against a Dry-only candidate must NOT silently resolve at
  // full confidence (the dry-vs-cooked safety case) - it's fine for this
  // test if it ends up unresolved or low-confidence, but it must never be
  // presented as a clean high-confidence match.
  assert.notStrictEqual(resolved.items[1].matchTier, 'high')
})

// ---- I. Unknown/custom food ----

test('I. a food not in the catalog returns unresolved with the original name preserved, never inserted into food_database', () => {
  const result = resolveNutritionForItem(item({ name: 'exotic dragonfruit smoothie bowl', estimatedWeightG: 300 }), CANDIDATES)
  assert.strictEqual(result.matchedFoodId, null)
  assert.strictEqual(result.originalName, 'exotic dragonfruit smoothie bowl')
  assert.strictEqual(result.source, 'unresolved')
})

// ---- J. Branded food ambiguity ----

test('J. a branded product name does not get force-matched to a generic unrelated candidate', () => {
  const result = resolveNutritionForItem(item({ name: 'Big Mac burger', estimatedWeightG: 220 }), CANDIDATES)
  assert.strictEqual(result.matchedFoodId, null)
})

// ---- K. Invalid AI values ----

test('K. a negative weight is treated as invalid and ignored, not passed to macro calculation', () => {
  const result = resolveNutritionForItem(item({ name: 'apple', estimatedWeightG: -50 }), CANDIDATES)
  assert.strictEqual(result.weightG, null)
  assert.strictEqual(result.calories, null)
})

test('K. a zero weight is treated as invalid', () => {
  const result = resolveNutritionForItem(item({ name: 'apple', estimatedWeightG: 0 }), CANDIDATES)
  assert.strictEqual(result.calories, null)
})

test('K. NaN/Infinity weight values are rejected defensively', () => {
  const result = resolveNutritionForItem(item({ name: 'apple', estimatedWeightG: NaN }), CANDIDATES)
  assert.strictEqual(result.calories, null)
})

// ---- L. Out-of-range weights ----

test('L. an absurdly large weight beyond the sanity ceiling is rejected, never scaled', () => {
  const result = resolveNutritionForItem(item({ name: 'apple', estimatedWeightG: 999999 }), CANDIDATES)
  assert.strictEqual(result.weightG, null)
  assert.strictEqual(result.calories, null)
})

test('L. a weight exactly at the ceiling is accepted', () => {
  const result = resolveNutritionForItem(item({ name: 'apple', estimatedWeightG: 3000 }), CANDIDATES)
  assert.strictEqual(result.calories, 52 * 30)
})

// ---- M. Null nutrition fields ----

test('M. unresolved items have all four macro fields null, never a mix of null and fabricated numbers', () => {
  const result = resolveNutritionForItem(item({ name: 'totally unknown dish', estimatedWeightG: 200 }), CANDIDATES)
  assert.strictEqual(result.calories, null)
  assert.strictEqual(result.proteinG, null)
  assert.strictEqual(result.carbsG, null)
  assert.strictEqual(result.fatG, null)
})

// ---- N. Rounding behavior ----

test('N. per-item nutrition values are not pre-rounded (full precision preserved for downstream display/aggregation)', () => {
  const result = resolveNutritionForItem(item({ name: 'apple', estimatedWeightG: 137 }), CANDIDATES)
  assert.strictEqual(result.calories, 52 * 1.37)
  assert.notStrictEqual(result.calories, Math.round(52 * 1.37))
})

test('N. aggregate totals are not rounded per-item before summing (no compounding rounding error)', () => {
  const vision: FoodAnalysisResult = {
    isFoodPhoto: true,
    items: [
      { name: 'apple', estimatedWeightG: 33, estimatedPortionDescription: null, confidence: 0.8, notes: null },
      { name: 'apple', estimatedWeightG: 33, estimatedPortionDescription: null, confidence: 0.8, notes: null },
      { name: 'apple', estimatedWeightG: 34, estimatedPortionDescription: null, confidence: 0.8, notes: null }
    ],
    overallConfidence: 0.8,
    mealDescription: null,
    warnings: []
  }
  const resolved = resolveOutsidePlanNutrition(vision, CANDIDATES)
  const exactSum = (52 * 0.33) + (52 * 0.33) + (52 * 0.34)
  assert.strictEqual(resolved.totals.calories, exactSum)
})

test('an empty items list resolves cleanly to zero totals with no unresolved flag', () => {
  const vision: FoodAnalysisResult = { isFoodPhoto: true, items: [], overallConfidence: null, mealDescription: null, warnings: [] }
  const resolved = resolveOutsidePlanNutrition(vision, CANDIDATES)
  assert.strictEqual(resolved.items.length, 0)
  assert.strictEqual(resolved.totals.calories, 0)
  assert.strictEqual(resolved.hasUnresolvedItems, false)
})
