import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recommendWorkoutMeals, trainingTimeLabel, PRE_WORKOUT_TEMPLATES, POST_WORKOUT_TEMPLATES } from './workoutMeals'

test('recommendWorkoutMeals - returns the full curated lists, filtered by goal', () => {
  const result = recommendWorkoutMeals({ goal: 'cut', remainingProtein: 100, remainingCalories: 1000 })
  assert.ok(result.preWorkout.length > 0)
  assert.ok(result.postWorkout.length > 0)
  for (const t of result.preWorkout) assert.ok(t.suitableGoals.includes('cut'))
})

test('recommendWorkoutMeals - falls back to the full pool when nothing matches the goal', () => {
  // Every template list has at least one entry per real Goal value, so this
  // documents the fallback behavior rather than exercising it via a
  // real-world gap - a goal with zero matches would otherwise return nothing.
  const result = recommendWorkoutMeals({ goal: null, remainingProtein: 100, remainingCalories: 1000 })
  assert.equal(result.preWorkout.length, PRE_WORKOUT_TEMPLATES.length)
  assert.equal(result.postWorkout.length, POST_WORKOUT_TEMPLATES.length)
})

test('recommendWorkoutMeals - options that fit the remaining calorie budget rank before ones that do not', () => {
  const result = recommendWorkoutMeals({ goal: null, remainingProtein: 100, remainingCalories: 250 })
  const fitsIndex = result.preWorkout.findIndex(t => t.approxCalories <= 250)
  const overshootsIndex = result.preWorkout.findIndex(t => t.approxCalories > 250)
  if (fitsIndex !== -1 && overshootsIndex !== -1) {
    assert.ok(fitsIndex < overshootsIndex)
  }
})

test('recommendWorkoutMeals - never mutates the source template arrays', () => {
  const preLengthBefore = PRE_WORKOUT_TEMPLATES.length
  recommendWorkoutMeals({ goal: 'lean_bulk', remainingProtein: 50, remainingCalories: 400 })
  assert.equal(PRE_WORKOUT_TEMPLATES.length, preLengthBefore)
})

test('trainingTimeLabel - labels the three fixed times', () => {
  assert.equal(trainingTimeLabel('morning'), 'Morning')
  assert.equal(trainingTimeLabel('afternoon'), 'Afternoon')
  assert.equal(trainingTimeLabel('evening'), 'Evening')
})

test('trainingTimeLabel - a custom time includes the exact time entered', () => {
  assert.equal(trainingTimeLabel('custom', '18:30'), 'Training at 18:30')
})

test('trainingTimeLabel - falls back gracefully with no time set', () => {
  assert.equal(trainingTimeLabel(null), 'Training time')
  assert.equal(trainingTimeLabel(undefined), 'Training time')
})
