import test from 'node:test'
import assert from 'node:assert'
import { MILESTONE_THRESHOLDS, buildMilestoneEventKey, thresholdsToClaim } from './milestones'

test('thresholdsToClaim - 25% crossed', () => {
  assert.deepStrictEqual(thresholdsToClaim(25, []), [25])
})

test('thresholdsToClaim - 50% crossed (25 already claimed earlier today)', () => {
  assert.deepStrictEqual(thresholdsToClaim(50, [25]), [50])
})

test('thresholdsToClaim - 75% crossed', () => {
  assert.deepStrictEqual(thresholdsToClaim(75, [25, 50]), [75])
})

test('thresholdsToClaim - 90% crossed', () => {
  assert.deepStrictEqual(thresholdsToClaim(90, [25, 50, 75]), [90])
})

test('thresholdsToClaim - 100% crossed', () => {
  assert.deepStrictEqual(thresholdsToClaim(100, [25, 50, 75, 90]), [100])
})

test('thresholdsToClaim - does not re-claim an already-claimed threshold (no duplicate)', () => {
  assert.deepStrictEqual(thresholdsToClaim(50, [25, 50]), [])
})

test('thresholdsToClaim - below every threshold claims nothing', () => {
  assert.deepStrictEqual(thresholdsToClaim(10, []), [])
})

test('thresholdsToClaim - a single big jump (e.g. logging a large meal) returns every newly-crossed threshold, ascending', () => {
  assert.deepStrictEqual(thresholdsToClaim(95, []), [25, 50, 75, 90])
})

test('thresholdsToClaim - exactly all thresholds at 100%, none previously claimed', () => {
  assert.deepStrictEqual(thresholdsToClaim(100, []), [...MILESTONE_THRESHOLDS])
})

test('buildMilestoneEventKey is stable per threshold and distinct across thresholds', () => {
  assert.strictEqual(buildMilestoneEventKey(50), buildMilestoneEventKey(50))
  const keys = new Set(MILESTONE_THRESHOLDS.map(buildMilestoneEventKey))
  assert.strictEqual(keys.size, MILESTONE_THRESHOLDS.length)
})
