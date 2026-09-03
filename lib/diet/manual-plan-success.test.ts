// Regression coverage for the MANUAL meal-plan builder's success-screen gate
// and its navigation destination. Pure-logic only (node:test, no React/DOM) -
// the component wiring that consumes these is verified by lint + typecheck +
// production build and by manual browser walkthrough.
//
// Maps to the bug report's required cases:
//   (1) success screen must NOT appear before createManualDietPlan succeeds
//   (2) success screen appears after a confirmed successful creation
//   (3) the created plan id is available when success renders
//   (6) a failed plan creation never shows success
//   (4) "View My Meal Plan" points at an existing route the user can land on
//   (9) the deployment-skew ("stale") recovery classifier is untouched
import test from 'node:test'
import assert from 'node:assert/strict'
import { canShowManualPlanSuccess } from './manual-plan-success'
import { decideAuthedRoute } from '../auth/routing'
import { isStaleServerActionError } from '../actions/staleActionError'
import type { CreateManualDietPlanResult } from '../../app/onboarding/manual-actions'

// The exact success shape createManualDietPlan resolves to once every write
// (plan + meals + foods, the active-plan swap, the profile update) landed.
function confirmedResult(): Extract<CreateManualDietPlanResult, { success: true }> {
  return {
    success: true,
    dietPlanId: '11111111-1111-4111-8111-111111111111',
    meals: [
      { id: 'm1', name: 'Breakfast', sortOrder: 0 },
      { id: 'm2', name: 'Lunch', sortOrder: 1 },
      { id: 'm3', name: 'Dinner', sortOrder: 2 }
    ]
  }
}

// (1) Before createManualDietPlan succeeds the client holds no plan id and no
// created meals - the success screen must stay gated shut.
test('canShowManualPlanSuccess - false before any confirmed creation (no id, no meals)', () => {
  assert.equal(canShowManualPlanSuccess({ dietPlanId: null, createdMealCount: 0 }), false)
  assert.equal(canShowManualPlanSuccess({ dietPlanId: undefined, createdMealCount: 0 }), false)
  assert.equal(canShowManualPlanSuccess({ dietPlanId: '', createdMealCount: 3 }), false)
  assert.equal(canShowManualPlanSuccess({ dietPlanId: '   ', createdMealCount: 3 }), false)
})

// (6) A plan id can never be "recovered" from meal rows alone - a result that
// carried meals but somehow no id (corrupted resumed draft, future refactor)
// must NOT unlock success.
test('canShowManualPlanSuccess - meals without a plan id never unlock success', () => {
  assert.equal(canShowManualPlanSuccess({ dietPlanId: null, createdMealCount: 5 }), false)
})

// A plan id with zero persisted meals is likewise not a real completion.
test('canShowManualPlanSuccess - a plan id with no meal rows is rejected', () => {
  assert.equal(canShowManualPlanSuccess({ dietPlanId: 'plan_abc', createdMealCount: 0 }), false)
  assert.equal(canShowManualPlanSuccess({ dietPlanId: 'plan_abc', createdMealCount: -1 }), false)
  assert.equal(canShowManualPlanSuccess({ dietPlanId: 'plan_abc', createdMealCount: 2.5 }), false)
})

// (2) + (3) After a confirmed success the client holds the real diet_plans id
// and the created meals - now, and only now, the success screen may render.
test('canShowManualPlanSuccess - true once a confirmed result is in hand', () => {
  const result = confirmedResult()
  assert.equal(
    canShowManualPlanSuccess({ dietPlanId: result.dietPlanId, createdMealCount: result.meals.length }),
    true
  )
})

// (3) The success result actually carries a navigable identifier - guard the
// contract so it can't be dropped from the return shape without this failing.
test('createManualDietPlan success result exposes a usable dietPlanId', () => {
  const result: CreateManualDietPlanResult = confirmedResult()
  assert.ok('success' in result)
  if (!('success' in result)) return
  assert.equal(typeof result.dietPlanId, 'string')
  assert.ok(result.dietPlanId.length > 0)
  assert.ok(result.meals.length > 0)
})

// (6) An { error } result has no dietPlanId at all - destructuring it into the
// gate yields false, so createManualDietPlan failing can never show success.
test('canShowManualPlanSuccess - an { error } result cannot pass the gate', () => {
  const result: CreateManualDietPlanResult = { error: 'Failed to save diet plan.' }
  const dietPlanId = 'dietPlanId' in result ? (result as { dietPlanId: string }).dietPlanId : null
  const createdMealCount = 'meals' in result ? (result as { meals: unknown[] }).meals.length : 0
  assert.equal(canShowManualPlanSuccess({ dietPlanId, createdMealCount }), false)
})

// (4) "View My Meal Plan" navigates to /dashboard. That is a route a user WITH
// an active plan can actually land on: decideAuthedRoute must NOT bounce them
// away from it (returns null = stay). If this ever regresses to a redirect,
// the post-success navigation would loop back to onboarding.
test('the success destination /dashboard is a valid landing route for a user with an active plan', () => {
  assert.equal(decideAuthedRoute('/dashboard', true, false), null)
})

test('/dashboard still bounces a user with NO active plan back to onboarding (unchanged)', () => {
  assert.equal(decideAuthedRoute('/dashboard', false, false), '/onboarding')
})

// (9) The deployment-skew recovery path added earlier is independent of this
// change: a stale Server Action error is still recognised, and a normal
// confirmed-success flow is still not mistaken for one.
test('deployment-skew classifier is unaffected by the success-gate change', () => {
  const stale = new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.')
  assert.equal(isStaleServerActionError(stale), true)
  assert.equal(isStaleServerActionError(new Error('Failed to save diet plan.')), false)
})
