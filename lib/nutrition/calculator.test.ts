import test from 'node:test'
import assert from 'node:assert'
import { calculateFoodMacros, calculateDiet, validateMacros, isValidQuantity, type FoodMacro, type CalculatedDiet } from './calculator'

const mockChicken: FoodMacro = {
  id: 'chicken-id',
  name: 'Chicken Breast',
  serving_size: 100,
  serving_unit: 'grams',
  calories: 120,
  protein: 22.5,
  carbs: 0,
  fat: 2.6
}

const mockRice: FoodMacro = {
  id: 'rice-id',
  name: 'White Rice',
  serving_size: 100,
  serving_unit: 'grams',
  calories: 365,
  protein: 7.1,
  carbs: 80,
  fat: 0.7
}

test('isValidQuantity', () => {
  assert.strictEqual(isValidQuantity(100, 'grams'), true)
  assert.strictEqual(isValidQuantity(1000, 'grams'), true)
  assert.strictEqual(isValidQuantity(1001, 'grams'), false)
  assert.strictEqual(isValidQuantity(-50, 'grams'), false)
  assert.strictEqual(isValidQuantity(0, 'grams'), false)
  assert.strictEqual(isValidQuantity(NaN, 'grams'), false)
})

test('calculateFoodMacros - 100g', () => {
  const result = calculateFoodMacros(100, mockChicken)
  assert.strictEqual(result.calories, 120)
  assert.strictEqual(result.protein, 22.5)
})

test('calculateFoodMacros - 200g', () => {
  const result = calculateFoodMacros(200, mockChicken)
  assert.strictEqual(result.calories, 240)
  assert.strictEqual(result.protein, 45)
})

test('calculateFoodMacros - decimal', () => {
  const result = calculateFoodMacros(150, mockChicken)
  assert.strictEqual(result.calories, 180)
  assert.strictEqual(result.protein, 33.75)
})

// --- Serving-based foods (scoops/servings, not grams) ---
// A serving-based food stores serving_size = the natural serving's own
// gram weight (30g for a scoop here), with calories/protein/etc entered
// directly per that serving - not derived from a per-100g figure. The
// caller (FoodPickerModal) converts "N scoops" to canonical grams via
// lib/nutrition/units.ts's toCanonicalGrams(N, {gramsPerDisplayUnit: 30})
// before calling calculateFoodMacros, exactly like any other food.

const mockWheyScoop: FoodMacro = {
  id: 'whey-id',
  name: 'Whey Protein',
  serving_size: 30, // 1 scoop = 30g
  serving_unit: 'grams',
  calories: 120,
  protein: 25,
  carbs: 3,
  fat: 2,
  display_unit: 'serving',
  grams_per_display_unit: 30
}

test('calculateFoodMacros - 1 scoop of a serving-based food gives the exact per-serving protein', () => {
  // 1 scoop -> 30 canonical grams -> multiplier 30/30 = 1
  const result = calculateFoodMacros(30, mockWheyScoop)
  assert.strictEqual(result.protein, 25)
  assert.strictEqual(result.calories, 120)
})

test('calculateFoodMacros - 2 scoops doubles every macro', () => {
  // 2 scoops -> 60 canonical grams -> multiplier 60/30 = 2
  const result = calculateFoodMacros(60, mockWheyScoop)
  assert.strictEqual(result.protein, 50)
  assert.strictEqual(result.calories, 240)
  assert.strictEqual(result.carbs, 6)
  assert.strictEqual(result.fat, 4)
})

test('calculateFoodMacros - 0.5 scoop halves every macro', () => {
  const result = calculateFoodMacros(15, mockWheyScoop)
  assert.strictEqual(result.protein, 12.5)
  assert.strictEqual(result.calories, 60)
})

test('calculateFoodMacros - existing gram-based foods are unaffected by the serving-based model (regression)', () => {
  const result = calculateFoodMacros(100, mockChicken)
  assert.strictEqual(result.calories, 120)
  assert.strictEqual(result.protein, 22.5)
  assert.strictEqual(result.carbs, 0)
  assert.strictEqual(result.fat, 2.6)
})

test('calculateDiet - valid payload', () => {
  const parsedMeals = [
    {
      name: 'Lunch',
      foods: [
        { food_id: 'chicken-id', quantity: 200 },
        { food_id: 'rice-id', quantity: 100 }
      ]
    }
  ]
  const dbFoods = [mockChicken, mockRice]
  
  const { diet, error } = calculateDiet('My Diet', parsedMeals, dbFoods)
  assert.strictEqual(error, undefined)
  assert.ok(diet)
  assert.strictEqual(diet.daily_calories, 240 + 365)
  assert.strictEqual(diet.daily_protein, 45 + 7.1)
  assert.strictEqual(diet.daily_carbs, 80)
  assert.strictEqual(diet.daily_fat, 5.2 + 0.7)
})

test('calculateDiet - invalid food_id', () => {
  const parsedMeals = [
    {
      foods: [ { food_id: 'bad-id', quantity: 100 } ]
    }
  ]
  const { diet, error } = calculateDiet('My Diet', parsedMeals, [mockChicken])
  assert.strictEqual(error, 'Used an invalid food_id: bad-id')
  assert.strictEqual(diet, undefined)
})

test('calculateDiet - absurd quantity', () => {
  const parsedMeals = [
    {
      foods: [ { food_id: 'chicken-id', quantity: 5000 } ]
    }
  ]
  const { error } = calculateDiet('My Diet', parsedMeals, [mockChicken])
  assert.ok(error?.includes('absurd quantity'))
})

test('validateMacros - PASS', () => {
  const diet: CalculatedDiet = {
    name: 'Test Diet',
    meals: [],
    daily_calories: 2000,
    daily_protein: 150,
    daily_carbs: 200,
    daily_fat: 65
  }
  const result = validateMacros(diet, 2000, 150, 200, 65)
  assert.strictEqual(result.valid, true)
})

test('validateMacros - FAIL calories', () => {
  const diet: CalculatedDiet = { name: 'Test Diet', meals: [], daily_calories: 2200, daily_protein: 150, daily_carbs: 200, daily_fat: 65 }
  // 2200 is 10% above 2000. Limit is 5%.
  const result = validateMacros(diet, 2000, 150, 200, 65)
  assert.strictEqual(result.valid, false)
  assert.strictEqual(result.errors.length, 1)
})

test('validateMacros - FAIL protein', () => {
  const diet: CalculatedDiet = { name: 'Test Diet', meals: [], daily_calories: 2000, daily_protein: 130, daily_carbs: 200, daily_fat: 65 }
  // Target is 150g protein. Tolerance is now proportional: max(5, 150 * 0.10) = 15g.
  // 130 is 20g off, which is still outside that 15g tolerance.
  const result = validateMacros(diet, 2000, 150, 200, 65)
  assert.strictEqual(result.valid, false)
  assert.strictEqual(result.errors.length, 1)
})

// --- Proportional protein/carbs/fat tolerance (F-onboarding-reliability fix) ---

test('validateMacros - PASS with a normal target and small realistic deviations', () => {
  // Default onboarding targets (app/onboarding/OnboardingForm.tsx defaults): 2250/150/250/70.
  // Small, realistic deviations that a real meal plan would produce.
  const diet: CalculatedDiet = {
    name: 'Test Diet',
    meals: [],
    daily_calories: 2280, // +30, well under the 112.5 (5%) calorie tolerance
    daily_protein: 153,   // +3g, under both the old (5g) and new (max(5, 15)=15g) tolerance
    daily_carbs: 245,     // -5g, under both the old (10g) and new (max(10, 25)=25g) tolerance
    daily_fat: 68         // -2g, under both the old (5g) and new (max(5, 7)=7g) tolerance
  }
  const result = validateMacros(diet, 2250, 150, 250, 70)
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.errors.length, 0)
})

test('validateMacros - FAIL just outside the new proportional protein tolerance', () => {
  // Target protein 150g -> new tolerance = max(5, 150 * 0.10) = 15g.
  // A 16g deviation is just outside that tolerance, so this must still fail.
  const diet: CalculatedDiet = { name: 'Test Diet', meals: [], daily_calories: 2250, daily_protein: 166, daily_carbs: 250, daily_fat: 70 }
  const result = validateMacros(diet, 2250, 150, 250, 70)
  assert.strictEqual(result.valid, false)
  assert.strictEqual(result.errors.length, 1)
  assert.ok(result.errors[0].includes('Protein'))
})

test('validateMacros - PASS on a larger (bulking) target where % tolerance is meaningfully larger than the old fixed tolerance', () => {
  // Large bulking targets: protein 300g, carbs 400g, fat 120g.
  // New tolerances: protein max(5, 30)=30g, carbs max(10, 40)=40g, fat max(5, 12)=12g.
  // The deviations below (18g / 30g / 10g) would all have FAILED under the old
  // fixed tolerances (5g / 10g / 5g) despite being a perfectly reasonable diet
  // for a target this size - this is exactly the case the proportional
  // tolerance change was made to fix.
  const diet: CalculatedDiet = {
    name: 'Test Diet',
    meals: [],
    daily_calories: 3100, // +100, under the 150 (5%) calorie tolerance
    daily_protein: 318,   // +18g
    daily_carbs: 430,     // +30g
    daily_fat: 130        // +10g
  }
  const result = validateMacros(diet, 3000, 300, 400, 120)
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.errors.length, 0)
})

test('known regression scenario: Chicken Breast + White Rice Dry + Olive Oil @ 2250 kcal / 150g protein / 250g carbs / 70g fat', () => {
  // Real production food_database values (supabase/seed.sql). This is the
  // minimal-selection scenario (one food per category) reproduced during the
  // forensic investigation of the "AI failed to generate a valid diet" error.
  const chicken: FoodMacro = { id: 'chicken', name: 'Chicken Breast, Raw', serving_size: 100, serving_unit: 'grams', calories: 120, protein: 22.5, carbs: 0, fat: 2.6 }
  const rice: FoodMacro = { id: 'rice', name: 'White Rice, Dry', serving_size: 100, serving_unit: 'grams', calories: 365, protein: 7.1, carbs: 80, fat: 0.7 }
  const oil: FoodMacro = { id: 'oil', name: 'Olive Oil, Extra Virgin', serving_size: 100, serving_unit: 'grams', calories: 884, protein: 0, carbs: 0, fat: 100 }
  const dbFoods = [chicken, rice, oil]
  const target = { calories: 2250, protein: 150, carbs: 250, fat: 70 }

  // A near-exact solved quantity combination (568g chicken / 312.5g rice / 53g
  // oil) should validate cleanly - this proves the target is genuinely
  // achievable with this minimal selection, it just requires a precise solution.
  const goodMeals = [
    { name: 'Meal 1', foods: [
      { food_id: 'chicken', quantity: 568 },
      { food_id: 'rice', quantity: 312.5 },
      { food_id: 'oil', quantity: 53 }
    ] }
  ]
  const { diet: goodDiet, error: goodError } = calculateDiet('Diet', goodMeals, dbFoods)
  assert.strictEqual(goodError, undefined)
  assert.ok(goodDiet)
  const goodResult = validateMacros(goodDiet, target.calories, target.protein, target.carbs, target.fat)
  assert.strictEqual(goodResult.valid, true, `expected a well-tuned plan to pass, got errors: ${goodResult.errors.join('; ')}`)

  // A naive, uniform-portion first guess (500g chicken / 500g rice / 50g oil -
  // the actual first-attempt output observed from DeepSeek during the
  // investigation) overshoots badly (2867 kcal, 400g carbs) and must still
  // fail even under the loosened proportional tolerance - the fix widens the
  // margin, it does not rubber-stamp genuinely wrong plans.
  const badMeals = [
    { name: 'Meal 1', foods: [
      { food_id: 'chicken', quantity: 500 },
      { food_id: 'rice', quantity: 500 },
      { food_id: 'oil', quantity: 50 }
    ] }
  ]
  const { diet: badDiet, error: badError } = calculateDiet('Diet', badMeals, dbFoods)
  assert.strictEqual(badError, undefined)
  assert.ok(badDiet)
  const badResult = validateMacros(badDiet, target.calories, target.protein, target.carbs, target.fat)
  assert.strictEqual(badResult.valid, false)
})
