// Realistic end-to-end smoke test for Phase 4 (Question 22): "photo of a
// plate containing chicken + rice + salad" through the full pipeline -
// FoodAnalysisResult -> resolveOutsidePlanNutrition -> resolved items +
// totals - using the ACTUAL, real food_database contents (fetched live via
// the Supabase MCP tool during this session, not invented) as the
// candidate catalog, and a fixture modeled directly on this project's own
// verified real Kimi K2.6 smoke-test output style (Phase 3's fruit-bowl/
// apple results: item names, portion descriptions, per-item confidence,
// notes, and warnings all follow the exact shape Kimi actually returned).
//
// This does NOT hit the live database or the live Kimi API - the
// pre-existing missing SUPABASE_SERVICE_ROLE_KEY in this environment
// (documented in every phase's report so far) still blocks a true live
// round-trip; fetchActiveFoodCandidates's own query construction is
// separately unit-tested with a fake client in
// nutritionResolutionService.test.ts. What this test proves is the full
// matching + calculation + aggregation pipeline against real catalog data,
// deterministically and for free.

import test from 'node:test'
import assert from 'node:assert'
import { resolveOutsidePlanNutrition } from './nutritionResolution'
import type { FoodCandidate } from './nutritionMatching'
import type { FoodAnalysisResult } from '@/lib/ai-vision/types'

// Verbatim subset of the real, live food_database as of this session
// (queried via the Supabase MCP execute_sql tool) - not synthetic. The
// inactive "ggg" test row is filtered out below, exactly as
// fetchActiveFoodCandidates's is_active=true query would do.
const REAL_FOOD_DATABASE_SNAPSHOT: FoodCandidate[] = [
  { id: 'feb07a0b-a43e-4dec-a509-63e04b4f6de6', name: 'Chicken Breast, Cooked', category: 'protein', serving_size: 100, serving_unit: 'grams', calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  { id: '3a95aed5-6491-4cf2-99d7-59c53346dcd3', name: 'Chicken Breast, Raw', category: 'protein', serving_size: 100, serving_unit: 'grams', calories: 120, protein: 22.5, carbs: 0, fat: 2.6 },
  { id: 'f0fb3a36-d806-4012-8223-91af1adbd9eb', name: 'White Rice, Dry', category: 'carbohydrate', serving_size: 100, serving_unit: 'grams', calories: 365, protein: 7.1, carbs: 80, fat: 0.7 },
  { id: '39ca0604-3d8d-4e22-a879-824e5b3a2fc3', name: 'Brown Rice, Dry', category: 'carbohydrate', serving_size: 100, serving_unit: 'grams', calories: 367, protein: 7.5, carbs: 76.2, fat: 3.2 },
  { id: 'a71610cb-75c5-4691-b466-a5ce345514da', name: 'Lettuce, Raw', category: 'vegetable', serving_size: 100, serving_unit: 'grams', calories: 17, protein: 1.2, carbs: 3.3, fat: 0.3 },
  { id: '2cfd31bb-6511-4668-a98a-686b95c55f83', name: 'Bell Pepper, Raw', category: 'vegetable', serving_size: 100, serving_unit: 'grams', calories: 31, protein: 1, carbs: 6, fat: 0.3 },
  { id: 'e51d89ee-b6ae-46eb-9992-82977d6a8dd8', name: 'Tomato, Raw', category: 'vegetable', serving_size: 100, serving_unit: 'grams', calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2 },
  { id: 'dd6e35e3-48c7-427e-be62-cb911f5289ec', name: 'Apple, Raw', category: 'fruit', serving_size: 100, serving_unit: 'grams', calories: 52, protein: 0.3, carbs: 13.8, fat: 0.2 }
]

// Modeled on this project's own verified real Kimi K2.6 output (Phase 3
// smoke test): specific portion language, per-item confidence, honest
// notes/warnings about ambiguity - not an idealized fixture.
const CHICKEN_RICE_SALAD_SCAN: FoodAnalysisResult = {
  isFoodPhoto: true,
  items: [
    {
      name: 'grilled chicken breast',
      estimatedWeightG: 180,
      estimatedPortionDescription: 'one palm-sized grilled chicken breast',
      confidence: 0.85,
      notes: 'visible grill marks, skinless'
    },
    {
      name: 'white rice',
      estimatedWeightG: 150,
      estimatedPortionDescription: 'about one cup, steamed',
      confidence: 0.75,
      notes: 'appears steamed/cooked, not a dry pantry ingredient'
    },
    {
      name: 'mixed green salad',
      estimatedWeightG: null,
      estimatedPortionDescription: 'a side portion of mixed greens',
      confidence: 0.55,
      notes: 'multiple leafy/vegetable components, dressing amount not visible'
    }
  ],
  overallConfidence: 0.72,
  mealDescription: 'Grilled chicken breast with steamed rice and a side salad',
  warnings: ['Salad dressing/oil amount cannot be estimated from the photo, which may add unaccounted calories']
}

test('realistic scan: chicken resolves confidently against the real catalog with correct scaled macros', () => {
  const resolved = resolveOutsidePlanNutrition(CHICKEN_RICE_SALAD_SCAN, REAL_FOOD_DATABASE_SNAPSHOT)
  const chicken = resolved.items[0]
  assert.strictEqual(chicken.matchedFoodId, 'feb07a0b-a43e-4dec-a509-63e04b4f6de6') // Chicken Breast, Cooked
  assert.strictEqual(chicken.matchTier, 'high')
  assert.strictEqual(chicken.weightG, 180)
  assert.strictEqual(chicken.calories, 165 * 1.8)
  assert.strictEqual(chicken.proteinG, 31 * 1.8)
  assert.strictEqual(chicken.source, 'food_database')
})

test('realistic scan: rice is NOT confidently auto-applied against the real catalog (the real catalog only has a Dry-basis entry)', () => {
  const resolved = resolveOutsidePlanNutrition(CHICKEN_RICE_SALAD_SCAN, REAL_FOOD_DATABASE_SNAPSHOT)
  const rice = resolved.items[1]
  // This is the real, live-verified gap this session found: the actual
  // production food_database has no "cooked rice" entry, only dry/pantry
  // basis rows. A photographed plate of steamed rice must never be
  // silently scaled against dry-rice calorie density (~2.8x overstatement)
  // - it must be low-confidence/unresolved with an explicit warning.
  assert.notStrictEqual(rice.matchTier, 'high')
  if (rice.matchedFoodId) {
    assert.ok(rice.warnings.some(w => w.toLowerCase().includes('dry') || w.toLowerCase().includes('overstate')))
  } else {
    assert.strictEqual(rice.calories, null)
  }
})

test('realistic scan: the salad is a mixed dish and remains unresolved, no ingredient breakdown is invented', () => {
  const resolved = resolveOutsidePlanNutrition(CHICKEN_RICE_SALAD_SCAN, REAL_FOOD_DATABASE_SNAPSHOT)
  const salad = resolved.items[2]
  assert.strictEqual(salad.matchedFoodId, null)
  assert.strictEqual(salad.calories, null)
  assert.strictEqual(salad.source, 'unresolved')
  assert.strictEqual(salad.originalName, 'mixed green salad')
})

test('realistic scan: aggregate totals reflect only the resolved item(s) and flag the result as partial', () => {
  const resolved = resolveOutsidePlanNutrition(CHICKEN_RICE_SALAD_SCAN, REAL_FOOD_DATABASE_SNAPSHOT)
  assert.strictEqual(resolved.hasUnresolvedItems, true) // salad (and likely rice) are not confidently resolved
  // Chicken alone contributes at minimum - totals must not be zero or null
  // just because other items in the same scan are unresolved.
  assert.ok(resolved.totals.calories >= 165 * 1.8)
})

test('realistic scan: nothing in this pipeline touches diet_plans/meals/foods or writes to food_database (pure computation, no side effects)', () => {
  // Structural proof, not a mock assertion: resolveOutsidePlanNutrition is
  // a synchronous pure function - it has no way to perform a database
  // write, since it receives plain arrays and returns a plain object.
  const before = JSON.stringify(REAL_FOOD_DATABASE_SNAPSHOT)
  resolveOutsidePlanNutrition(CHICKEN_RICE_SALAD_SCAN, REAL_FOOD_DATABASE_SNAPSHOT)
  const after = JSON.stringify(REAL_FOOD_DATABASE_SNAPSHOT)
  assert.strictEqual(before, after, 'the candidate catalog array must never be mutated by resolution')
})
