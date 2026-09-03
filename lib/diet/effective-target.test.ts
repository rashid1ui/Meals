import test from 'node:test'
import assert from 'node:assert/strict'
import { effectiveDailyTarget, type PlanTargetColumns } from './effective-target'

const onboardingTarget: PlanTargetColumns = {
  calories_target: 2295,
  protein_target: 146,
  carbs_target: 297,
  fat_target: 58
}

// The user's real built plan totals from the screenshot report.
const planFoodTotals = { calories: 2060.4, protein: 126.2, carbs: 266.7, fat: 58.9 }

test('effectiveDailyTarget - a hand-built (user_created) plan is scored against its own food totals, rounded', () => {
  const target = effectiveDailyTarget({ ...onboardingTarget, plan_source: 'user_created' }, planFoodTotals)
  assert.deepEqual(target, { calories: 2060, protein: 126, carbs: 267, fat: 59 })
  // The onboarding recommendation is NOT what progress is measured against.
  assert.notEqual(target.calories, 2295)
})

test('effectiveDailyTarget - ai_generated plans keep their stored *_target columns unchanged', () => {
  const target = effectiveDailyTarget({ ...onboardingTarget, plan_source: 'ai_generated' }, planFoodTotals)
  assert.deepEqual(target, { calories: 2295, protein: 146, carbs: 297, fat: 58 })
})

test('effectiveDailyTarget - user_customized (AI then hand-edited) plans are ALSO scored against their own food totals', () => {
  const target = effectiveDailyTarget({ ...onboardingTarget, plan_source: 'user_customized' }, planFoodTotals)
  assert.deepEqual(target, { calories: 2060, protein: 126, carbs: 267, fat: 59 })
  assert.notEqual(target.calories, 2295)
})

test('effectiveDailyTarget - a missing plan_source falls back to the stored columns', () => {
  assert.deepEqual(effectiveDailyTarget(onboardingTarget, planFoodTotals), {
    calories: 2295,
    protein: 146,
    carbs: 297,
    fat: 58
  })
})

test('effectiveDailyTarget - an unknown/legacy plan_source keeps the stored columns (only user_created / user_customized self-score)', () => {
  assert.deepEqual(effectiveDailyTarget({ ...onboardingTarget, plan_source: 'legacy_thing' }, planFoodTotals), {
    calories: 2295,
    protein: 146,
    carbs: 297,
    fat: 58
  })
})

test('effectiveDailyTarget - user_created with no food totals yet falls back to the stored columns (never a zero target)', () => {
  assert.deepEqual(effectiveDailyTarget({ ...onboardingTarget, plan_source: 'user_created' }, null), {
    calories: 2295,
    protein: 146,
    carbs: 297,
    fat: 58
  })
  assert.deepEqual(effectiveDailyTarget({ ...onboardingTarget, plan_source: 'user_created' }, undefined), {
    calories: 2295,
    protein: 146,
    carbs: 297,
    fat: 58
  })
})

test('effectiveDailyTarget - a user_created plan built ABOVE the recommendation is also scored against itself', () => {
  const target = effectiveDailyTarget(
    { ...onboardingTarget, plan_source: 'user_created' },
    { calories: 2600, protein: 190, carbs: 300, fat: 80 }
  )
  assert.deepEqual(target, { calories: 2600, protein: 190, carbs: 300, fat: 80 })
})

test('effectiveDailyTarget - it never mutates the inputs', () => {
  const plan = { ...onboardingTarget, plan_source: 'user_created' as const }
  const totals = { ...planFoodTotals }
  effectiveDailyTarget(plan, totals)
  assert.deepEqual(plan, { ...onboardingTarget, plan_source: 'user_created' })
  assert.deepEqual(totals, planFoodTotals)
})
