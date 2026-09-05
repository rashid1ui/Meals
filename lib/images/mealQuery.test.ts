import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mealTypeToken, buildMealImageQuery, mealCompositionKey, mealNoun } from './mealQuery'

const yogurtBerries = [
  { foodDatabaseId: 'a', name: 'Greek Yogurt, Nonfat' },
  { foodDatabaseId: 'b', name: 'Mixed Berries' }
]

test('mealTypeToken - every slot type maps, generic slots collapse to "meal"', () => {
  assert.equal(mealTypeToken('Pre-Workout'), 'pre-workout')
  assert.equal(mealTypeToken('Post Workout Shake'), 'post-workout')
  assert.equal(mealTypeToken('Snack'), 'snack')
  assert.equal(mealTypeToken('Breakfast'), 'breakfast')
  assert.equal(mealTypeToken('Meal 2'), 'meal')
  assert.equal(mealTypeToken('Second Feeding'), 'meal')
})

test('buildMealImageQuery - composition leads, uses foods not the bare label', () => {
  const q = buildMealImageQuery('Snack', yogurtBerries)
  assert.ok(q.includes('yogurt'))
  assert.ok(q.includes('berries'))
  assert.ok(!/^snack/.test(q))
})

test('buildMealImageQuery - post-workout whey + banana reads as a shake', () => {
  const q = buildMealImageQuery('Post-Workout', [
    { foodDatabaseId: 'w', name: 'Whey Protein' },
    { foodDatabaseId: 'b', name: 'Banana, Raw' }
  ])
  assert.ok(q.includes('banana'))
  assert.ok(q.includes('protein') || q.includes('whey'))
  assert.ok(q.includes('shake'))
})

test('mealCompositionKey - stable across order / rename-in-type; changes on food-set change', () => {
  const a = mealCompositionKey('Snack', yogurtBerries)
  const reordered = mealCompositionKey('Snack', [...yogurtBerries].reverse())
  const renamedSameType = mealCompositionKey('Afternoon Snack', yogurtBerries)
  const addedFood = mealCompositionKey('Snack', [...yogurtBerries, { foodDatabaseId: 'c', name: 'Honey' }])
  const differentType = mealCompositionKey('Pre-Workout', yogurtBerries)

  assert.equal(a, reordered)
  assert.equal(a, renamedSameType)
  assert.notEqual(a, addedFood)
  assert.notEqual(a, differentType)
})

test('mealCompositionKey - locked food (no id) keyed by normalised name, still stable', () => {
  const a = mealCompositionKey('Lunch', [{ foodDatabaseId: null, name: 'Grilled Chicken' }])
  const b = mealCompositionKey('Lunch', [{ foodDatabaseId: null, name: 'grilled   chicken' }])
  assert.equal(a, b)
})

test('mealNoun - the biggest contributor is the visual anchor', () => {
  assert.equal(mealNoun('Dinner', [{ foodDatabaseId: 'x', name: 'Salmon, Grilled' }]), 'salmon')
})
