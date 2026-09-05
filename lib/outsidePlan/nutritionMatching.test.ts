import test from 'node:test'
import assert from 'node:assert'
import { matchFoodCandidate, type FoodCandidate } from './nutritionMatching'

// A representative synthetic catalog modeled directly on the real
// food_database contents (verified live via the Supabase MCP tool before
// writing this test) - includes the exact raw/cooked and dry/cooked-food
// pairs that make matching genuinely tricky in this app's real data.
const CATALOG: FoodCandidate[] = [
  { id: 'apple', name: 'Apple, Raw', category: 'fruit', serving_size: 100, serving_unit: 'grams', calories: 52, protein: 0.3, carbs: 13.8, fat: 0.2 },
  { id: 'banana', name: 'Banana, Raw', category: 'fruit', serving_size: 100, serving_unit: 'grams', calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3 },
  { id: 'chicken-cooked', name: 'Chicken Breast, Cooked', category: 'protein', serving_size: 100, serving_unit: 'grams', calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  { id: 'chicken-raw', name: 'Chicken Breast, Raw', category: 'protein', serving_size: 100, serving_unit: 'grams', calories: 120, protein: 22.5, carbs: 0, fat: 2.6 },
  { id: 'chicken-thigh', name: 'Chicken Thigh, Raw', category: 'protein', serving_size: 100, serving_unit: 'grams', calories: 119, protein: 18.6, carbs: 0, fat: 4.3 },
  { id: 'salmon', name: 'Atlantic Salmon, Raw', category: 'protein', serving_size: 100, serving_unit: 'grams', calories: 142, protein: 19.8, carbs: 0, fat: 6.3 },
  { id: 'tuna', name: 'Tuna, Light, Canned in Water', category: 'protein', serving_size: 100, serving_unit: 'grams', calories: 90, protein: 19.4, carbs: 0, fat: 0.8 },
  { id: 'white-rice-dry', name: 'White Rice, Dry', category: 'carbohydrate', serving_size: 100, serving_unit: 'grams', calories: 365, protein: 7.1, carbs: 80, fat: 0.7 },
  { id: 'brown-rice-dry', name: 'Brown Rice, Dry', category: 'carbohydrate', serving_size: 100, serving_unit: 'grams', calories: 367, protein: 7.5, carbs: 76.2, fat: 3.2 },
  { id: 'sweet-potato-cooked', name: 'Sweet Potato, Cooked', category: 'carbohydrate', serving_size: 100, serving_unit: 'grams', calories: 76, protein: 1.37, carbs: 17.72, fat: 0.14 },
  { id: 'sweet-potato-raw', name: 'Sweet Potato, Raw', category: 'carbohydrate', serving_size: 100, serving_unit: 'grams', calories: 86, protein: 1.6, carbs: 20.1, fat: 0.1 },
  { id: 'lettuce', name: 'Lettuce, Raw', category: 'vegetable', serving_size: 100, serving_unit: 'grams', calories: 17, protein: 1.2, carbs: 3.3, fat: 0.3 },
  { id: 'broccoli', name: 'Broccoli, Raw', category: 'vegetable', serving_size: 100, serving_unit: 'grams', calories: 34, protein: 2.8, carbs: 6.6, fat: 0.4 },
  { id: 'dates-dried', name: 'Dates, Dried', category: 'carbohydrate', serving_size: 100, serving_unit: 'grams', calories: 282, protein: 2.5, carbs: 75, fat: 0.4 },
  { id: 'ground-beef', name: 'Lean Ground Beef 93/7, Raw', category: 'protein', serving_size: 100, serving_unit: 'grams', calories: 150, protein: 21.4, carbs: 0, fat: 7 }
]

// ---- A. Exact matches ----

test('A. exact match: apple', () => {
  const result = matchFoodCandidate('apple', CATALOG)
  assert.strictEqual(result.tier, 'high')
  assert.strictEqual(result.candidate?.id, 'apple')
})

test('A. exact match: banana', () => {
  const result = matchFoodCandidate('banana', CATALOG)
  assert.strictEqual(result.candidate?.id, 'banana')
  assert.strictEqual(result.tier, 'high')
})

test('A. exact match: broccoli', () => {
  const result = matchFoodCandidate('broccoli', CATALOG)
  assert.strictEqual(result.candidate?.id, 'broccoli')
})

// ---- B. Semantic matches ----

test('B. "grilled chicken breast" matches the Cooked variant at high confidence', () => {
  const result = matchFoodCandidate('grilled chicken breast', CATALOG)
  assert.strictEqual(result.candidate?.id, 'chicken-cooked')
  assert.strictEqual(result.tier, 'high')
})

test('B. "fried chicken breast" also matches the Cooked variant (cooked-family word)', () => {
  const result = matchFoodCandidate('fried chicken breast', CATALOG)
  assert.strictEqual(result.candidate?.id, 'chicken-cooked')
})

test('B. "raw chicken breast" matches the Raw variant, not Cooked', () => {
  const result = matchFoodCandidate('raw chicken breast', CATALOG)
  assert.strictEqual(result.candidate?.id, 'chicken-raw')
})

test('B. "lemon herb grilled chicken breast" ignores seasoning words and still matches correctly', () => {
  const result = matchFoodCandidate('lemon herb grilled chicken breast', CATALOG)
  assert.strictEqual(result.candidate?.id, 'chicken-cooked')
})

test('B. "white rice" with an explicit dry/dried qualifier matches White Rice, Dry at high confidence', () => {
  const result = matchFoodCandidate('dried white rice', CATALOG)
  assert.strictEqual(result.candidate?.id, 'white-rice-dry')
  assert.strictEqual(result.tier, 'high')
})

// ---- C. Ambiguous matches -> LOW/UNRESOLVED ----

test('C. an unqualified "rice" is ambiguous between white/brown and does not auto-resolve at high confidence', () => {
  const result = matchFoodCandidate('rice', CATALOG)
  // Either it's excluded as low-confidence (tier low/unresolved -> no
  // candidate applied) or, if applied, must not be 'high' tier - the
  // important thing is the system never silently presents this as certain.
  assert.notStrictEqual(result.tier, 'high')
})

test('C. a completely unidentifiable name returns unresolved', () => {
  const result = matchFoodCandidate('xyzzyplugh', CATALOG)
  assert.strictEqual(result.tier, 'unresolved')
  assert.strictEqual(result.candidate, null)
})

test('C. an empty/whitespace name returns unresolved rather than crashing', () => {
  const result = matchFoodCandidate('   ', CATALOG)
  assert.strictEqual(result.tier, 'unresolved')
  assert.strictEqual(result.candidate, null)
})

// ---- D. Dangerous mismatch prevention ----

test('D. "chicken breast" must never resolve to an unrelated chicken-derived product (chicken thigh)', () => {
  const onlyThighAvailable: FoodCandidate[] = CATALOG.filter(c => c.id !== 'chicken-cooked' && c.id !== 'chicken-raw')
  const result = matchFoodCandidate('chicken breast', onlyThighAvailable)
  assert.notStrictEqual(result.candidate?.id, 'chicken-thigh')
})

test('D. "salmon" must never resolve to tuna', () => {
  const result = matchFoodCandidate('salmon', CATALOG)
  assert.notStrictEqual(result.candidate?.id, 'tuna')
  assert.strictEqual(result.candidate?.id, 'salmon')
})

test('D. "beef burger" must never resolve to a generic beef product missing "burger" (no safe match exists)', () => {
  const result = matchFoodCandidate('beef burger', CATALOG)
  assert.notStrictEqual(result.candidate?.id, 'ground-beef')
  assert.strictEqual(result.tier, 'unresolved')
})

test('D. an unrelated food category never gets substituted (apple must never resolve to banana)', () => {
  const result = matchFoodCandidate('apple', CATALOG)
  assert.notStrictEqual(result.candidate?.id, 'banana')
})

// ---- Dry-vs-cooked safety case (a real gap found in the live catalog) ----

test('safety: an unqualified "white rice" (implied cooked, plate context) does NOT auto-apply the Dry-basis candidate at high confidence', () => {
  const result = matchFoodCandidate('white rice', CATALOG)
  assert.notStrictEqual(result.tier, 'high')
})

test('safety: if "white rice" is somehow still surfaced as a candidate, it carries an explicit dry-vs-cooked warning', () => {
  const result = matchFoodCandidate('white rice', CATALOG)
  if (result.candidate) {
    assert.ok(result.warnings.some(w => w.toLowerCase().includes('dry') || w.toLowerCase().includes('overstate')))
  } else {
    assert.strictEqual(result.tier === 'low' || result.tier === 'unresolved', true)
  }
})

test('"dried dates" correctly matches Dates, Dried at high confidence (dry state explicitly requested, no mismatch)', () => {
  const result = matchFoodCandidate('dried dates', CATALOG)
  assert.strictEqual(result.candidate?.id, 'dates-dried')
  assert.strictEqual(result.tier, 'high')
})

// ---- Variant ambiguity without a dangerous outcome ----

test('an unqualified "sweet potato" prefers the Cooked variant over Raw (a scanned plate is virtually always ready-to-eat food)', () => {
  const result = matchFoodCandidate('sweet potato', CATALOG)
  assert.strictEqual(result.candidate?.id, 'sweet-potato-cooked')
  // A reasonable default assumption, not a real ambiguity - stays HIGH,
  // but must disclose that a preparation state was assumed rather than
  // stated, so the review UI can surface it.
  assert.ok(result.warnings.some(w => w.toLowerCase().includes('cooked') || w.toLowerCase().includes('ready-to-eat')))
})
