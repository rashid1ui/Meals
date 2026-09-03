import test from 'node:test'
import assert from 'node:assert'
import { buildSupplementReminderCopy } from './supplementCopy'
import type { SupplementReminderOccurrence } from './supplementSchedule'

function occurrence(overrides: Partial<SupplementReminderOccurrence> = {}): SupplementReminderOccurrence {
  return {
    supplementId: 'supplement-1',
    name: 'Vitamin D3',
    time: '08:00',
    dose: 5000,
    doseUnit: 'IU',
    quantity: 1,
    quantityUnit: 'capsule',
    ...overrides
  }
}

test('buildSupplementReminderCopy - identifies the actual supplement by name, never a generic message', () => {
  const copy = buildSupplementReminderCopy(occurrence())
  assert.match(copy.title, /Vitamin D3/)
  assert.match(copy.body, /Vitamin D3/)
  assert.doesNotMatch(copy.body, /^Take your vitamin\.?$/i)
})

test('buildSupplementReminderCopy - includes real dose and quantity, e.g. "5000 IU · 1 capsule"', () => {
  const copy = buildSupplementReminderCopy(occurrence())
  assert.match(copy.body, /5000 IU/)
  assert.match(copy.body, /1 capsule/)
})

test('buildSupplementReminderCopy - pluralizes the quantity unit when quantity > 1', () => {
  const copy = buildSupplementReminderCopy(occurrence({ name: 'Magnesium', dose: 400, doseUnit: 'mg', quantity: 2, quantityUnit: 'capsule' }))
  assert.match(copy.body, /400 mg/)
  assert.match(copy.body, /2 capsules/)
})

test('buildSupplementReminderCopy - two different supplements produce distinct, independent copy', () => {
  const vitaminD = buildSupplementReminderCopy(occurrence({ name: 'Vitamin D3' }))
  const magnesium = buildSupplementReminderCopy(occurrence({ supplementId: 's2', name: 'Magnesium', dose: 400, doseUnit: 'mg' }))
  assert.notStrictEqual(vitaminD.title, magnesium.title)
  assert.notStrictEqual(vitaminD.body, magnesium.body)
})

test('buildSupplementReminderCopy - falls back gracefully when no dose is tracked (still names the supplement)', () => {
  const copy = buildSupplementReminderCopy(occurrence({ name: 'Custom Herbal Mix', dose: null, doseUnit: null, quantity: 0, quantityUnit: '' }))
  assert.match(copy.body, /Custom Herbal Mix/)
})
