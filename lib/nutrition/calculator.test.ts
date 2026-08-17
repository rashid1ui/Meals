import test from 'node:test'
import assert from 'node:assert'
import { calculateFoodMacros, calculateDiet, validateMacros, isValidQuantity, type FoodMacro } from './calculator'

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

test('isValidQuantity', (t) => {
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
  const { diet, error } = calculateDiet('My Diet', parsedMeals, [mockChicken])
  assert.ok(error?.includes('absurd quantity'))
})

test('validateMacros - PASS', () => {
  const diet: any = {
    daily_calories: 2000,
    daily_protein: 150,
    daily_carbs: 200,
    daily_fat: 65
  }
  const result = validateMacros(diet, 2000, 150, 200, 65)
  assert.strictEqual(result.valid, true)
})

test('validateMacros - FAIL calories', () => {
  const diet: any = { daily_calories: 2200, daily_protein: 150, daily_carbs: 200, daily_fat: 65 }
  // 2200 is 10% above 2000. Limit is 5%.
  const result = validateMacros(diet, 2000, 150, 200, 65)
  assert.strictEqual(result.valid, false)
  assert.strictEqual(result.errors.length, 1)
})

test('validateMacros - FAIL protein', () => {
  const diet: any = { daily_calories: 2000, daily_protein: 140, daily_carbs: 200, daily_fat: 65 }
  // 140 is 10g off, limit is 5g.
  const result = validateMacros(diet, 2000, 150, 200, 65)
  assert.strictEqual(result.valid, false)
  assert.strictEqual(result.errors.length, 1)
})
