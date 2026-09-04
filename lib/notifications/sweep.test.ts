import test from 'node:test'
import assert from 'node:assert'
import {
  processMealReminderNotification,
  processMilestoneNotifications,
  processSupplementReminderNotification,
  runUsersSweep,
  type ClaimFn,
  type ReleaseFn,
  type SendFn
} from './sweep'
import type { ReminderMeal } from './schedule'
import type { SupplementReminderOccurrence } from './supplementSchedule'

const breakfast: ReminderMeal = {
  id: 'meal-1',
  name: 'Breakfast',
  reminderTime: '08:00',
  reminderEnabled: true,
  status: 'none'
}

// A tiny in-memory fake of the (user_id, local_date, event_key) claim ledger
// - exercises the exact claim/release contract sweep.ts depends on without
// touching Supabase, mirroring notification_events' real unique-constraint
// semantics (a second claim of the same key fails).
function makeFakeLedger() {
  const claimed = new Set<string>()
  const claim: ClaimFn = async eventKey => {
    if (claimed.has(eventKey)) return { claimed: false }
    claimed.add(eventKey)
    return { claimed: true }
  }
  const release: ReleaseFn = async eventKey => {
    claimed.delete(eventKey)
  }
  return { claim, release, claimed }
}

test('processMealReminderNotification - a successful send keeps the claim (marks the event sent)', async () => {
  const { claim, release, claimed } = makeFakeLedger()
  let releaseCalls = 0
  const trackedRelease: ReleaseFn = async key => {
    releaseCalls++
    await release(key)
  }
  const send: SendFn = async () => ({ sent: 1, removed: 0 })

  const outcome = await processMealReminderNotification(
    breakfast,
    () => ({ title: 'Breakfast time', body: 'Eat something' }),
    claim,
    trackedRelease,
    send
  )

  assert.strictEqual(outcome.pushesSent, 1)
  assert.strictEqual(outcome.errors.length, 0)
  assert.strictEqual(releaseCalls, 0, 'a successful delivery must never release its own claim')
  assert.ok(claimed.has('meal_reminder:meal-1'), 'the claim row must remain - the event stays marked sent')
})

test('processMealReminderNotification - a push that throws does NOT permanently mark the event sent, and is released for retry', async () => {
  const { claim, release, claimed } = makeFakeLedger()
  const send: SendFn = async () => {
    throw new Error('web-push endpoint returned 503')
  }

  const outcome = await processMealReminderNotification(
    breakfast,
    () => ({ title: 'Breakfast time', body: 'Eat something' }),
    claim,
    release,
    send
  )

  assert.strictEqual(outcome.pushesSent, 0)
  assert.strictEqual(outcome.errors.length, 1)
  assert.match(outcome.errors[0], /send failed for meal meal-1/)
  assert.ok(!claimed.has('meal_reminder:meal-1'), 'a failed send must release its claim, not leave it permanently marked sent')
})

test('processMealReminderNotification - a send that delivers to zero subscriptions is treated as undelivered and released', async () => {
  const { claim, release, claimed } = makeFakeLedger()
  // No exception thrown, but nothing was actually delivered (e.g. the user
  // has no push subscriptions, or every device's send failed individually
  // and was logged inside sendPushToUser) - result.sent === 0.
  const send: SendFn = async () => ({ sent: 0, removed: 0 })

  const outcome = await processMealReminderNotification(
    breakfast,
    () => ({ title: 'Breakfast time', body: 'Eat something' }),
    claim,
    release,
    send
  )

  assert.strictEqual(outcome.pushesSent, 0)
  assert.ok(!claimed.has('meal_reminder:meal-1'), 'zero actual deliveries must not permanently claim the event')
})

test('processMealReminderNotification - retry works: a released claim can be claimed and delivered successfully on the next tick', async () => {
  const { claim, release, claimed } = makeFakeLedger()
  let attempt = 0
  const send: SendFn = async () => {
    attempt++
    if (attempt === 1) throw new Error('transient failure')
    return { sent: 1, removed: 0 }
  }

  const first = await processMealReminderNotification(breakfast, () => ({ title: 't', body: 'b' }), claim, release, send)
  assert.strictEqual(first.pushesSent, 0)
  assert.ok(!claimed.has('meal_reminder:meal-1'))

  const second = await processMealReminderNotification(breakfast, () => ({ title: 't', body: 'b' }), claim, release, send)
  assert.strictEqual(second.pushesSent, 1)
  assert.ok(claimed.has('meal_reminder:meal-1'), 'the retried, successful attempt must mark the event sent')
})

test('processMealReminderNotification - an already-claimed event (sent earlier today) is not re-sent, and is not treated as an error', async () => {
  const { claim, release } = makeFakeLedger()
  let sendCalls = 0
  const send: SendFn = async () => {
    sendCalls++
    return { sent: 1, removed: 0 }
  }

  await processMealReminderNotification(breakfast, () => ({ title: 't', body: 'b' }), claim, release, send)
  const second = await processMealReminderNotification(breakfast, () => ({ title: 't', body: 'b' }), claim, release, send)

  assert.strictEqual(sendCalls, 1, 'the second attempt must not send again')
  assert.strictEqual(second.errors.length, 0, 'an already-sent event is a normal outcome, not an error')
})

test('processMealReminderNotification - a send result reporting a removed dead subscription is aggregated into the outcome', async () => {
  const { claim, release } = makeFakeLedger()
  const send: SendFn = async () => ({ sent: 0, removed: 1 })

  const outcome = await processMealReminderNotification(breakfast, () => ({ title: 't', body: 'b' }), claim, release, send)

  assert.strictEqual(outcome.subscriptionsRemoved, 1)
})

test('processMilestoneNotifications - a failed send releases every threshold claimed this pass, not just the highest', async () => {
  const { claim, release, claimed } = makeFakeLedger()
  const send: SendFn = async () => {
    throw new Error('push failed')
  }

  await processMilestoneNotifications(75, threshold => ({ title: `${threshold}%`, body: 'nice' }), claim, release, send)

  assert.ok(!claimed.has('milestone:25'))
  assert.ok(!claimed.has('milestone:50'))
  assert.ok(!claimed.has('milestone:75'))
})

test('processMilestoneNotifications - a successful send keeps every claimed threshold but only builds copy for the highest', async () => {
  const { claim, claimed } = makeFakeLedger()
  const release: ReleaseFn = async () => {
    throw new Error('release should never be called on success')
  }
  const builtFor: number[] = []
  const send: SendFn = async () => ({ sent: 1, removed: 0 })

  const outcome = await processMilestoneNotifications(
    60,
    threshold => {
      builtFor.push(threshold)
      return { title: `${threshold}%`, body: 'nice' }
    },
    claim,
    release,
    send
  )

  assert.deepStrictEqual(builtFor, [50], 'only the highest crossed threshold (50, since 60% has not reached 75%) builds copy')
  assert.ok(claimed.has('milestone:25') && claimed.has('milestone:50'))
  assert.strictEqual(outcome.pushesSent, 1)
})

const vitaminD: SupplementReminderOccurrence = {
  supplementId: 'supplement-1',
  name: 'Vitamin D3',
  time: '08:00',
  dose: 5000,
  doseUnit: 'IU',
  quantity: 1,
  quantityUnit: 'capsule'
}

test('processSupplementReminderNotification - a successful send keeps the claim, keyed by supplement id AND time', async () => {
  const { claim, release, claimed } = makeFakeLedger()
  const send: SendFn = async () => ({ sent: 1, removed: 0 })

  const outcome = await processSupplementReminderNotification(
    vitaminD,
    () => ({ title: 'Vitamin D3 reminder', body: 'Take it' }),
    claim,
    release,
    send
  )

  assert.strictEqual(outcome.pushesSent, 1)
  assert.ok(claimed.has('supplement_reminder:supplement-1:08:00'))
})

test('processSupplementReminderNotification - two times for the same supplement claim independent keys', async () => {
  const { claim, release, claimed } = makeFakeLedger()
  const send: SendFn = async () => ({ sent: 1, removed: 0 })
  const evening: SupplementReminderOccurrence = { ...vitaminD, time: '20:00' }

  await processSupplementReminderNotification(vitaminD, () => ({ title: 't', body: 'b' }), claim, release, send)
  await processSupplementReminderNotification(evening, () => ({ title: 't', body: 'b' }), claim, release, send)

  assert.ok(claimed.has('supplement_reminder:supplement-1:08:00'))
  assert.ok(claimed.has('supplement_reminder:supplement-1:20:00'))
})

test('processSupplementReminderNotification - a send that throws releases the claim for retry', async () => {
  const { claim, release, claimed } = makeFakeLedger()
  const send: SendFn = async () => {
    throw new Error('push failed')
  }

  const outcome = await processSupplementReminderNotification(vitaminD, () => ({ title: 't', body: 'b' }), claim, release, send)

  assert.strictEqual(outcome.errors.length, 1)
  assert.ok(!claimed.has('supplement_reminder:supplement-1:08:00'))
})

test('runUsersSweep - one user throwing never aborts processing of the remaining users', async () => {
  const users = [{ userId: 'user-a' }, { userId: 'user-b' }, { userId: 'user-c' }]

  const summary = await runUsersSweep(users, async user => {
    if (user.userId === 'user-a') {
      throw new Error('VAPID configuration exploded for this user somehow')
    }
    return { pushesSent: 1, subscriptionsRemoved: 0, errors: [] }
  })

  assert.strictEqual(summary.usersProcessed, 3, 'every user must still be attempted')
  assert.strictEqual(summary.usersFailed, 1)
  assert.strictEqual(summary.pushesSent, 2, 'user-b and user-c must still have received their push despite user-a failing first')
  assert.strictEqual(summary.userErrors.length, 1)
  assert.strictEqual(summary.userErrors[0].userId, 'user-a')
})

test('runUsersSweep - a user whose outcome carries errors (without throwing) is also recorded as failed, without blocking others', async () => {
  const users = [{ userId: 'user-a' }, { userId: 'user-b' }]

  const summary = await runUsersSweep(users, async user => {
    if (user.userId === 'user-a') {
      return { pushesSent: 0, subscriptionsRemoved: 0, errors: ['claim failed for meal x: db error'] }
    }
    return { pushesSent: 1, subscriptionsRemoved: 0, errors: [] }
  })

  assert.strictEqual(summary.usersProcessed, 2)
  assert.strictEqual(summary.usersFailed, 1)
  assert.strictEqual(summary.pushesSent, 1)
})
