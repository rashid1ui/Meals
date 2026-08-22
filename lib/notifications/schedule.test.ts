import test from 'node:test'
import assert from 'node:assert'
import {
  isValidReminderTime,
  timeToMinutes,
  minutesToTime,
  isMealReminderDue,
  nowMinutesLocal,
  defaultReminderTimes,
  buildMealReminderEventKey,
  dueMealReminders,
  type ReminderMeal
} from './schedule'

test('isValidReminderTime accepts well-formed HH:MM, rejects everything else', () => {
  assert.strictEqual(isValidReminderTime('09:00'), true)
  assert.strictEqual(isValidReminderTime('23:59'), true)
  assert.strictEqual(isValidReminderTime('00:00'), true)
  assert.strictEqual(isValidReminderTime('24:00'), false)
  assert.strictEqual(isValidReminderTime('9:00'), false)
  assert.strictEqual(isValidReminderTime('09:60'), false)
  assert.strictEqual(isValidReminderTime('not-a-time'), false)
  assert.strictEqual(isValidReminderTime(''), false)
})

test('timeToMinutes / minutesToTime round-trip', () => {
  assert.strictEqual(timeToMinutes('09:30'), 570)
  assert.strictEqual(timeToMinutes('00:00'), 0)
  assert.strictEqual(timeToMinutes('23:59'), 1439)
  assert.strictEqual(minutesToTime(570), '09:30')
  assert.strictEqual(minutesToTime(0), '00:00')
})

test('isMealReminderDue - true at and after the scheduled minute, false before', () => {
  assert.strictEqual(isMealReminderDue('09:00', 540), true) // exactly due
  assert.strictEqual(isMealReminderDue('09:00', 541), true) // past due (late open)
  assert.strictEqual(isMealReminderDue('09:00', 539), false) // not yet
})

test('nowMinutesLocal uses local wall-clock hours/minutes, not UTC', () => {
  const d = new Date(2026, 0, 15, 14, 30) // local 14:30, whatever the machine's timezone is
  assert.strictEqual(nowMinutesLocal(d), 14 * 60 + 30)
})

test('defaultReminderTimes spreads evenly across 08:00-20:00 for any count', () => {
  assert.deepStrictEqual(defaultReminderTimes(1), ['08:00'])
  assert.deepStrictEqual(defaultReminderTimes(3), ['08:00', '14:00', '20:00'])
  assert.deepStrictEqual(defaultReminderTimes(4), ['08:00', '12:00', '16:00', '20:00'])
  assert.strictEqual(defaultReminderTimes(6).length, 6)
  assert.strictEqual(defaultReminderTimes(6)[0], '08:00')
  assert.strictEqual(defaultReminderTimes(6)[5], '20:00')
})

test('buildMealReminderEventKey is stable and unique per meal id', () => {
  assert.strictEqual(buildMealReminderEventKey('meal-1'), buildMealReminderEventKey('meal-1'))
  assert.notStrictEqual(buildMealReminderEventKey('meal-1'), buildMealReminderEventKey('meal-2'))
})

function meal(overrides: Partial<ReminderMeal> = {}): ReminderMeal {
  return { id: 'meal-1', name: 'Breakfast', reminderTime: '09:00', reminderEnabled: true, status: 'none', ...overrides }
}

test('dueMealReminders - fires for a due, enabled, not-yet-complete meal', () => {
  const result = dueMealReminders([meal()], 540)
  assert.strictEqual(result.length, 1)
})

test('dueMealReminders - skips a meal whose time has not arrived yet', () => {
  const result = dueMealReminders([meal({ reminderTime: '09:00' })], 500)
  assert.strictEqual(result.length, 0)
})

test('dueMealReminders - skips a meal with reminders disabled', () => {
  const result = dueMealReminders([meal({ reminderEnabled: false })], 600)
  assert.strictEqual(result.length, 0)
})

test('dueMealReminders - skips a meal with no reminder time configured', () => {
  const result = dueMealReminders([meal({ reminderTime: null })], 600)
  assert.strictEqual(result.length, 0)
})

test('dueMealReminders - skips a meal already fully logged (no spam for completed meals)', () => {
  const result = dueMealReminders([meal({ status: 'complete' })], 600)
  assert.strictEqual(result.length, 0)
})

test('dueMealReminders - stays due for the rest of the day (late catch-up), not just at the exact minute', () => {
  // Opened the app at 13:00 (780 min) with a 09:00 (540 min) reminder still unlogged.
  const result = dueMealReminders([meal({ reminderTime: '09:00', status: 'partial' })], 780)
  assert.strictEqual(result.length, 1)
})

test('dueMealReminders - evaluates multiple meals independently', () => {
  const meals: ReminderMeal[] = [
    meal({ id: 'breakfast', reminderTime: '09:00', status: 'complete' }), // done, no fire
    meal({ id: 'lunch', reminderTime: '13:00', status: 'none' }), // due, fires
    meal({ id: 'dinner', reminderTime: '20:00', status: 'none' }) // not due yet
  ]
  const result = dueMealReminders(meals, 14 * 60) // 14:00
  assert.deepStrictEqual(result.map(m => m.id), ['lunch'])
})
