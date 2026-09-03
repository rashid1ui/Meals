import test from 'node:test'
import assert from 'node:assert'
import {
  claimAndDisplayMealReminder,
  claimNewMilestones,
  highestMilestone,
  type ClientClaimFn
} from './clientSweep'

// In-memory fake of the (user_id, local_date, event_key) claim ledger -
// mirrors notification_events' real unique-constraint semantics (a second
// claim of the same key comes back { claimed: false }), matching
// sweep.test.ts's makeFakeLedger for the cron side.
function makeFakeLedger() {
  const claimed = new Set<string>()
  const claim: ClientClaimFn = async eventKey => {
    if (claimed.has(eventKey)) return { claimed: false }
    claimed.add(eventKey)
    return { claimed: true }
  }
  return { claim, claimed }
}

test('claimAndDisplayMealReminder - a fresh claim displays exactly once and is marked resolved', async () => {
  const { claim, claimed } = makeFakeLedger()
  const shown: string[] = []

  const result = await claimAndDisplayMealReminder(
    { id: 'meal-1' },
    () => ({ title: 'Breakfast time', body: 'Eat something' }),
    claim,
    copy => shown.push(copy.title)
  )

  assert.deepStrictEqual(shown, ['Breakfast time'])
  assert.strictEqual(result.resolved, true)
  assert.strictEqual(result.eventKey, 'meal_reminder:meal-1')
  assert.ok(claimed.has('meal_reminder:meal-1'))
})

test('claimAndDisplayMealReminder - an already-sent event does NOT display again but is still resolved', async () => {
  const { claim } = makeFakeLedger()
  const shown: string[] = []
  const build = () => ({ title: 't', body: 'b' })
  const display = (c: { title: string }) => shown.push(c.title)

  await claimAndDisplayMealReminder({ id: 'meal-1' }, build, claim, display)
  const second = await claimAndDisplayMealReminder({ id: 'meal-1' }, build, claim, display)

  assert.strictEqual(shown.length, 1, 'the second pass must not display a duplicate')
  assert.strictEqual(second.resolved, true, 'an already-sent event is resolved, not retried forever')
})

test('claimAndDisplayMealReminder - a transient claim error does not display and is left unresolved for retry', async () => {
  const claim: ClientClaimFn = async () => ({ error: 'network blip' })
  const shown: string[] = []

  const result = await claimAndDisplayMealReminder(
    { id: 'meal-1' },
    () => ({ title: 't', body: 'b' }),
    claim,
    c => shown.push(c.title)
  )

  assert.strictEqual(shown.length, 0)
  assert.strictEqual(result.resolved, false, 'a failed claim must be retried on the next tick, not cached as done')
})

test('claimAndDisplayMealReminder - REGRESSION: a claim that succeeds always displays, even if the caller is torn down mid-claim', async () => {
  // Reproduces the real bug: useMealReminders wrote the durable claim row and
  // then bailed on `if (cancelled) return` before calling new Notification(),
  // permanently suppressing that reminder for the day on every surface
  // (including the cron Web Push, which then saw the key as already claimed).
  // The fake here flips the caller's "cancelled" flag as a side effect of the
  // claim resolving - the display must still happen because ordering now
  // lives inside this function, not in the caller.
  const { claimed } = makeFakeLedger()
  let cancelled = false
  const claim: ClientClaimFn = async eventKey => {
    cancelled = true // caller effect torn down while the claim was in flight
    claimed.add(eventKey)
    return { claimed: true }
  }
  const shown: string[] = []

  const result = await claimAndDisplayMealReminder(
    { id: 'meal-1' },
    () => ({ title: 'Lunch time', body: 'Eat' }),
    claim,
    copy => shown.push(copy.title)
  )

  assert.strictEqual(cancelled, true, 'sanity: the caller was cancelled during the claim')
  assert.deepStrictEqual(shown, ['Lunch time'], 'a successfully claimed reminder must still be displayed')
  assert.strictEqual(result.resolved, true)
})

test('claimNewMilestones - claims every threshold up to currentPct and reports them for a single highest notification', async () => {
  const { claim, claimed } = makeFakeLedger()

  const { resolvedKeys, newlyClaimed } = await claimNewMilestones(60, () => false, claim)

  assert.deepStrictEqual(newlyClaimed, [25, 50], '60% has crossed 25 and 50 but not 75')
  assert.deepStrictEqual(resolvedKeys, ['milestone:25', 'milestone:50'])
  assert.ok(claimed.has('milestone:25') && claimed.has('milestone:50'))
  assert.strictEqual(highestMilestone(newlyClaimed), 50, 'only the highest is notified about')
})

test('claimNewMilestones - keys already in the session cache are skipped without re-hitting the ledger', async () => {
  const { claim } = makeFakeLedger()
  let claimCalls = 0
  const countingClaim: ClientClaimFn = (key, type) => {
    claimCalls++
    return claim(key, type)
  }

  const { resolvedKeys, newlyClaimed } = await claimNewMilestones(
    100,
    key => key === 'milestone:25' || key === 'milestone:50',
    countingClaim
  )

  assert.strictEqual(claimCalls, 3, 'only 75, 90, 100 should reach the ledger')
  assert.deepStrictEqual(newlyClaimed, [75, 90, 100])
  assert.ok(!resolvedKeys.includes('milestone:25'))
})

test('claimNewMilestones - a transient error on one threshold does not block the others and leaves that key unresolved', async () => {
  const claim: ClientClaimFn = async eventKey => {
    if (eventKey === 'milestone:50') return { error: 'db timeout' }
    return { claimed: true }
  }

  const { resolvedKeys, newlyClaimed } = await claimNewMilestones(75, () => false, claim)

  assert.deepStrictEqual(newlyClaimed, [25, 75], '50 failed transiently, 25 and 75 still went through')
  assert.ok(!resolvedKeys.includes('milestone:50'), '50 stays unresolved so the next tick retries it')
})

test('claimNewMilestones - nothing to claim below the first threshold', async () => {
  const { claim } = makeFakeLedger()
  const { resolvedKeys, newlyClaimed } = await claimNewMilestones(10, () => false, claim)
  assert.deepStrictEqual(newlyClaimed, [])
  assert.deepStrictEqual(resolvedKeys, [])
  assert.strictEqual(highestMilestone(newlyClaimed), null)
})

test('highestMilestone - returns the max threshold, or null for an empty pass', () => {
  assert.strictEqual(highestMilestone([25, 90, 50]), 90)
  assert.strictEqual(highestMilestone([100]), 100)
  assert.strictEqual(highestMilestone([]), null)
})
