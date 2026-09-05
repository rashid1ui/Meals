import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMealImageCarryForwardIndex, decideMealImageCarryForward, type PriorMeal } from './mealCarryForward'

const RESOLVED_IMAGE = {
  image_url: 'https://images.pexels.com/photos/1/x.jpg',
  image_alt: 'grilled chicken and rice',
  image_attribution: { source: 'pexels', is_representative: true },
  image_status: 'representative'
}

function priorMeal(overrides: Partial<PriorMeal>): PriorMeal {
  return {
    id: 'meal-1',
    name: 'Lunch',
    foods: [{ foodDatabaseId: null, name: 'Grilled Chicken' }, { foodDatabaseId: null, name: 'White Rice' }],
    image_url: RESOLVED_IMAGE.image_url,
    image_alt: RESOLVED_IMAGE.image_alt,
    image_attribution: RESOLVED_IMAGE.image_attribution,
    image_status: RESOLVED_IMAGE.image_status,
    image_composition_key: null,
    ...overrides
  }
}

test('quantity-only change: same foods, same slot -> image carried, 0 re-resolution', () => {
  const prior = [priorMeal({})]
  const index = buildMealImageCarryForwardIndex(prior)
  const decision = decideMealImageCarryForward(
    { currentId: 'meal-1', name: 'Lunch', foods: [{ foodDatabaseId: null, name: 'Grilled Chicken' }, { foodDatabaseId: null, name: 'White Rice' }] },
    index
  )
  assert.ok(decision.carriedImage)
  assert.equal(decision.carriedImage!.image_url, RESOLVED_IMAGE.image_url)
})

test('reordering foods within the meal: still carried (composition is a SET, not a sequence)', () => {
  const prior = [priorMeal({})]
  const index = buildMealImageCarryForwardIndex(prior)
  const decision = decideMealImageCarryForward(
    { currentId: 'meal-1', name: 'Lunch', foods: [{ foodDatabaseId: null, name: 'White Rice' }, { foodDatabaseId: null, name: 'Grilled Chicken' }] },
    index
  )
  assert.ok(decision.carriedImage)
})

test('reordering MEALS: each meal still matches by its own currentId/composition, unaffected by order', () => {
  const prior = [
    priorMeal({ id: 'meal-1', name: 'Breakfast', foods: [{ foodDatabaseId: null, name: 'Oats' }] }),
    priorMeal({ id: 'meal-2', name: 'Lunch', foods: [{ foodDatabaseId: null, name: 'Grilled Chicken' }] })
  ]
  const index = buildMealImageCarryForwardIndex(prior)
  const lunchDecision = decideMealImageCarryForward({ currentId: 'meal-2', name: 'Lunch', foods: [{ foodDatabaseId: null, name: 'Grilled Chicken' }] }, index)
  const breakfastDecision = decideMealImageCarryForward({ currentId: 'meal-1', name: 'Breakfast', foods: [{ foodDatabaseId: null, name: 'Oats' }] }, index)
  assert.ok(lunchDecision.carriedImage)
  assert.ok(breakfastDecision.carriedImage)
})

test('composition change (a food is swapped): that meal is NOT carried -> gets re-resolved', () => {
  const prior = [priorMeal({})]
  const index = buildMealImageCarryForwardIndex(prior)
  const decision = decideMealImageCarryForward(
    { currentId: 'meal-1', name: 'Lunch', foods: [{ foodDatabaseId: null, name: 'Grilled Salmon' }, { foodDatabaseId: null, name: 'White Rice' }] },
    index
  )
  assert.equal(decision.carriedImage, null)
})

test('a brand-new meal (no currentId, no matching composition) is not carried', () => {
  const index = buildMealImageCarryForwardIndex([priorMeal({})])
  const decision = decideMealImageCarryForward({ currentId: null, name: 'Snack', foods: [{ foodDatabaseId: null, name: 'Greek Yogurt' }] }, index)
  assert.equal(decision.carriedImage, null)
})

test('user_provided: survives a composition change unconditionally (matched by meal id, not fingerprint)', () => {
  const prior = [priorMeal({ image_status: 'user_provided', image_url: 'https://example.com/my-photo.jpg' })]
  const index = buildMealImageCarryForwardIndex(prior)
  const decision = decideMealImageCarryForward(
    { currentId: 'meal-1', name: 'Lunch', foods: [{ foodDatabaseId: null, name: 'Steak' }, { foodDatabaseId: null, name: 'Sweet Potato' }] },
    index
  )
  assert.ok(decision.carriedImage)
  assert.equal(decision.carriedImage!.image_status, 'user_provided')
  assert.equal(decision.carriedImage!.image_url, 'https://example.com/my-photo.jpg')
})

test('user_provided never leaks into composition-key matching for an unrelated meal with the same foods', () => {
  const prior = [priorMeal({ id: 'meal-1', image_status: 'user_provided', image_url: 'https://example.com/mine.jpg' })]
  const index = buildMealImageCarryForwardIndex(prior)
  const decision = decideMealImageCarryForward(
    { currentId: 'meal-2', name: 'Lunch', foods: [{ foodDatabaseId: null, name: 'Grilled Chicken' }, { foodDatabaseId: null, name: 'White Rice' }] },
    index
  )
  assert.equal(decision.carriedImage, null)
})

test('stored image_composition_key (from the DB column) is trusted over recomputing when present', () => {
  const prior = [priorMeal({ image_composition_key: 'lunch::id:legacy-food-id' })]
  const index = buildMealImageCarryForwardIndex(prior)
  assert.ok(index.imageByCompositionKey.has('lunch::id:legacy-food-id'))
  assert.ok(!index.imageByCompositionKey.has('lunch::name:grilled chicken,name:white rice'))
})
