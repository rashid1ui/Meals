import test from 'node:test'
import assert from 'node:assert'
import {
  validateSupplementInput,
  defaultTimesForFrequency,
  FREQUENCY_OPTIONS,
  type SupplementInput
} from './validation'

function input(overrides: Partial<SupplementInput> = {}): SupplementInput {
  return {
    name: 'Vitamin D3',
    dose: 5000,
    doseUnit: 'IU',
    quantity: 1,
    quantityUnit: 'capsule',
    frequency: 'once_daily',
    times: ['08:00'],
    startDate: '2026-01-01',
    endDate: null,
    notes: null,
    notificationEnabled: true,
    ...overrides
  }
}

test('validateSupplementInput - accepts a well-formed supplement', () => {
  assert.deepStrictEqual(validateSupplementInput(input()), { valid: true })
})

test('validateSupplementInput - rejects a blank/whitespace-only name', () => {
  const result = validateSupplementInput(input({ name: '   ' }))
  assert.strictEqual(result.valid, false)
})

test('validateSupplementInput - a free-text, non-catalog name is fine (no fixed catalog)', () => {
  const result = validateSupplementInput(input({ name: "Grandma's Herbal Mix" }))
  assert.strictEqual(result.valid, true)
})

test('validateSupplementInput - rejects a negative dose, but null dose (not tracked) is fine', () => {
  assert.strictEqual(validateSupplementInput(input({ dose: -5 })).valid, false)
  assert.strictEqual(validateSupplementInput(input({ dose: null, doseUnit: null })).valid, true)
})

test('validateSupplementInput - rejects a non-positive quantity', () => {
  assert.strictEqual(validateSupplementInput(input({ quantity: 0 })).valid, false)
  assert.strictEqual(validateSupplementInput(input({ quantity: -1 })).valid, false)
})

test('validateSupplementInput - rejects a blank quantity unit', () => {
  assert.strictEqual(validateSupplementInput(input({ quantityUnit: '  ' })).valid, false)
})

test('validateSupplementInput - rejects an invalid frequency value', () => {
  // @ts-expect-error deliberately invalid for the test
  const result = validateSupplementInput(input({ frequency: 'hourly' }))
  assert.strictEqual(result.valid, false)
})

test('validateSupplementInput - rejects zero reminder times', () => {
  assert.strictEqual(validateSupplementInput(input({ times: [] })).valid, false)
})

test('validateSupplementInput - accepts multiple reminder times (twice daily)', () => {
  const result = validateSupplementInput(input({ frequency: 'twice_daily', times: ['08:00', '20:00'] }))
  assert.strictEqual(result.valid, true)
})

test('validateSupplementInput - rejects a malformed reminder time', () => {
  assert.strictEqual(validateSupplementInput(input({ times: ['8am'] })).valid, false)
})

test('validateSupplementInput - rejects an invalid start date', () => {
  assert.strictEqual(validateSupplementInput(input({ startDate: 'not-a-date' })).valid, false)
})

test('validateSupplementInput - rejects an end date before the start date', () => {
  const result = validateSupplementInput(input({ startDate: '2026-02-01', endDate: '2026-01-01' }))
  assert.strictEqual(result.valid, false)
})

test('validateSupplementInput - accepts a null end date (ongoing)', () => {
  const result = validateSupplementInput(input({ endDate: null }))
  assert.strictEqual(result.valid, true)
})

test('validateSupplementInput - accepts an end date on the same day as the start date', () => {
  const result = validateSupplementInput(input({ startDate: '2026-01-01', endDate: '2026-01-01' }))
  assert.strictEqual(result.valid, true)
})

test('defaultTimesForFrequency - once daily is a single time', () => {
  assert.deepStrictEqual(defaultTimesForFrequency('once_daily', []), ['08:00'])
})

test('defaultTimesForFrequency - twice daily preserves an already-set first time', () => {
  assert.deepStrictEqual(defaultTimesForFrequency('twice_daily', ['06:30']), ['06:30', '20:00'])
})

test('defaultTimesForFrequency - three times daily fills in three defaults from empty', () => {
  assert.deepStrictEqual(defaultTimesForFrequency('three_times_daily', []), ['08:00', '14:00', '20:00'])
})

test('defaultTimesForFrequency - custom preserves whatever times already exist', () => {
  assert.deepStrictEqual(defaultTimesForFrequency('custom', ['09:00', '13:00', '17:00']), ['09:00', '13:00', '17:00'])
})

test('defaultTimesForFrequency - custom with nothing yet configured falls back to one default time', () => {
  assert.deepStrictEqual(defaultTimesForFrequency('custom', []), ['08:00'])
})

test('FREQUENCY_OPTIONS - covers at minimum once/twice/three-times/custom (spec section 3)', () => {
  const values = FREQUENCY_OPTIONS.map(f => f.value)
  assert.ok(values.includes('once_daily'))
  assert.ok(values.includes('twice_daily'))
  assert.ok(values.includes('three_times_daily'))
  assert.ok(values.includes('custom'))
})
