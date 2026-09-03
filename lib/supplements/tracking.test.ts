import test from 'node:test'
import assert from 'node:assert'
import { buildExpectedDoses, computeSupplementProgress, buildSupplementTrackingRow, type TrackableSupplement } from './tracking'

function supplement(overrides: Partial<TrackableSupplement> = {}): TrackableSupplement {
  return { id: 's1', times: ['08:00'], startDate: '2026-01-01', endDate: null, ...overrides }
}

// buildExpectedDoses - one expected dose per (supplement, time) pair.

test('buildExpectedDoses - a single-time supplement produces exactly one dose', () => {
  const doses = buildExpectedDoses([supplement()], '2026-01-15')
  assert.deepStrictEqual(doses, [{ userSupplementId: 's1', scheduledTime: '08:00' }])
})

test('buildExpectedDoses - a supplement with two scheduled times produces TWO independent doses, never collapsed', () => {
  const doses = buildExpectedDoses([supplement({ id: 'omega3', times: ['13:00', '20:00'] })], '2026-01-15')
  assert.strictEqual(doses.length, 2)
  assert.deepStrictEqual(doses, [
    { userSupplementId: 'omega3', scheduledTime: '13:00' },
    { userSupplementId: 'omega3', scheduledTime: '20:00' }
  ])
})

test('buildExpectedDoses - excludes a supplement before its start date', () => {
  const doses = buildExpectedDoses([supplement({ startDate: '2026-02-01' })], '2026-01-15')
  assert.deepStrictEqual(doses, [])
})

test('buildExpectedDoses - excludes a supplement after its end date', () => {
  const doses = buildExpectedDoses([supplement({ endDate: '2026-01-10' })], '2026-01-15')
  assert.deepStrictEqual(doses, [])
})

test('buildExpectedDoses - includes a supplement with no end date (ongoing) on any date at/after start', () => {
  const doses = buildExpectedDoses([supplement({ startDate: '2026-01-01', endDate: null })], '2027-06-01')
  assert.strictEqual(doses.length, 1)
})

test('buildExpectedDoses - matches the spec worked example: 5 scheduled doses across 4 supplements', () => {
  const supplements: TrackableSupplement[] = [
    supplement({ id: 'man-max', times: ['08:30'] }),
    supplement({ id: 'ossofortin', times: ['13:00'] }),
    supplement({ id: 'omega3', times: ['13:00', '20:00'] }),
    supplement({ id: 'magnesium', times: ['22:00'] })
  ]
  const doses = buildExpectedDoses(supplements, '2026-01-15')
  assert.strictEqual(doses.length, 5)
})

test('buildExpectedDoses - different supplements are evaluated independently of each other\'s date ranges', () => {
  const supplements: TrackableSupplement[] = [
    supplement({ id: 'active', startDate: '2026-01-01', endDate: null }),
    supplement({ id: 'not-yet', startDate: '2026-02-01', endDate: null }),
    supplement({ id: 'ended', startDate: '2025-01-01', endDate: '2025-12-31' })
  ]
  const doses = buildExpectedDoses(supplements, '2026-01-15')
  assert.deepStrictEqual(doses.map(d => d.userSupplementId), ['active'])
})

// computeSupplementProgress - the ONE authoritative percentage calculation.

test('computeSupplementProgress - matches the spec worked example: 3/5 = 60%', () => {
  const doses = [
    { completed: true },
    { completed: true },
    { completed: true },
    { completed: false },
    { completed: false }
  ]
  assert.deepStrictEqual(computeSupplementProgress(doses), { completed: 3, total: 5, percentage: 60 })
})

test('computeSupplementProgress - 0/5 = 0%', () => {
  const doses = Array.from({ length: 5 }, () => ({ completed: false }))
  assert.deepStrictEqual(computeSupplementProgress(doses), { completed: 0, total: 5, percentage: 0 })
})

test('computeSupplementProgress - 1/5 = 20%', () => {
  const doses = [{ completed: true }, ...Array.from({ length: 4 }, () => ({ completed: false }))]
  assert.deepStrictEqual(computeSupplementProgress(doses), { completed: 1, total: 5, percentage: 20 })
})

test('computeSupplementProgress - 5/5 = 100%', () => {
  const doses = Array.from({ length: 5 }, () => ({ completed: true }))
  assert.deepStrictEqual(computeSupplementProgress(doses), { completed: 5, total: 5, percentage: 100 })
})

test('computeSupplementProgress - zero scheduled doses is 0%, never NaN/divide-by-zero', () => {
  const result = computeSupplementProgress([])
  assert.deepStrictEqual(result, { completed: 0, total: 0, percentage: 0 })
  assert.ok(Number.isFinite(result.percentage))
})

test('computeSupplementProgress - completion is based on actual dose completion, not the number of supplement records', () => {
  // 4 supplements exist, but only 3 of their 5 total scheduled doses are
  // completed - the percentage must be 60%, not tied to "4 supplements".
  const doses = [
    { completed: true }, // Man Max
    { completed: true }, // Ossofortin
    { completed: true }, // Omega 3 @ 1pm
    { completed: false }, // Omega 3 @ 8pm
    { completed: false } // Magnesium
  ]
  assert.strictEqual(computeSupplementProgress(doses).percentage, 60)
})

// buildSupplementTrackingRow - completed_at always derives from `completed`,
// never passed independently (mirrors buildFoodTrackingRow's own pattern).

test('buildSupplementTrackingRow - completed=true sets completed_at to the injected timestamp', () => {
  const row = buildSupplementTrackingRow(
    { userId: 'u1', userSupplementId: 's1', trackingDate: '2026-01-15', scheduledTime: '08:00', completed: true },
    () => '2026-01-15T08:05:00.000Z'
  )
  assert.strictEqual(row.completed, true)
  assert.strictEqual(row.completed_at, '2026-01-15T08:05:00.000Z')
  assert.strictEqual(row.updated_at, '2026-01-15T08:05:00.000Z')
})

test('buildSupplementTrackingRow - completed=false always sets completed_at to null (un-marking)', () => {
  const row = buildSupplementTrackingRow(
    { userId: 'u1', userSupplementId: 's1', trackingDate: '2026-01-15', scheduledTime: '08:00', completed: false },
    () => '2026-01-15T09:00:00.000Z'
  )
  assert.strictEqual(row.completed, false)
  assert.strictEqual(row.completed_at, null)
})

test('buildSupplementTrackingRow - two different scheduled times for the same supplement build independent rows', () => {
  const now = () => '2026-01-15T00:00:00.000Z'
  const morning = buildSupplementTrackingRow(
    { userId: 'u1', userSupplementId: 'omega3', trackingDate: '2026-01-15', scheduledTime: '13:00', completed: true },
    now
  )
  const evening = buildSupplementTrackingRow(
    { userId: 'u1', userSupplementId: 'omega3', trackingDate: '2026-01-15', scheduledTime: '20:00', completed: false },
    now
  )
  assert.strictEqual(morning.scheduled_time, '13:00')
  assert.strictEqual(evening.scheduled_time, '20:00')
  assert.notStrictEqual(morning.completed, evening.completed)
})
