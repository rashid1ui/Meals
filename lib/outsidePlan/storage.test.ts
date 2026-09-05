import test from 'node:test'
import assert from 'node:assert'
import { buildFoodScanStoragePath, isPastRetentionWindow } from './storage'
import { FOOD_SCAN_OUTPUT_EXTENSION, FOOD_SCAN_RETENTION_DAYS } from './constants'

test('buildFoodScanStoragePath puts the object under the owning user\'s own folder', () => {
  const userId = '11111111-1111-1111-1111-111111111111'
  const path = buildFoodScanStoragePath(userId)
  assert.ok(path.startsWith(`${userId}/`), 'path must start with the user id as the folder prefix (what the storage.objects RLS policy checks)')
})

test('buildFoodScanStoragePath always uses the fixed output extension and a fresh UUID each call', () => {
  const userId = '22222222-2222-2222-2222-222222222222'
  const a = buildFoodScanStoragePath(userId)
  const b = buildFoodScanStoragePath(userId)
  assert.notStrictEqual(a, b, 'two calls must never collide on the same object key')
  assert.ok(a.endsWith(`.${FOOD_SCAN_OUTPUT_EXTENSION}`))
  assert.ok(b.endsWith(`.${FOOD_SCAN_OUTPUT_EXTENSION}`))
})

test('a different user\'s id never appears in another user\'s generated path', () => {
  const userA = '33333333-3333-3333-3333-333333333333'
  const userB = '44444444-4444-4444-4444-444444444444'
  const pathA = buildFoodScanStoragePath(userA)
  assert.ok(!pathA.startsWith(`${userB}/`))
})

test('isPastRetentionWindow is false for a photo created today', () => {
  const now = new Date('2026-06-15T12:00:00Z')
  const createdToday = new Date('2026-06-15T08:00:00Z')
  assert.strictEqual(isPastRetentionWindow(createdToday, now), false)
})

test(`isPastRetentionWindow is false one day before the ${FOOD_SCAN_RETENTION_DAYS}-day window closes`, () => {
  const now = new Date('2026-06-15T12:00:00Z')
  const almostExpired = new Date(now.getTime() - (FOOD_SCAN_RETENTION_DAYS - 1) * 24 * 60 * 60 * 1000)
  assert.strictEqual(isPastRetentionWindow(almostExpired, now), false)
})

test(`isPastRetentionWindow is true exactly at the ${FOOD_SCAN_RETENTION_DAYS}-day boundary`, () => {
  const now = new Date('2026-06-15T12:00:00Z')
  const exactlyAtBoundary = new Date(now.getTime() - FOOD_SCAN_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  assert.strictEqual(isPastRetentionWindow(exactlyAtBoundary, now), true)
})

test('isPastRetentionWindow is true well past the retention window', () => {
  const now = new Date('2026-06-15T12:00:00Z')
  const longExpired = new Date(now.getTime() - (FOOD_SCAN_RETENTION_DAYS + 30) * 24 * 60 * 60 * 1000)
  assert.strictEqual(isPastRetentionWindow(longExpired, now), true)
})
