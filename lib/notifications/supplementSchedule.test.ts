import test from 'node:test'
import assert from 'node:assert'
import {
  buildSupplementReminderEventKey,
  isSupplementActiveOn,
  dueSupplementReminders,
  type ReminderSupplement
} from './supplementSchedule'

function supplement(overrides: Partial<ReminderSupplement> = {}): ReminderSupplement {
  return {
    id: 'supplement-1',
    name: 'Vitamin D3',
    dose: 5000,
    doseUnit: 'IU',
    quantity: 1,
    quantityUnit: 'capsule',
    times: ['08:00'],
    notificationEnabled: true,
    startDate: '2026-01-01',
    endDate: null,
    ...overrides
  }
}

test('buildSupplementReminderEventKey - stable and unique per (supplement, time) pair', () => {
  assert.strictEqual(buildSupplementReminderEventKey('s1', '08:00'), buildSupplementReminderEventKey('s1', '08:00'))
  assert.notStrictEqual(buildSupplementReminderEventKey('s1', '08:00'), buildSupplementReminderEventKey('s1', '20:00'))
  assert.notStrictEqual(buildSupplementReminderEventKey('s1', '08:00'), buildSupplementReminderEventKey('s2', '08:00'))
})

test('isSupplementActiveOn - ongoing (no end date) is active on and after the start date', () => {
  const s = supplement({ startDate: '2026-01-10', endDate: null })
  assert.strictEqual(isSupplementActiveOn(s, '2026-01-09'), false)
  assert.strictEqual(isSupplementActiveOn(s, '2026-01-10'), true)
  assert.strictEqual(isSupplementActiveOn(s, '2026-06-01'), true)
})

test('isSupplementActiveOn - respects an end date (inclusive)', () => {
  const s = supplement({ startDate: '2026-01-01', endDate: '2026-01-31' })
  assert.strictEqual(isSupplementActiveOn(s, '2026-01-31'), true)
  assert.strictEqual(isSupplementActiveOn(s, '2026-02-01'), false)
})

test('dueSupplementReminders - fires for a due, enabled, active supplement', () => {
  const result = dueSupplementReminders([supplement()], 8 * 60, '2026-01-15')
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].supplementId, 'supplement-1')
  assert.strictEqual(result[0].time, '08:00')
})

test('dueSupplementReminders - skips a supplement with notifications disabled', () => {
  const result = dueSupplementReminders([supplement({ notificationEnabled: false })], 8 * 60, '2026-01-15')
  assert.strictEqual(result.length, 0)
})

test('dueSupplementReminders - skips a supplement before its start date', () => {
  const result = dueSupplementReminders([supplement({ startDate: '2026-02-01' })], 8 * 60, '2026-01-15')
  assert.strictEqual(result.length, 0)
})

test('dueSupplementReminders - skips a supplement after its end date', () => {
  const result = dueSupplementReminders([supplement({ endDate: '2026-01-10' })], 8 * 60, '2026-01-15')
  assert.strictEqual(result.length, 0)
})

test('dueSupplementReminders - a supplement with multiple times can fire more than once a day, independently', () => {
  const magnesium = supplement({ id: 'mag', name: 'Magnesium', times: ['08:00', '20:00'] })

  const morning = dueSupplementReminders([magnesium], 8 * 60, '2026-01-15')
  assert.strictEqual(morning.length, 1)
  assert.strictEqual(morning[0].time, '08:00')

  const evening = dueSupplementReminders([magnesium], 20 * 60, '2026-01-15')
  assert.strictEqual(evening.length, 1)
  assert.strictEqual(evening[0].time, '20:00')

  // Neither time due right now (mid-afternoon) - zero occurrences.
  const afternoon = dueSupplementReminders([magnesium], 14 * 60, '2026-01-15')
  assert.strictEqual(afternoon.length, 0)
})

test('dueSupplementReminders - different supplements are evaluated independently', () => {
  const vitaminD = supplement({ id: 'vd', name: 'Vitamin D3', times: ['08:00'] })
  const omega3 = supplement({ id: 'o3', name: 'Omega-3', times: ['13:00'], notificationEnabled: false })

  const result = dueSupplementReminders([vitaminD, omega3], 8 * 60, '2026-01-15')
  assert.deepStrictEqual(
    result.map(o => o.supplementId),
    ['vd']
  )
})

test('dueSupplementReminders - occurrence carries the real dose/quantity for copy generation (never a generic message)', () => {
  const result = dueSupplementReminders([supplement()], 8 * 60, '2026-01-15')
  assert.strictEqual(result[0].name, 'Vitamin D3')
  assert.strictEqual(result[0].dose, 5000)
  assert.strictEqual(result[0].doseUnit, 'IU')
  assert.strictEqual(result[0].quantity, 1)
  assert.strictEqual(result[0].quantityUnit, 'capsule')
})
