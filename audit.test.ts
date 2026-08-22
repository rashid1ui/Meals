import test from 'node:test'
import assert from 'node:assert'
import { generateValidatedDiet, type FoodOption } from './lib/diet/generate-diet'

import { config } from 'dotenv'

// Load environment variables (.env.local) for DEEPSEEK_API_KEY
config({ path: '.env.local' })

if (!process.env.DEEPSEEK_API_KEY) {
  assert.fail('DEEPSEEK_API_KEY is missing from environment variables.')
}

const chicken: FoodOption = {
  id: 'chicken',
  name: 'Chicken Breast, Raw',
  category: 'protein',
  serving_size: 100,
  serving_unit: 'grams',
  calories: 120,
  protein: 22.5,
  carbs: 0,
  fat: 2.6
}

const rice: FoodOption = {
  id: 'rice',
  name: 'White Rice, Dry',
  category: 'carbs',
  serving_size: 100,
  serving_unit: 'grams',
  calories: 365,
  protein: 7.1,
  carbs: 80,
  fat: 0.7
}

const oil: FoodOption = {
  id: 'oil',
  name: 'Olive Oil',
  category: 'fat',
  serving_size: 100,
  serving_unit: 'grams',
  calories: 884,
  protein: 0,
  carbs: 0,
  fat: 100
}

const whey: FoodOption = {
  id: 'whey-123',
  name: 'Optimum Nutrition Whey Protein',
  category: 'protein',
  serving_size: 100,
  serving_unit: 'grams',
  calories: 384,
  protein: 76.9,
  carbs: 11.5,
  fat: 3.8
}

const creatine: FoodOption = {
  id: 'crea-456',
  name: 'Creatine Monohydrate',
  category: 'other',
  serving_size: 100,
  serving_unit: 'grams',
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0
}

const dbFoods = [chicken, rice, oil, whey, creatine]

test('Scenario 1: User trains + uses whey protein', async () => {
  const result = await generateValidatedDiet({
    dbFoods,
    calories: 2000,
    protein: 150,
    carbs: 200,
    fat: 60,
    mealsCount: 4,
    supplementFoodIds: new Set(['whey-123']),
    trainingTime: 'morning'
  })

  if ('error' in result) {
    assert.fail(`Generation failed: ${result.error}`)
  }

  const diet = result.diet
  
  // No whey should appear in the generated meals because it's filtered
  for (const meal of diet.meals) {
    for (const food of meal.foods) {
      assert.notStrictEqual(food.food_id, 'whey-123', 'Whey protein was found in generated meals but should have been excluded')
    }
  }

  // Pre and Post workout meals should exist
  const mealNames = diet.meals.map(m => m.name.toLowerCase())
  assert.ok(mealNames.some(n => n.includes('pre-workout')), 'Missing Pre-Workout Meal')
  assert.ok(mealNames.some(n => n.includes('post-workout')), 'Missing Post-Workout Meal')
  assert.ok(!mealNames.some(n => n.includes('snack')), 'Snack meal was generated despite training instructions')
})

test('Scenario 2: User trains + no supplements', async () => {
  const result = await generateValidatedDiet({
    dbFoods: [chicken, rice, oil], // no whey
    calories: 2000,
    protein: 150,
    carbs: 200,
    fat: 60,
    mealsCount: 4,
    trainingTime: 'evening'
  })

  if ('error' in result) {
    assert.fail(`Generation failed: ${result.error}`)
  }

  const diet = result.diet
  const mealNames = diet.meals.map(m => m.name.toLowerCase())
  assert.ok(mealNames.some(n => n.includes('pre-workout')), 'Missing Pre-Workout Meal')
  assert.ok(mealNames.some(n => n.includes('post-workout')), 'Missing Post-Workout Meal')
  assert.ok(!mealNames.some(n => n.includes('snack')), 'Snack meal was generated despite training instructions')
})

test('Scenario 3: User does not train + uses whey', async () => {
  const result = await generateValidatedDiet({
    dbFoods,
    calories: 2000,
    protein: 150,
    carbs: 200,
    fat: 60,
    mealsCount: 4,
    supplementFoodIds: new Set(['whey-123']) // No trainingTime
  })

  if ('error' in result) {
    assert.fail(`Generation failed: ${result.error}`)
  }

  const diet = result.diet
  
  // No whey should appear in the generated meals
  for (const meal of diet.meals) {
    for (const food of meal.foods) {
      assert.notStrictEqual(food.food_id, 'whey-123', 'Whey protein was found in generated meals but should have been excluded')
    }
  }

  // Generic meals (can include snack) should be generated since they don't train
  const mealNames = diet.meals.map(m => m.name.toLowerCase())
  assert.ok(!mealNames.some(n => n.includes('workout')), 'Workout meal was generated for non-training user')
})

test('Scenario 4: Quantity editing math validation', async () => {
  const { calculateFoodMacros } = await import('./lib/nutrition/calculator')
  // Chicken Breast 100g -> 200g
  const initial = calculateFoodMacros(100, chicken)
  assert.strictEqual(Math.round(initial.calories), 120)
  assert.strictEqual(Math.round(initial.protein), 23)

  const updated = calculateFoodMacros(200, chicken)
  assert.strictEqual(Math.round(updated.calories), 240)
  assert.strictEqual(Math.round(updated.protein), 45)
  assert.strictEqual(Math.round(updated.carbs), 0)
  assert.strictEqual(Math.round(updated.fat), 5)
})

test('Scenario 5: Retry limit fails safely with clean error', async () => {
  // We want to force the AI to fail validation repeatedly.
  // By requesting 1 meal but providing trainingTime, the system prompt forces
  // 'Pre-Workout Meal' AND 'Post-Workout Meal'. The AI cannot satisfy both constraints.
  const result = await generateValidatedDiet({
    dbFoods: [chicken, rice, oil],
    calories: 2000,
    protein: 150,
    carbs: 200,
    fat: 60,
    mealsCount: 1,
    trainingTime: 'morning'
  })

  assert.ok('error' in result, 'Expected generation to fail')
  if ('error' in result) {
    assert.strictEqual(result.error, 'Unable to generate your meal plan correctly. Please try again.')
  }
})

test('Scenario 6: Multiple Supplements (Whey + Creatine)', async () => {
  // Just checking that they are properly filtered out during generation
  const result = await generateValidatedDiet({
    dbFoods,
    calories: 2000,
    protein: 150,
    carbs: 200,
    fat: 60,
    mealsCount: 4,
    supplementFoodIds: new Set(['whey-123', 'crea-456'])
  })

  if ('error' in result) {
    assert.fail(`Generation failed: ${result.error}`)
  }
  
  const diet = result.diet
  for (const meal of diet.meals) {
    for (const food of meal.foods) {
      assert.notStrictEqual(food.food_id, 'whey-123', 'Whey protein was found in generated meals but should have been excluded')
      assert.notStrictEqual(food.food_id, 'crea-456', 'Creatine was found in generated meals but should have been excluded')
    }
  }
})
