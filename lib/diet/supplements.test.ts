import test from 'node:test'
import assert from 'node:assert'
import {
  computeSupplementMacros,
  validateSupplementSetup,
  findDuplicateSupplementType,
  buildSupplementCatalogName,
  classifySupplementInsertError,
  subtractSupplementsFromTarget,
  appendSupplementsToDiet,
  SUPPLEMENT_SERVING_CANONICAL_GRAMS,
  type OtherDbSupplement
} from './supplements'
import type { CalculatedDiet } from '@/lib/nutrition/calculator'
import type { SupplementSetup } from '@/lib/types'

// --- Scenario 1: Whey only ---

test('whey only: computeSupplementMacros subtracts protein/calories correctly', () => {
  const whey: SupplementSetup = { type: 'whey', serving_label: '1 scoop', amount_per_serving_g: 24 }
  const computed = computeSupplementMacros(whey)
  assert.strictEqual(computed.protein, 24)
  assert.strictEqual(computed.calories, 96) // 24g * 4 kcal/g
  assert.strictEqual(computed.carbs, 0)
  assert.strictEqual(computed.fat, 0)
  assert.strictEqual(computed.quantity, SUPPLEMENT_SERVING_CANONICAL_GRAMS)
})

test('whey only: subtractSupplementsFromTarget reduces the AI target by exactly the whey macros', () => {
  const whey: SupplementSetup = { type: 'whey', serving_label: '1 scoop', amount_per_serving_g: 24 }
  const computed = computeSupplementMacros(whey)
  const reduced = subtractSupplementsFromTarget(
    { calories: 2250, protein: 150, carbs: 250, fat: 70 },
    { calories: computed.calories, protein: computed.protein, carbs: computed.carbs, fat: computed.fat }
  )
  assert.strictEqual(reduced.calories, 2250 - 96)
  assert.strictEqual(reduced.protein, 150 - 24)
  assert.strictEqual(reduced.carbs, 250)
  assert.strictEqual(reduced.fat, 70)
})

test('whey only: appendSupplementsToDiet adds it exactly once and places it in Post-Workout Meal for training users', () => {
  const diet: CalculatedDiet = {
    name: 'Diet',
    meals: [
      { name: 'Breakfast', sort_order: 0, foods: [], calories: 500, protein: 40, carbs: 50, fat: 10 },
      { name: 'Post-Workout Meal', sort_order: 1, foods: [], calories: 600, protein: 50, carbs: 60, fat: 12 }
    ],
    daily_calories: 1100,
    daily_protein: 90,
    daily_carbs: 110,
    daily_fat: 22
  }

  const result = appendSupplementsToDiet(
    diet,
    [{ foodId: 'whey-1', name: 'Whey Protein (24g protein/serving)', quantity: 30, unit: 'grams', calories: 96, protein: 24, carbs: 0, fat: 0 }],
    [],
    'morning'
  )

  assert.strictEqual(result.meals.length, 2, 'must not create a separate Supplements meal when Post-Workout Meal exists')
  const postWorkout = result.meals.find(m => m.name === 'Post-Workout Meal')!
  assert.strictEqual(postWorkout.foods.filter(f => f.food_id === 'whey-1').length, 1, 'whey must appear exactly once')
  assert.strictEqual(postWorkout.calories, 600 + 96)
  assert.strictEqual(postWorkout.protein, 50 + 24)
  assert.strictEqual(result.daily_calories, 1100 + 96, 'daily totals must include the appended whey, not go stale')
  assert.strictEqual(result.daily_protein, 90 + 24)
})

// --- Scenario 2: Creatine only ---

test('creatine only: never affects macros regardless of amount_per_serving_g', () => {
  const creatine: SupplementSetup = { type: 'creatine', serving_label: '1 scoop', amount_per_serving_g: 5 }
  const computed = computeSupplementMacros(creatine)
  assert.deepStrictEqual(computed, { calories: 0, protein: 0, carbs: 0, fat: 0, quantity: 5 })
})

test('creatine only: appendSupplementsToDiet saves it correctly with zero macro impact', () => {
  const diet: CalculatedDiet = {
    name: 'Diet',
    meals: [{ name: 'Breakfast', sort_order: 0, foods: [], calories: 500, protein: 40, carbs: 50, fat: 10 }],
    daily_calories: 500,
    daily_protein: 40,
    daily_carbs: 50,
    daily_fat: 10
  }
  const result = appendSupplementsToDiet(
    diet,
    [{ foodId: 'creatine-1', name: 'Creatine (5g/serving)', quantity: 5, unit: 'grams', calories: 0, protein: 0, carbs: 0, fat: 0 }],
    [],
    null
  )
  const suppMeal = result.meals.find(m => m.name === 'Supplements')!
  assert.ok(suppMeal, 'a standalone Supplements meal is created for a non-training user')
  assert.strictEqual(suppMeal.foods.length, 1)
  assert.strictEqual(suppMeal.foods[0].food_id, 'creatine-1')
  assert.strictEqual(result.daily_calories, 500)
  assert.strictEqual(result.daily_protein, 40)
})

// --- Scenario 3: Whey + Creatine together ---

test('whey + creatine: whey affects macros, creatine does not, and both appear exactly once', () => {
  const whey: SupplementSetup = { type: 'whey', serving_label: '1 scoop', amount_per_serving_g: 30 }
  const creatine: SupplementSetup = { type: 'creatine', serving_label: '1 scoop', amount_per_serving_g: 5 }
  const wheyComputed = computeSupplementMacros(whey)
  const creatineComputed = computeSupplementMacros(creatine)

  assert.strictEqual(wheyComputed.protein, 30)
  assert.strictEqual(creatineComputed.protein, 0)

  const totals = subtractSupplementsFromTarget(
    { calories: 2500, protein: 180, carbs: 300, fat: 80 },
    {
      calories: wheyComputed.calories + creatineComputed.calories,
      protein: wheyComputed.protein + creatineComputed.protein,
      carbs: wheyComputed.carbs + creatineComputed.carbs,
      fat: wheyComputed.fat + creatineComputed.fat
    }
  )
  assert.strictEqual(totals.protein, 180 - 30, 'only whey protein is subtracted')
  assert.strictEqual(totals.calories, 2500 - 120)

  const diet: CalculatedDiet = {
    name: 'Diet',
    meals: [{ name: 'Post-Workout Meal', sort_order: 0, foods: [], calories: 400, protein: 30, carbs: 40, fat: 8 }],
    daily_calories: 400,
    daily_protein: 30,
    daily_carbs: 40,
    daily_fat: 8
  }
  const result = appendSupplementsToDiet(
    diet,
    [
      { foodId: 'whey-1', name: 'Whey', quantity: 30, unit: 'grams', calories: 120, protein: 30, carbs: 0, fat: 0 },
      { foodId: 'creatine-1', name: 'Creatine', quantity: 5, unit: 'grams', calories: 0, protein: 0, carbs: 0, fat: 0 }
    ],
    [],
    'evening'
  )
  const meal = result.meals[0]
  assert.strictEqual(meal.foods.length, 2)
  assert.strictEqual(meal.foods.filter(f => f.food_id === 'whey-1').length, 1)
  assert.strictEqual(meal.foods.filter(f => f.food_id === 'creatine-1').length, 1)
  assert.strictEqual(result.daily_protein, 30 + 30)
})

// --- Scenario 4: Duplicate whey entries ---

test('duplicate supplement types are detected and rejected before hitting the database', () => {
  const supplements: SupplementSetup[] = [
    { type: 'whey', serving_label: '1 scoop', amount_per_serving_g: 24 },
    { type: 'whey', serving_label: '2 scoops', amount_per_serving_g: 48 }
  ]
  assert.strictEqual(findDuplicateSupplementType(supplements), 'whey')
})

test('no duplicates: distinct supplement types pass', () => {
  const supplements: SupplementSetup[] = [
    { type: 'whey', serving_label: '1 scoop', amount_per_serving_g: 24 },
    { type: 'creatine', serving_label: '1 scoop', amount_per_serving_g: 5 }
  ]
  assert.strictEqual(findDuplicateSupplementType(supplements), null)
})

test('cross-user collision prevention: different serving configs produce different catalog names', () => {
  const userA: SupplementSetup = { type: 'whey', serving_label: '1 scoop', amount_per_serving_g: 24 }
  const userB: SupplementSetup = { type: 'whey', serving_label: '1 scoop', amount_per_serving_g: 30 }
  const nameA = buildSupplementCatalogName(userA, computeSupplementMacros(userA))
  const nameB = buildSupplementCatalogName(userB, computeSupplementMacros(userB))
  assert.notStrictEqual(nameA, nameB, 'different protein-per-scoop configs must not collide on the same catalog row')
})

test('identical configs still produce the same catalog name (allows safe reuse)', () => {
  const userA: SupplementSetup = { type: 'whey', brand: 'ON', serving_label: '1 scoop', amount_per_serving_g: 24 }
  const userB: SupplementSetup = { type: 'whey', brand: 'ON', serving_label: '1 scoop', amount_per_serving_g: 24 }
  assert.strictEqual(
    buildSupplementCatalogName(userA, computeSupplementMacros(userA)),
    buildSupplementCatalogName(userB, computeSupplementMacros(userB))
  )
})

// --- Scenario 5: Invalid supplement values ---

test('invalid supplement values are rejected: negative amount', () => {
  const supp: SupplementSetup = { type: 'whey', serving_label: '1 scoop', amount_per_serving_g: -10 }
  assert.ok(validateSupplementSetup(supp)?.length)
})

test('invalid supplement values are rejected: whey protein absurdly high', () => {
  const supp: SupplementSetup = { type: 'whey', serving_label: '1 scoop', amount_per_serving_g: 5000 }
  assert.ok(validateSupplementSetup(supp)?.includes('Whey protein per scoop'))
})

test('invalid supplement values are rejected: creatine absurdly high', () => {
  const supp: SupplementSetup = { type: 'creatine', serving_label: '1 scoop', amount_per_serving_g: 500 }
  assert.ok(validateSupplementSetup(supp)?.includes('Creatine per serving'))
})

test('invalid supplement values are rejected: creatine with non-zero macros', () => {
  const supp: SupplementSetup = { type: 'creatine', serving_label: '1 scoop', macros: { calories: 10, protein: 0, carbs: 0, fat: 0 } }
  assert.ok(validateSupplementSetup(supp)?.length)
})

test('invalid supplement values are rejected: other supplement with negative macro', () => {
  const supp: SupplementSetup = { type: 'other', serving_label: '2 pills', macros: { calories: -5, protein: 0, carbs: 0, fat: 0 } }
  assert.ok(validateSupplementSetup(supp)?.length)
})

test('valid supplement values pass', () => {
  assert.strictEqual(validateSupplementSetup({ type: 'whey', serving_label: '1 scoop', amount_per_serving_g: 24 }), null)
  assert.strictEqual(validateSupplementSetup({ type: 'creatine', serving_label: '1 scoop', amount_per_serving_g: 5 }), null)
  assert.strictEqual(validateSupplementSetup({ type: 'other', serving_label: '2 pills' }), null)
})

// --- Scenario 6: Database failure simulation ---

test('database failure simulation: a unique-violation (23505) is classified as a safe race, not an error', () => {
  assert.strictEqual(classifySupplementInsertError({ code: '23505' }), 'unique_violation')
})

test('database failure simulation: any other Postgres error (e.g. a CHECK violation) is classified as fatal, never silently swallowed', () => {
  assert.strictEqual(classifySupplementInsertError({ code: '23514' }), 'fatal')
  assert.strictEqual(classifySupplementInsertError({ code: '42501' }), 'fatal')
})

test('database failure simulation: no error classifies as null (nothing to report)', () => {
  assert.strictEqual(classifySupplementInsertError(null), null)
})

// --- "Other" real-macro food append (fixes the zero-macro append bug) ---

test('other db supplement with real macros is appended using its actual per-100g values, not hardcoded zero', () => {
  const diet: CalculatedDiet = {
    name: 'Diet',
    meals: [{ name: 'Breakfast', sort_order: 0, foods: [], calories: 0, protein: 0, carbs: 0, fat: 0 }],
    daily_calories: 0,
    daily_protein: 0,
    daily_carbs: 0,
    daily_fat: 0
  }
  const caseinPowder: OtherDbSupplement = {
    id: 'casein-1',
    name: 'Casein Protein',
    serving_size: 100,
    serving_unit: 'grams',
    calories: 380,
    protein: 80,
    carbs: 5,
    fat: 3
  }
  const result = appendSupplementsToDiet(diet, [], [caseinPowder], null)
  const suppFood = result.meals.find(m => m.name === 'Supplements')!.foods[0]
  assert.strictEqual(suppFood.calories, 380)
  assert.strictEqual(suppFood.protein, 80)
  assert.strictEqual(result.daily_protein, 80, 'must not silently discard the real macro contribution')
})

test('appendSupplementsToDiet is a no-op when there are no supplements', () => {
  const diet: CalculatedDiet = {
    name: 'Diet',
    meals: [{ name: 'Breakfast', sort_order: 0, foods: [], calories: 500, protein: 40, carbs: 50, fat: 10 }],
    daily_calories: 500,
    daily_protein: 40,
    daily_carbs: 50,
    daily_fat: 10
  }
  const result = appendSupplementsToDiet(diet, [], [], null)
  assert.deepStrictEqual(result, diet)
})
