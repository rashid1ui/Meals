import test from 'node:test'
import assert from 'node:assert'
import { localDateTimeInTimeZone } from './timezone'

test('localDateTimeInTimeZone - Africa/Cairo (UTC+2, no DST since 2015)', () => {
  // 2026-01-15 12:00 UTC -> 14:00 in Cairo, same calendar date
  const result = localDateTimeInTimeZone(new Date('2026-01-15T12:00:00Z'), 'Africa/Cairo')
  assert.strictEqual(result.dateString, '2026-01-15')
  assert.strictEqual(result.minutesSinceMidnight, 14 * 60)
})

test('localDateTimeInTimeZone - America/New_York (UTC-5 in January, standard time)', () => {
  // 2026-01-15 12:00 UTC -> 07:00 in New York
  const result = localDateTimeInTimeZone(new Date('2026-01-15T12:00:00Z'), 'America/New_York')
  assert.strictEqual(result.dateString, '2026-01-15')
  assert.strictEqual(result.minutesSinceMidnight, 7 * 60)
})

test('localDateTimeInTimeZone - America/New_York (UTC-4 in July, daylight time) - DST-aware without any manual offset table', () => {
  // 2026-07-15 12:00 UTC -> 08:00 in New York (DST shifts the offset by an hour vs January)
  const result = localDateTimeInTimeZone(new Date('2026-07-15T12:00:00Z'), 'America/New_York')
  assert.strictEqual(result.dateString, '2026-07-15')
  assert.strictEqual(result.minutesSinceMidnight, 8 * 60)
})

test('localDateTimeInTimeZone - crosses a date boundary (late UTC evening is already tomorrow in Cairo)', () => {
  // 2026-01-15 23:30 UTC -> 2026-01-16 01:30 in Cairo (UTC+2)
  const result = localDateTimeInTimeZone(new Date('2026-01-15T23:30:00Z'), 'Africa/Cairo')
  assert.strictEqual(result.dateString, '2026-01-16')
  assert.strictEqual(result.minutesSinceMidnight, 1 * 60 + 30)
})

test('localDateTimeInTimeZone - crosses a date boundary the other direction (early UTC morning is still yesterday in US Pacific)', () => {
  // 2026-01-15 03:00 UTC -> 2026-01-14 19:00 in Los Angeles (UTC-8 in January)
  const result = localDateTimeInTimeZone(new Date('2026-01-15T03:00:00Z'), 'America/Los_Angeles')
  assert.strictEqual(result.dateString, '2026-01-14')
  assert.strictEqual(result.minutesSinceMidnight, 19 * 60)
})

test('localDateTimeInTimeZone - null timezone falls back to UTC rather than throwing or guessing', () => {
  const result = localDateTimeInTimeZone(new Date('2026-01-15T09:15:00Z'), null)
  assert.strictEqual(result.dateString, '2026-01-15')
  assert.strictEqual(result.minutesSinceMidnight, 9 * 60 + 15)
})

test('localDateTimeInTimeZone - an invalid/garbage timezone string falls back to UTC instead of throwing', () => {
  const result = localDateTimeInTimeZone(new Date('2026-01-15T09:15:00Z'), 'Not/A_Real_Zone')
  assert.strictEqual(result.dateString, '2026-01-15')
  assert.strictEqual(result.minutesSinceMidnight, 9 * 60 + 15)
})
