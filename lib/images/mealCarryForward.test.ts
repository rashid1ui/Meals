import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMealImageCarryForwardIndex, decideMealImageCarryForward, type PriorMeal } from './mealCarryForward'

const CHECKED_AT = '2026-09-05T09:51:52.426+00:00'

const RESOLVED_IMAGE = {
  image_url: 'https://images.pexels.com/photos/1/x.jpg',
  image_alt: 'grilled chicken and rice',
  image_attribution: { source: 'pexels', is_representative: true },
  image_status: 'representative',
  image_checked_at: CHECKED_AT
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
    image_checked_at: RESOLVED_IMAGE.image_checked_at,
    image_composition_key: null,
    ...overrides
  }
}

// A meal that was already attempted and came back with no confident match -
// image_url stays NULL, image_status is 'unresolved', but it WAS checked
// (image_checked_at is set).
function unresolvedPriorMeal(overrides: Partial<PriorMeal>): PriorMeal {
  return priorMeal({
    image_url: null,
    image_alt: null,
    image_attribution: null,
    image_status: 'unresolved',
    image_checked_at: CHECKED_AT,
    ...overrides
  })
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

// --- F4 regression: an already-unresolved meal must not be retried just
// because a DIFFERENT meal in the same save changed. Composition-key
// identity - not "does it have an image_url" - decides carry-forward. ------

test('F4: unresolved meal, unchanged composition -> carried as still-unresolved, NOT retried', () => {
  const prior = [unresolvedPriorMeal({ id: 'meal-6', name: 'Snack', foods: [{ foodDatabaseId: null, name: 'Nonfat Greek Yogurt' }, { foodDatabaseId: null, name: 'QA Test Turkey Breast' }] })]
  const index = buildMealImageCarryForwardIndex(prior)
  const decision = decideMealImageCarryForward(
    { currentId: 'meal-6', name: 'Snack', foods: [{ foodDatabaseId: null, name: 'Nonfat Greek Yogurt' }, { foodDatabaseId: null, name: 'QA Test Turkey Breast' }] },
    index
  )
  // Carried, not null - this is the fix: previously an unresolved meal was
  // never indexed at all, so it looked "new" and got rescheduled every save.
  assert.ok(decision.carriedImage, 'an unchanged unresolved meal must be carried forward, not treated as new')
  assert.equal(decision.carriedImage!.image_url, null)
  assert.equal(decision.carriedImage!.image_status, 'unresolved')
})

test('F4: unresolved meal + an UNRELATED meal changing in the same save -> the unresolved one is still not retried', () => {
  const prior = [
    priorMeal({ id: 'meal-1', name: 'Lunch', foods: [{ foodDatabaseId: null, name: 'Grilled Chicken' }] }),
    unresolvedPriorMeal({ id: 'meal-6', name: 'Snack', foods: [{ foodDatabaseId: null, name: 'Nonfat Greek Yogurt' }, { foodDatabaseId: null, name: 'QA Test Turkey Breast' }] })
  ]
  const index = buildMealImageCarryForwardIndex(prior)

  // Lunch's composition changed (Broccoli added) - unrelated to Snack.
  const lunchDecision = decideMealImageCarryForward(
    { currentId: 'meal-1', name: 'Lunch', foods: [{ foodDatabaseId: null, name: 'Grilled Chicken' }, { foodDatabaseId: null, name: 'Broccoli' }] },
    index
  )
  assert.equal(lunchDecision.carriedImage, null) // Lunch itself is eligible for re-resolution

  // Snack's composition is untouched - must remain carried as unresolved.
  const snackDecision = decideMealImageCarryForward(
    { currentId: 'meal-6', name: 'Snack', foods: [{ foodDatabaseId: null, name: 'Nonfat Greek Yogurt' }, { foodDatabaseId: null, name: 'QA Test Turkey Breast' }] },
    index
  )
  assert.ok(snackDecision.carriedImage, 'Snack must not be rescheduled just because Lunch changed')
  assert.equal(snackDecision.carriedImage!.image_status, 'unresolved')
})

test('F4: unresolved meal + an ACTUAL composition change -> retry allowed for that meal', () => {
  const prior = [unresolvedPriorMeal({ id: 'meal-6', name: 'Snack' })]
  const index = buildMealImageCarryForwardIndex(prior)
  const decision = decideMealImageCarryForward(
    { currentId: 'meal-6', name: 'Snack', foods: [{ foodDatabaseId: null, name: 'Cottage Cheese' }] },
    index
  )
  assert.equal(decision.carriedImage, null, 'a real composition change must be eligible for a fresh attempt, even for a previously-unresolved meal')
})

test('F4: a resolved meal is still untouched by an unrelated meal change (unaffected by the fix)', () => {
  const prior = [
    priorMeal({ id: 'meal-1', name: 'Breakfast' }),
    unresolvedPriorMeal({ id: 'meal-6', name: 'Snack' })
  ]
  const index = buildMealImageCarryForwardIndex(prior)
  const breakfastDecision = decideMealImageCarryForward({ currentId: 'meal-1', name: 'Breakfast', foods: prior[0].foods }, index)
  assert.ok(breakfastDecision.carriedImage)
  assert.equal(breakfastDecision.carriedImage!.image_url, RESOLVED_IMAGE.image_url)
})

test('F4: a genuinely new meal (never checked before) is still eligible for its first resolution', () => {
  // No prior meal at all shares this composition or currentId - distinct
  // from the "existing unresolved" case above.
  const index = buildMealImageCarryForwardIndex([priorMeal({})])
  const decision = decideMealImageCarryForward(
    { currentId: null, name: 'Pre-Workout', foods: [{ foodDatabaseId: null, name: 'Banana' }] },
    index
  )
  assert.equal(decision.carriedImage, null)
})

test('F4: a meal with image_status=null and no image_url (never attempted) is NOT indexed as "known unresolved"', () => {
  // Distinguishes "new/never-checked" from "existing unresolved" - a
  // pending/never-attempted meal must not block a first real attempt.
  const prior = [priorMeal({ image_url: null, image_alt: null, image_attribution: null, image_status: null, image_checked_at: null })]
  const index = buildMealImageCarryForwardIndex(prior)
  const decision = decideMealImageCarryForward({ currentId: 'meal-1', name: 'Lunch', foods: prior[0].foods }, index)
  assert.equal(decision.carriedImage, null)
})

// --- F5 regression: image_checked_at must be preserved verbatim across a
// carry-forward, for every status, including a preserved NULL. ------------

test('F5: a resolved meal retains its exact image_checked_at across an unrelated save', () => {
  const prior = [priorMeal({ image_status: 'resolved', image_checked_at: CHECKED_AT })]
  const index = buildMealImageCarryForwardIndex(prior)
  const decision = decideMealImageCarryForward({ currentId: 'meal-1', name: 'Lunch', foods: prior[0].foods }, index)
  assert.equal(decision.carriedImage?.image_checked_at, CHECKED_AT)
})

test('F5: a representative meal retains its exact image_checked_at across an unrelated save', () => {
  const prior = [priorMeal({ image_status: 'representative', image_checked_at: CHECKED_AT })]
  const index = buildMealImageCarryForwardIndex(prior)
  const decision = decideMealImageCarryForward({ currentId: 'meal-1', name: 'Lunch', foods: prior[0].foods }, index)
  assert.equal(decision.carriedImage?.image_checked_at, CHECKED_AT)
})

test('F5: an unresolved meal retains its exact (non-null) image_checked_at when carried forward', () => {
  const prior = [unresolvedPriorMeal({})]
  const index = buildMealImageCarryForwardIndex(prior)
  const decision = decideMealImageCarryForward({ currentId: 'meal-1', name: 'Lunch', foods: prior[0].foods }, index)
  assert.equal(decision.carriedImage?.image_status, 'unresolved')
  assert.equal(decision.carriedImage?.image_checked_at, CHECKED_AT)
})

test('F5: user-provided image metadata - including image_checked_at - is carried through untouched', () => {
  const prior = [priorMeal({ image_status: 'user_provided', image_url: 'https://example.com/mine.jpg', image_checked_at: null })]
  const index = buildMealImageCarryForwardIndex(prior)
  const decision = decideMealImageCarryForward(
    { currentId: 'meal-1', name: 'Lunch', foods: [{ foodDatabaseId: null, name: 'Something Completely Different' }] },
    index
  )
  assert.equal(decision.carriedImage?.image_status, 'user_provided')
  assert.equal(decision.carriedImage?.image_checked_at, null) // preserved exactly - a human-set image was never "checked" by the resolver
})
