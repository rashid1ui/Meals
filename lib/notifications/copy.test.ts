import test from 'node:test'
import assert from 'node:assert'
import { mealEmoji, buildMealReminderCopy, buildMilestoneCopy, computeRemainingNutrition } from './copy'
import { MILESTONE_THRESHOLDS } from './milestones'

test('mealEmoji matches known meal keywords, falls back for unknown names', () => {
  assert.strictEqual(mealEmoji('Breakfast'), '🍳')
  assert.strictEqual(mealEmoji('Morning Breakfast'), '🍳')
  assert.strictEqual(mealEmoji('Lunch'), '🍗')
  assert.strictEqual(mealEmoji('Dinner'), '🍽️')
  assert.strictEqual(mealEmoji('Afternoon Snack'), '🥜')
  assert.strictEqual(mealEmoji('Pre-Workout'), '⚡')
  assert.strictEqual(mealEmoji('Post-Workout'), '💪')
  assert.strictEqual(mealEmoji('Midnight Feast'), '🍽️')
})

test('buildMealReminderCopy - basic reminder never hardcodes a meal name (generated from the actual meal)', () => {
  const copy = buildMealReminderCopy('Snack')
  assert.strictEqual(copy.title, 'Snack time 🥜')
  assert.match(copy.body, /Snack/)
})

test('buildMealReminderCopy - includes projected progress only when explicitly provided (never invented)', () => {
  const withoutProjection = buildMealReminderCopy('Lunch')
  assert.doesNotMatch(withoutProjection.body, /%/)

  const withProjection = buildMealReminderCopy('Lunch', { consumedPct: 50, projectedPct: 75 })
  assert.match(withProjection.body, /50%/)
  assert.match(withProjection.body, /75%/)
})

test('buildMealReminderCopy - remaining-nutrition framing (Phase 2 cron) reports exactly what was computed, never invents numbers', () => {
  const copy = buildMealReminderCopy('Dinner', undefined, { proteinGrams: 45, calories: 350 })
  assert.match(copy.body, /45g protein/)
  assert.match(copy.body, /350 calories/)
})

test('buildMealReminderCopy - remaining takes precedence over projected when both are given', () => {
  const copy = buildMealReminderCopy('Dinner', { consumedPct: 60, projectedPct: 80 }, { proteinGrams: 10, calories: 100 })
  assert.match(copy.body, /10g protein/)
  assert.doesNotMatch(copy.body, /60%/)
})

test('buildMealReminderCopy - zero remaining (target already met) falls back to the plain reminder, not "need 0g/0 calories"', () => {
  const copy = buildMealReminderCopy('Snack', undefined, { proteinGrams: 0, calories: 0 })
  assert.doesNotMatch(copy.body, /need/i)
})

test('buildMealReminderCopy - omits a zero component from the remaining-nutrition list (only reports what is actually left)', () => {
  const copy = buildMealReminderCopy('Snack', undefined, { proteinGrams: 0, calories: 200 })
  assert.doesNotMatch(copy.body, /protein/)
  assert.match(copy.body, /200 calories/)
})

const GUILT_WORDS = /failed|behind|missed|bad|shame/i

test('all copy uses positive/neutral language - no guilt-based phrasing', () => {
  const mealCopy = buildMealReminderCopy('Breakfast', { consumedPct: 10, projectedPct: 30 })
  assert.doesNotMatch(mealCopy.title, GUILT_WORDS)
  assert.doesNotMatch(mealCopy.body, GUILT_WORDS)

  for (const threshold of MILESTONE_THRESHOLDS) {
    const copy = buildMilestoneCopy(threshold)
    assert.doesNotMatch(copy.title, GUILT_WORDS)
    assert.doesNotMatch(copy.body, GUILT_WORDS)
  }
})

test('buildMilestoneCopy - every threshold has distinct, non-empty copy', () => {
  const allCopy = MILESTONE_THRESHOLDS.map(buildMilestoneCopy)
  for (const c of allCopy) {
    assert.ok(c.title.length > 0)
    assert.ok(c.body.length > 0)
  }
  const titles = new Set(allCopy.map(c => c.title))
  assert.strictEqual(titles.size, MILESTONE_THRESHOLDS.length)
})

test('computeRemainingNutrition - subtracts consumed from target', () => {
  const result = computeRemainingNutrition({ calories: 1000, protein: 80 }, { calories: 2000, protein: 150 })
  assert.deepStrictEqual(result, { proteinGrams: 70, calories: 1000 })
})

test('computeRemainingNutrition - clamps at zero, never goes negative when the target is exceeded', () => {
  const result = computeRemainingNutrition({ calories: 2500, protein: 200 }, { calories: 2000, protein: 150 })
  assert.deepStrictEqual(result, { proteinGrams: 0, calories: 0 })
})

test('buildMilestoneCopy - 100% copy reads as completion, not another "keep going" nudge', () => {
  const copy = buildMilestoneCopy(100)
  assert.match(copy.title + copy.body, /complete|consistent|reached/i)
})
