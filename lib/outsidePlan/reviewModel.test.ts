import test from 'node:test'
import assert from 'node:assert'
import {
  validateConfirmItems,
  computeConfirmedTotals,
  bucketConfidence,
  deriveWasEdited,
  buildOutsidePlanEntryRow,
  assertScanEventConfirmable,
  interpretClaimResult,
  foldOutsidePlanIntoConsumed,
  OUTSIDE_PLAN_MAX_CALORIES,
  OUTSIDE_PLAN_MAX_MACRO_G,
  type ConfirmItemInput,
  type ValidatedReviewItem
} from './reviewModel'
import { splitProteinByType } from '@/lib/nutrition/proteinType'
import type { FoodMacro } from '@/lib/nutrition/calculator'
import type { FoodAnalysisResult } from '@/lib/ai-vision/types'

const CHICKEN: FoodMacro = { id: 'chicken', name: 'Chicken Breast, Cooked', serving_size: 100, serving_unit: 'grams', calories: 165, protein: 31, carbs: 0, fat: 3.6 }
const RICE: FoodMacro = { id: 'rice', name: 'White Rice, Cooked', serving_size: 100, serving_unit: 'grams', calories: 130, protein: 2.7, carbs: 28, fat: 0.3 }
const CATALOG = new Map<string, FoodMacro>([[CHICKEN.id, CHICKEN], [RICE.id, RICE]])

function matchedItem(over: Partial<ConfirmItemInput> = {}): ConfirmItemInput {
  return {
    clientId: 'a',
    name: 'grilled chicken',
    source: 'matched',
    matchedFoodId: 'chicken',
    weightG: 200,
    calories: 999999, // deliberately absurd - server must ignore this for a matched item
    protein: 999999,
    carbs: 999999,
    fat: 999999,
    detected: true,
    originalName: 'grilled chicken',
    aiConfidence: 0.8,
    ...over
  }
}

function manualItem(over: Partial<ConfirmItemInput> = {}): ConfirmItemInput {
  return {
    clientId: 'b',
    name: 'secret sauce',
    source: 'manual',
    matchedFoodId: null,
    weightG: 40,
    calories: 120,
    protein: 1,
    carbs: 6,
    fat: 10,
    detected: false,
    originalName: null,
    aiConfidence: null,
    ...over
  }
}

// ---- D. Nutrition behavior ----

test('D. a matched item recomputes macros from the catalog, ignoring client-sent calories/macros', () => {
  const res = validateConfirmItems([matchedItem({ weightG: 200 })], CATALOG)
  assert.ok(res.ok)
  if (!res.ok) return
  const item = res.items[0]
  // 200g of 165kcal/100g = 330, not the 999999 the client sent.
  assert.strictEqual(item.calories, 330)
  assert.strictEqual(item.protein, 62)
  assert.strictEqual(item.carbs, 0)
  assert.strictEqual(item.fat, 7.2)
  assert.strictEqual(item.matchedFoodId, 'chicken')
  assert.strictEqual(item.matchedFoodName, 'Chicken Breast, Cooked')
})

test('D. a matched item with no weight is rejected - nutrition is never fabricated', () => {
  const res = validateConfirmItems([matchedItem({ weightG: null })], CATALOG)
  assert.strictEqual(res.ok, false)
  if (res.ok) return
  assert.match(res.invalid[0].reason, /weight/i)
})

test('D. a matched item whose food id is not in the fresh catalog is rejected', () => {
  const res = validateConfirmItems([matchedItem({ matchedFoodId: 'deactivated-food' })], CATALOG)
  assert.strictEqual(res.ok, false)
  if (res.ok) return
  assert.match(res.invalid[0].reason, /no longer linked|manually/i)
})

test('D. a manual item keeps the user-entered nutrition verbatim (rounded to 0.1)', () => {
  const res = validateConfirmItems([manualItem({ calories: 123.45, protein: 2.34, carbs: 5.67, fat: 8.91 })], CATALOG)
  assert.ok(res.ok)
  if (!res.ok) return
  assert.deepStrictEqual(
    { c: res.items[0].calories, p: res.items[0].protein, cb: res.items[0].carbs, f: res.items[0].fat },
    { c: 123.5, p: 2.3, cb: 5.7, f: 8.9 }
  )
  assert.strictEqual(res.items[0].source, 'manual')
  assert.strictEqual(res.items[0].matchedFoodId, null)
})

test('D. a manual item missing a macro is rejected', () => {
  const res = validateConfirmItems([manualItem({ fat: null })], CATALOG)
  assert.strictEqual(res.ok, false)
})

test('D. a manual item with a negative macro is rejected', () => {
  const res = validateConfirmItems([manualItem({ protein: -1 })], CATALOG)
  assert.strictEqual(res.ok, false)
})

test('D. a blank name is rejected', () => {
  const res = validateConfirmItems([manualItem({ name: '   ' })], CATALOG)
  assert.strictEqual(res.ok, false)
})

test('D. an empty item list is rejected', () => {
  const res = validateConfirmItems([], CATALOG)
  assert.strictEqual(res.ok, false)
})

test('D. a manual macro over the per-entry CHECK bound is rejected (not silently clamped)', () => {
  const res = validateConfirmItems([manualItem({ protein: OUTSIDE_PLAN_MAX_MACRO_G + 1 })], CATALOG)
  assert.strictEqual(res.ok, false)
})

// ---- E. Confirmation: server recalculates totals ----

test('E. computeConfirmedTotals sums the validated item values, never a client number', () => {
  const res = validateConfirmItems([matchedItem({ weightG: 100 }), manualItem()], CATALOG)
  assert.ok(res.ok)
  if (!res.ok) return
  const totals = computeConfirmedTotals(res.items)
  assert.ok(totals.ok)
  if (!totals.ok) return
  // 100g chicken (165/31/0/3.6) + manual sauce (120/1/6/10)
  assert.strictEqual(totals.totals.calories, 285)
  assert.strictEqual(totals.totals.protein, 32)
  assert.strictEqual(totals.totals.carbs, 6)
  assert.strictEqual(totals.totals.fat, 13.6)
})

test('E. a total calorie sum over the entry ceiling is a clean error, not a failed insert', () => {
  const items: ValidatedReviewItem[] = [
    { name: 'x', source: 'manual', matchedFoodId: null, matchedFoodName: null, weightG: null, calories: OUTSIDE_PLAN_MAX_CALORIES, protein: 10, carbs: 10, fat: 10, detected: false, originalName: null, aiConfidence: null },
    { name: 'y', source: 'manual', matchedFoodId: null, matchedFoodName: null, weightG: null, calories: 200, protein: 10, carbs: 10, fat: 10, detected: false, originalName: null, aiConfidence: null }
  ]
  const totals = computeConfirmedTotals(items)
  assert.strictEqual(totals.ok, false)
})

// ---- Idempotency gate ----

test('assertScanEventConfirmable - missing row is not_found', () => {
  assert.deepStrictEqual(assertScanEventConfirmable(null, 'u1'), { status: 'not_found' })
})

test("assertScanEventConfirmable - another user's row is not_found (never leaks existence)", () => {
  assert.deepStrictEqual(
    assertScanEventConfirmable({ user_id: 'other', resulting_entry_id: null }, 'u1'),
    { status: 'not_found' }
  )
})

test('assertScanEventConfirmable - an already-confirmed row returns the existing entry id (idempotent replay)', () => {
  assert.deepStrictEqual(
    assertScanEventConfirmable({ user_id: 'u1', resulting_entry_id: 'entry-9' }, 'u1'),
    { status: 'already_confirmed', entryId: 'entry-9' }
  )
})

test('assertScanEventConfirmable - a fresh owned row is ok', () => {
  assert.deepStrictEqual(assertScanEventConfirmable({ user_id: 'u1', resulting_entry_id: null }, 'u1'), { status: 'ok' })
})

// ---- was_edited derivation ----

const ANALYSIS: FoodAnalysisResult = {
  isFoodPhoto: true,
  items: [
    { name: 'grilled chicken', estimatedWeightG: 200, estimatedPortionDescription: null, confidence: 0.8, notes: null },
    { name: 'rice', estimatedWeightG: 150, estimatedPortionDescription: null, confidence: 0.7, notes: null }
  ],
  overallConfidence: 0.75,
  mealDescription: 'Chicken and rice',
  warnings: []
}

function validated(over: Partial<ValidatedReviewItem>): ValidatedReviewItem {
  return {
    name: 'grilled chicken',
    source: 'matched',
    matchedFoodId: 'chicken',
    matchedFoodName: 'Chicken Breast, Cooked',
    weightG: 200,
    calories: 330,
    protein: 62,
    carbs: 0,
    fat: 7.2,
    detected: true,
    originalName: 'grilled chicken',
    aiConfidence: 0.8,
    ...over
  }
}

test('deriveWasEdited - identical to the AI result is not edited', () => {
  const items = [validated({}), validated({ name: 'rice', originalName: 'rice', matchedFoodId: 'rice', weightG: 150 })]
  assert.strictEqual(deriveWasEdited(ANALYSIS, items), false)
})

test('deriveWasEdited - a changed weight counts as edited', () => {
  const items = [validated({ weightG: 250 }), validated({ name: 'rice', originalName: 'rice', matchedFoodId: 'rice', weightG: 150 })]
  assert.strictEqual(deriveWasEdited(ANALYSIS, items), true)
})

test('deriveWasEdited - a removed item counts as edited', () => {
  assert.strictEqual(deriveWasEdited(ANALYSIS, [validated({})]), true)
})

test('deriveWasEdited - a hand-added item counts as edited', () => {
  const items = [
    validated({}),
    validated({ name: 'rice', originalName: 'rice', matchedFoodId: 'rice', weightG: 150 }),
    validated({ name: 'sauce', detected: false, source: 'manual', matchedFoodId: null, originalName: null })
  ]
  assert.strictEqual(deriveWasEdited(ANALYSIS, items), true)
})

// ---- bucketConfidence ----

test('bucketConfidence - thresholds and null', () => {
  assert.strictEqual(bucketConfidence(0.9), 'high')
  assert.strictEqual(bucketConfidence(0.75), 'high')
  assert.strictEqual(bucketConfidence(0.6), 'medium')
  assert.strictEqual(bucketConfidence(0.2), 'low')
  assert.strictEqual(bucketConfidence(null), null)
  assert.strictEqual(bucketConfidence(undefined), null)
})

// ---- buildOutsidePlanEntryRow ----

test('buildOutsidePlanEntryRow - shapes an ai_scan row with server totals and a non-blank label', () => {
  const items: ValidatedReviewItem[] = [validated({})]
  const row = buildOutsidePlanEntryRow({
    userId: 'u1',
    trackingDate: '2026-09-05',
    mealContext: 'lunch',
    items,
    totals: { calories: 330, protein: 62, carbs: 0, fat: 7.2 },
    analysis: ANALYSIS,
    aiModel: 'kimi-k2.6',
    imageStoragePath: 'u1/abc.jpg'
  })
  assert.strictEqual(row.source, 'ai_scan')
  assert.strictEqual(row.user_id, 'u1')
  assert.strictEqual(row.tracking_date, '2026-09-05')
  assert.strictEqual(row.meal_context, 'lunch')
  assert.strictEqual(row.calories, 330)
  assert.ok(typeof row.item_name === 'string' && (row.item_name as string).trim().length > 0)
  assert.ok(Array.isArray(row.components) && (row.components as unknown[]).length === 1)
  assert.strictEqual(row.ai_confidence, 'high') // overallConfidence 0.75 -> 'high'
  assert.deepStrictEqual(row.ai_raw_response, ANALYSIS)
})

// ---- foldOutsidePlanIntoConsumed ----

test('foldOutsidePlanIntoConsumed - adds the outside-plan portion onto planned consumed', () => {
  const planned = { calories: 1000, protein: 100, carbs: 80, fat: 30 }
  const { consumed, outsidePlanTotals } = foldOutsidePlanIntoConsumed(planned, [
    { calories: 330, protein: 62, carbs: 0, fat: 7.2 },
    { calories: 120, protein: 1, carbs: 6, fat: 10 }
  ])
  assert.deepStrictEqual(outsidePlanTotals, { calories: 450, protein: 63, carbs: 6, fat: 17.2 })
  assert.deepStrictEqual(consumed, { calories: 1450, protein: 163, carbs: 86, fat: 47.2 })
})

test('foldOutsidePlanIntoConsumed - no outside-plan rows leaves planned consumed unchanged', () => {
  const planned = { calories: 1000, protein: 100, carbs: 80, fat: 30 }
  const { consumed, outsidePlanTotals } = foldOutsidePlanIntoConsumed(planned, [])
  assert.deepStrictEqual(consumed, planned)
  assert.deepStrictEqual(outsidePlanTotals, { calories: 0, protein: 0, carbs: 0, fat: 0 })
})

// ---- Phase 6: no double counting (section 15) ----

test('D. the outside-plan portion is added exactly once - consumed = planned + sum(rows), never twice', () => {
  const planned = { calories: 1800, protein: 140, carbs: 150, fat: 55 }
  const rows = [
    { calories: 200, protein: 8, carbs: 22, fat: 9 },
    { calories: 100, protein: 2, carbs: 12, fat: 5 }
  ]
  const { consumed, outsidePlanTotals } = foldOutsidePlanIntoConsumed(planned, rows)
  assert.strictEqual(consumed.calories, 1800 + 300)
  assert.strictEqual(consumed.protein, 140 + 10)
  // consumed - outsidePlanTotals must give the planned portion back exactly
  assert.strictEqual(consumed.calories - outsidePlanTotals.calories, planned.calories)
  assert.strictEqual(consumed.protein - outsidePlanTotals.protein, planned.protein)
})

test('D. recomputing from source rows is idempotent - same planned base + same rows => identical result every time', () => {
  const planned = { calories: 900, protein: 70, carbs: 60, fat: 25 }
  const rows = [{ calories: 330, protein: 62, carbs: 0, fat: 7.2 }]
  const a = foldOutsidePlanIntoConsumed(planned, rows)
  const b = foldOutsidePlanIntoConsumed(planned, rows)
  const c = foldOutsidePlanIntoConsumed(planned, rows)
  assert.deepStrictEqual(a, b)
  assert.deepStrictEqual(b, c)
})

// ---- Phase 6: protein breakdown reconciliation with outside-plan items (section 12) ----

test('F. outside-plan protein is classified by item name and the breakdown still sums to total consumed protein', () => {
  const plannedProteinFoods = [
    { name: 'Chicken Breast', protein: 40 },
    { name: 'Whey Protein', protein: 24 },
    { name: 'Lentils', protein: 9 }
  ]
  const outsidePlanFoods = [
    { name: 'Cheeseburger', protein: 25 }, // "cheese" -> animal keyword
    { name: 'French Fries', protein: 4 } // no keyword -> plant default
  ]
  const totalProtein = [...plannedProteinFoods, ...outsidePlanFoods].reduce((n, f) => n + f.protein, 0)
  const breakdown = splitProteinByType([...plannedProteinFoods, ...outsidePlanFoods], new Map(), new Map())
  assert.strictEqual(breakdown.animal + breakdown.plant + breakdown.supplement, totalProtein)
  // the outside-plan burger's protein is not silently dropped
  assert.ok(breakdown.animal >= 25)
})

// ---- Phase 6: claim-race resolution (section 6) ----

test('interpretClaimResult - exactly one claimed row means this request won', () => {
  assert.strictEqual(interpretClaimResult([{ id: 'entry-1' }], null), 'won')
})

test('interpretClaimResult - zero claimed rows means a concurrent confirm already won', () => {
  assert.strictEqual(interpretClaimResult([], null), 'lost')
})

test('interpretClaimResult - null/undefined rows is a loss (roll back, fall back to winner)', () => {
  assert.strictEqual(interpretClaimResult(null, null), 'lost')
  assert.strictEqual(interpretClaimResult(undefined, null), 'lost')
})

test('interpretClaimResult - any driver error is a loss, never assumed a win (avoids two entries)', () => {
  assert.strictEqual(interpretClaimResult([{ id: 'entry-1' }], { message: 'connection reset' }), 'lost')
})

test('interpretClaimResult - more than one row is defensively a loss', () => {
  assert.strictEqual(interpretClaimResult([{ id: 'a' }, { id: 'b' }], null), 'lost')
})
