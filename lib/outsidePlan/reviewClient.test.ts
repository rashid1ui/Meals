import test from 'node:test'
import assert from 'node:assert'
import {
  buildReviewItems,
  itemNeedsNutrition,
  recalcMatchedItem,
  toManualItem,
  newManualItem,
  sumReviewTotals,
  toConfirmItems,
  type ReviewItem
} from '@/app/dashboard/scan/reviewClient'
import type { FoodMacro } from '@/lib/nutrition/calculator'
import type { FoodAnalysisResult } from '@/lib/ai-vision/types'
import type { ResolvedOutsidePlanNutrition } from './nutritionResolution'

const CHICKEN: FoodMacro = { id: 'chicken', name: 'Chicken Breast, Cooked', serving_size: 100, serving_unit: 'grams', calories: 165, protein: 31, carbs: 0, fat: 3.6 }

const ANALYSIS: FoodAnalysisResult = {
  isFoodPhoto: true,
  items: [
    { name: 'grilled chicken', estimatedWeightG: 200, estimatedPortionDescription: 'a palm-sized piece', confidence: 0.82, notes: null },
    { name: 'white rice', estimatedWeightG: 180, estimatedPortionDescription: null, confidence: 0.6, notes: 'could be jasmine' },
    { name: 'mystery stew', estimatedWeightG: null, estimatedPortionDescription: 'one bowl', confidence: 0.3, notes: null }
  ],
  overallConfidence: 0.6,
  mealDescription: 'A plate of food',
  warnings: ['Sauces may add hidden calories']
}

const RESOLVED: ResolvedOutsidePlanNutrition = {
  items: [
    { originalName: 'grilled chicken', matchedFoodId: 'chicken', matchedFoodName: 'Chicken Breast, Cooked', weightG: 200, calories: 330, proteinG: 62, carbsG: 0, fatG: 7.2, matchTier: 'high', matchConfidence: 0.9, source: 'food_database', warnings: [] },
    { originalName: 'white rice', matchedFoodId: null, matchedFoodName: null, weightG: 180, calories: null, proteinG: null, carbsG: null, fatG: null, matchTier: 'low', matchConfidence: 0.4, source: 'unresolved', warnings: ['dry vs cooked - review'] },
    { originalName: 'mystery stew', matchedFoodId: null, matchedFoodName: null, weightG: null, calories: null, proteinG: null, carbsG: null, fatG: null, matchTier: 'unresolved', matchConfidence: 0, source: 'unresolved', warnings: ['no safe match'] }
  ],
  totals: { calories: 330, proteinG: 62, carbsG: 0, fatG: 7.2 },
  hasUnresolvedItems: true
}

// ---- C. Review state: building the initial list ----

test('C. buildReviewItems maps a trusted match to a "matched" item with computed macros', () => {
  const items = buildReviewItems(ANALYSIS, RESOLVED)
  assert.strictEqual(items.length, 3)
  assert.strictEqual(items[0].source, 'matched')
  assert.strictEqual(items[0].matchedFoodId, 'chicken')
  assert.strictEqual(items[0].tierLabel, 'high')
  assert.strictEqual(items[0].calories, 330)
  assert.strictEqual(items[0].portionText, 'a palm-sized piece')
  assert.strictEqual(itemNeedsNutrition(items[0]), false)
})

test('C. an unresolved item is "manual" with null macros - nothing fabricated - and needs nutrition', () => {
  const items = buildReviewItems(ANALYSIS, RESOLVED)
  assert.strictEqual(items[1].source, 'manual')
  assert.strictEqual(items[1].calories, null)
  assert.strictEqual(items[1].weightG, 180) // AI weight estimate still surfaced
  assert.strictEqual(itemNeedsNutrition(items[1]), true)
  assert.strictEqual(items[2].weightG, null)
  assert.strictEqual(itemNeedsNutrition(items[2]), true)
})

// ---- D. editing weight recomputes ONLY for a trusted match ----

test('D. recalcMatchedItem scales macros deterministically from the basis', () => {
  const base = buildReviewItems(ANALYSIS, RESOLVED)[0]
  const at100 = recalcMatchedItem(base, CHICKEN, 100)
  assert.strictEqual(at100.calories, 165)
  assert.strictEqual(at100.protein, 31)
  const at250 = recalcMatchedItem(base, CHICKEN, 250)
  assert.strictEqual(at250.calories, 412.5)
})

test('D. clearing the weight on a matched item nulls its macros (no fabrication, blocks confirm)', () => {
  const base = buildReviewItems(ANALYSIS, RESOLVED)[0]
  const cleared = recalcMatchedItem(base, CHICKEN, null)
  assert.strictEqual(cleared.calories, null)
  assert.strictEqual(cleared.weightG, null)
  assert.strictEqual(itemNeedsNutrition(cleared), true)
})

// ---- manual override ----

test('manual: toManualItem detaches from the catalog and keeps current numbers as the editable start', () => {
  const matched = recalcMatchedItem(buildReviewItems(ANALYSIS, RESOLVED)[0], CHICKEN, 200)
  const manual = toManualItem(matched)
  assert.strictEqual(manual.source, 'manual')
  assert.strictEqual(manual.matchedFoodId, null)
  assert.strictEqual(manual.calories, 330) // carried over, now user-editable
  assert.strictEqual(manual.tierLabel, 'manual')
})

test('manual: a completed manual item passes the nutrition guard', () => {
  const item: ReviewItem = { ...newManualItem(), name: 'Sauce', calories: 90, protein: 0, carbs: 3, fat: 8 }
  assert.strictEqual(itemNeedsNutrition(item), false)
})

test('manual: an added item with no name still needs review', () => {
  assert.strictEqual(itemNeedsNutrition(newManualItem()), true)
})

// ---- totals + confirm payload ----

test('sumReviewTotals ignores null macros (partial totals, never fabricated)', () => {
  const items = buildReviewItems(ANALYSIS, RESOLVED)
  assert.deepStrictEqual(sumReviewTotals(items), { calories: 330, protein: 62, carbs: 0, fat: 7.2 })
})

test('toConfirmItems carries source, matchedFoodId, weight and the detected/originalName audit fields', () => {
  const items = buildReviewItems(ANALYSIS, RESOLVED)
  const payload = toConfirmItems(items)
  assert.strictEqual(payload[0].source, 'matched')
  assert.strictEqual(payload[0].matchedFoodId, 'chicken')
  assert.strictEqual(payload[0].detected, true)
  assert.strictEqual(payload[0].originalName, 'grilled chicken')
  assert.strictEqual(payload[2].source, 'manual')
})
