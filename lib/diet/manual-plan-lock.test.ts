import test from 'node:test'
import assert from 'node:assert'
import { isManualPlanLockStale, MANUAL_PLAN_LOCK_TTL_MS } from './manual-plan-lock'

// Mirrors generation-lock.test.ts's own test shape - same staleness rule,
// against a deliberately separate lock/TTL (see manual-plan-lock.ts's own
// comment on why this is NOT a reuse of the AI generation lock).

test('isManualPlanLockStale: no lock timestamp is always stale (never acquired)', () => {
  assert.strictEqual(isManualPlanLockStale(null, Date.now()), true)
  assert.strictEqual(isManualPlanLockStale(undefined, Date.now()), true)
})

test('isManualPlanLockStale: unparseable timestamp is treated as stale, not a permanent lock', () => {
  assert.strictEqual(isManualPlanLockStale('not-a-date', Date.now()), true)
})

test('isManualPlanLockStale: a lock acquired moments ago is NOT stale - a rapid double-click must be rejected', () => {
  const now = Date.now()
  const lockAt = new Date(now - 500).toISOString()
  assert.strictEqual(isManualPlanLockStale(lockAt, now), false)
})

test('isManualPlanLockStale: a lock older than the TTL IS stale (recovers a crashed/killed request)', () => {
  const now = Date.now()
  const lockAt = new Date(now - (MANUAL_PLAN_LOCK_TTL_MS + 1)).toISOString()
  assert.strictEqual(isManualPlanLockStale(lockAt, now), true)
})

test('isManualPlanLockStale: exactly at the TTL boundary is not yet stale', () => {
  const now = Date.now()
  const lockAt = new Date(now - MANUAL_PLAN_LOCK_TTL_MS).toISOString()
  assert.strictEqual(isManualPlanLockStale(lockAt, now), false)
})

test('isManualPlanLockStale: the manual-plan TTL is deliberately much shorter than a typical AI generation window (20s, not 90s) - it is not the AI lock reused', () => {
  assert.ok(MANUAL_PLAN_LOCK_TTL_MS < 30_000, 'manual plan creation is fast, deterministic DB writes - it should never need a long-running lock')
})
