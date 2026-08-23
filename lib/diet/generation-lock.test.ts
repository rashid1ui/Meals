import test from 'node:test'
import assert from 'node:assert'
import { isLockStale, GENERATION_LOCK_TTL_MS } from './generation-lock'

test('isLockStale: no lock timestamp is always stale (never acquired)', () => {
  assert.strictEqual(isLockStale(null, Date.now()), true)
  assert.strictEqual(isLockStale(undefined, Date.now()), true)
})

test('isLockStale: unparseable timestamp is treated as stale, not a permanent lock', () => {
  assert.strictEqual(isLockStale('not-a-date', Date.now()), true)
})

test('isLockStale: a lock acquired moments ago is NOT stale', () => {
  const now = Date.now()
  const lockAt = new Date(now - 1000).toISOString()
  assert.strictEqual(isLockStale(lockAt, now), false)
})

test('isLockStale: a lock still well within the AI generation window is NOT stale', () => {
  const now = Date.now()
  const lockAt = new Date(now - 40_000).toISOString() // AI budget is 50s
  assert.strictEqual(isLockStale(lockAt, now), false)
})

test('isLockStale: a lock older than the TTL IS stale (recovers a crashed request)', () => {
  const now = Date.now()
  const lockAt = new Date(now - (GENERATION_LOCK_TTL_MS + 1)).toISOString()
  assert.strictEqual(isLockStale(lockAt, now), true)
})

test('isLockStale: exactly at the TTL boundary is not yet stale', () => {
  const now = Date.now()
  const lockAt = new Date(now - GENERATION_LOCK_TTL_MS).toISOString()
  assert.strictEqual(isLockStale(lockAt, now), false)
})
