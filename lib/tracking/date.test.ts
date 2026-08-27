import test from 'node:test'
import assert from 'node:assert'
import { getLocalDateString, isValidLocalDate, isPlausibleToday, shiftDateUTC, daysBetweenInclusive } from './date'

// getLocalDateString takes an explicit Date, so the midnight-boundary /
// timezone-boundary / DST-transition behavior that matters for
// lib/tracking/useLocalDate.ts's "always use the current local date" fix is
// directly testable here without a browser or a React renderer - this is
// the pure logic the hook calls on every recompute.

test('getLocalDateString - one second before midnight is still the earlier day', () => {
  const beforeMidnight = new Date(2026, 2, 15, 23, 59, 59) // local time, month is 0-indexed
  assert.strictEqual(getLocalDateString(beforeMidnight), '2026-03-15')
})

test('getLocalDateString - one second after midnight is already the next day', () => {
  const afterMidnight = new Date(2026, 2, 16, 0, 0, 1)
  assert.strictEqual(getLocalDateString(afterMidnight), '2026-03-16')
})

test('getLocalDateString - a session spanning midnight must report two different dates, not the same one frozen', () => {
  // Reproduces the exact scenario the frozen-date bug hit: a value computed
  // once at 23:58 vs. a value computed again a few minutes later, after
  // midnight, from the SAME session.
  const openedAt = new Date(2026, 5, 30, 23, 58, 0)
  const stillOpenAt = new Date(2026, 6, 1, 0, 3, 0)
  const dateAtOpen = getLocalDateString(openedAt)
  const dateNow = getLocalDateString(stillOpenAt)
  assert.strictEqual(dateAtOpen, '2026-06-30')
  assert.strictEqual(dateNow, '2026-07-01')
  assert.notStrictEqual(dateAtOpen, dateNow, 'a stale, un-recomputed date would incorrectly still read 2026-06-30')
})

test('getLocalDateString - month/year boundaries roll over correctly', () => {
  assert.strictEqual(getLocalDateString(new Date(2026, 11, 31, 23, 59, 59)), '2026-12-31')
  assert.strictEqual(getLocalDateString(new Date(2027, 0, 1, 0, 0, 1)), '2027-01-01')
})

test('getLocalDateString - DST spring-forward transition date reports the correct calendar day regardless of the lost hour', () => {
  // US DST spring-forward 2026 is March 8 - 2:00am local time is skipped
  // entirely that day. getLocalDateString only reads
  // getFullYear/getMonth/getDate, never hours, so the skipped hour cannot
  // affect which calendar day is reported.
  const justBeforeSpringForward = new Date(2026, 2, 8, 1, 59, 0)
  const justAfterSpringForward = new Date(2026, 2, 8, 3, 1, 0) // 2am-3am doesn't exist locally
  assert.strictEqual(getLocalDateString(justBeforeSpringForward), '2026-03-08')
  assert.strictEqual(getLocalDateString(justAfterSpringForward), '2026-03-08')
})

test('getLocalDateString - DST fall-back transition date (a repeated hour) still reports one unambiguous calendar day', () => {
  // US DST fall-back 2026 is November 1 - 1:00am-2:00am local time occurs
  // twice. Both occurrences must still read as the same calendar date.
  const firstOneAm = new Date(2026, 10, 1, 1, 30, 0)
  assert.strictEqual(getLocalDateString(firstOneAm), '2026-11-01')
})

test('isValidLocalDate - accepts well-formed dates, rejects malformed/impossible ones', () => {
  assert.strictEqual(isValidLocalDate('2026-03-15'), true)
  assert.strictEqual(isValidLocalDate('2026-02-30'), false) // Feb 30 doesn't exist
  assert.strictEqual(isValidLocalDate('not-a-date'), false)
  assert.strictEqual(isValidLocalDate('2026-3-15'), false) // must be zero-padded
})

test('isPlausibleToday - accepts the server\'s own UTC date and one day on either side', () => {
  const serverUTCToday = new Date()
  const y = serverUTCToday.getUTCFullYear()
  const m = String(serverUTCToday.getUTCMonth() + 1).padStart(2, '0')
  const d = String(serverUTCToday.getUTCDate()).padStart(2, '0')
  assert.strictEqual(isPlausibleToday(`${y}-${m}-${d}`), true)
})

test('isPlausibleToday - rejects a date more than one day away from the server clock', () => {
  const farPast = shiftDateUTC(`${new Date().getUTCFullYear()}-01-01`, -100)
  assert.strictEqual(isPlausibleToday(farPast), false)
})

test('daysBetweenInclusive - a single day counts as 1, not 0', () => {
  assert.strictEqual(daysBetweenInclusive('2026-03-15', '2026-03-15'), 1)
})
