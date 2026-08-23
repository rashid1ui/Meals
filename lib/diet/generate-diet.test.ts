import test from 'node:test'
import assert from 'node:assert'
import { dedupeMealFoods } from './generate-diet'

test('dedupeMealFoods: collapses a food repeated within the same meal to one entry', () => {
  const meals = [
    { name: 'Lunch', foods: [{ food_id: 'chicken' }, { food_id: 'rice' }, { food_id: 'chicken' }] }
  ]
  dedupeMealFoods(meals)
  assert.strictEqual(meals[0].foods!.length, 2)
  assert.deepStrictEqual(meals[0].foods!.map(f => f.food_id), ['chicken', 'rice'])
})

test('dedupeMealFoods: leaves legitimate cross-meal repetition untouched', () => {
  const meals = [
    { name: 'Breakfast', foods: [{ food_id: 'chicken' }] },
    { name: 'Dinner', foods: [{ food_id: 'chicken' }] }
  ]
  dedupeMealFoods(meals)
  assert.strictEqual(meals[0].foods!.length, 1)
  assert.strictEqual(meals[1].foods!.length, 1)
})

test('dedupeMealFoods: tolerates a meal with no foods array', () => {
  const meals = [{ name: 'Empty' }]
  assert.doesNotThrow(() => dedupeMealFoods(meals))
})

test('dedupeMealFoods: no-op when there are no duplicates', () => {
  const meals = [{ name: 'Lunch', foods: [{ food_id: 'a' }, { food_id: 'b' }, { food_id: 'c' }] }]
  dedupeMealFoods(meals)
  assert.strictEqual(meals[0].foods!.length, 3)
})
