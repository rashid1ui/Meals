// Pure orchestration for the notification cron sweep - no Supabase, no
// 'server-only', no web-push. Takes already-fetched decision inputs plus
// injected claim/release/send effects and returns exactly what happened.
// Split out of app/api/cron/notifications/route.ts so the "claim before
// send, release the claim if nothing was actually delivered, one failure
// never blocks the rest" behavior is unit-testable with plain fake
// functions - no live Supabase client, no live web-push send - matching the
// existing pure/wrapper split (lib/diet/save-plan.ts, lib/tracking/logic.ts,
// lib/notifications/schedule.ts).

import { buildMealReminderEventKey, type ReminderMeal } from './schedule'
import { thresholdsToClaim, buildMilestoneEventKey, type MilestoneThreshold } from './milestones'

export type NotificationEventType = 'meal_reminder' | 'milestone'

export interface SendResult {
  sent: number
  removed: number
}

export interface NotificationCopy {
  title: string
  body: string
}

export type ClaimFn = (
  eventKey: string,
  eventType: NotificationEventType
) => Promise<{ claimed: boolean } | { error: string }>

// Only ever called after a claim turned out to be undeliverable (the send
// threw, or reached zero subscriptions) - never after a successful send.
export type ReleaseFn = (eventKey: string) => Promise<void>

export type SendFn = (payload: NotificationCopy & { url?: string; tag?: string }) => Promise<SendResult>

export interface SweepOutcome {
  pushesSent: number
  subscriptionsRemoved: number
  errors: string[]
}

export function emptyOutcome(): SweepOutcome {
  return { pushesSent: 0, subscriptionsRemoved: 0, errors: [] }
}

export function mergeOutcome(target: SweepOutcome, source: SweepOutcome): void {
  target.pushesSent += source.pushesSent
  target.subscriptionsRemoved += source.subscriptionsRemoved
  target.errors.push(...source.errors)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// One due meal reminder: claim -> build copy -> send -> only keep the claim
// if at least one device actually received it. A thrown send, or a send
// that delivered to zero subscriptions, releases the claim so the same
// reminder is retried on a later tick instead of being permanently marked
// sent with nothing ever delivered. Never throws - every failure mode is
// captured in the returned outcome's `errors`, so a caller looping over
// several due meals for one user can always move on to the next one.
export async function processMealReminderNotification(
  meal: ReminderMeal,
  buildCopy: () => NotificationCopy,
  claim: ClaimFn,
  release: ReleaseFn,
  send: SendFn
): Promise<SweepOutcome> {
  const outcome = emptyOutcome()
  const key = buildMealReminderEventKey(meal.id)

  const claimResult = await claim(key, 'meal_reminder')
  if ('error' in claimResult) {
    outcome.errors.push(`claim failed for meal ${meal.id}: ${claimResult.error}`)
    return outcome
  }
  if (!claimResult.claimed) return outcome // already sent earlier today - normal, not an error

  const copy = buildCopy()

  let result: SendResult
  try {
    result = await send({ title: copy.title, body: copy.body, url: '/dashboard', tag: key })
  } catch (err) {
    await release(key)
    outcome.errors.push(`send failed for meal ${meal.id}: ${errorMessage(err)}`)
    return outcome
  }

  outcome.pushesSent += result.sent
  outcome.subscriptionsRemoved += result.removed

  if (result.sent === 0) {
    // Nothing was actually delivered (no subscriptions, or every device's
    // send failed) - release so it's retried on a later tick.
    await release(key)
  }

  return outcome
}

// Milestone thresholds newly crossed today: every threshold up to and
// including the current percentage is claimed (so none of the skipped-over
// lower ones can fire later on their own), but only one push is sent, for
// the highest. If nothing is actually delivered, every threshold claimed
// this pass is released so they can be re-evaluated (and correctly
// re-collapse to whatever the current highest is by then) on a later tick.
export async function processMilestoneNotifications(
  currentPct: number,
  buildCopy: (threshold: MilestoneThreshold) => NotificationCopy,
  claim: ClaimFn,
  release: ReleaseFn,
  send: SendFn
): Promise<SweepOutcome> {
  const outcome = emptyOutcome()
  const toClaim = thresholdsToClaim(currentPct, [])
  const claimed: { threshold: MilestoneThreshold; key: string }[] = []

  for (const threshold of toClaim) {
    const key = buildMilestoneEventKey(threshold)
    const claimResult = await claim(key, 'milestone')
    if ('error' in claimResult) {
      outcome.errors.push(`milestone claim ${threshold} failed: ${claimResult.error}`)
      continue
    }
    if (claimResult.claimed) claimed.push({ threshold, key })
  }

  if (claimed.length === 0) return outcome

  const highest = claimed.reduce((a, b) => (b.threshold > a.threshold ? b : a))
  const copy = buildCopy(highest.threshold)

  let result: SendResult
  try {
    result = await send({ title: copy.title, body: copy.body })
  } catch (err) {
    await Promise.all(claimed.map(c => release(c.key)))
    outcome.errors.push(`milestone send failed: ${errorMessage(err)}`)
    return outcome
  }

  outcome.pushesSent += result.sent
  outcome.subscriptionsRemoved += result.removed

  if (result.sent === 0) {
    await Promise.all(claimed.map(c => release(c.key)))
  }

  return outcome
}

export interface UserSweepSummary {
  usersProcessed: number
  usersFailed: number
  pushesSent: number
  subscriptionsRemoved: number
  userErrors: { userId: string; error: string }[]
}

// Runs processUser for every user, isolating each user's failures from the
// rest: a thrown exception (or an outcome carrying errors) from one user is
// recorded and the loop moves on, so one bad user/config can never abort
// delivery to everyone after them in iteration order - the exact production
// incident this replaces (a single thrown VAPID error previously zeroed out
// the whole sweep for every remaining user on that tick).
export async function runUsersSweep<U extends { userId: string }>(
  users: U[],
  processUser: (user: U) => Promise<SweepOutcome>
): Promise<UserSweepSummary> {
  const summary: UserSweepSummary = {
    usersProcessed: 0,
    usersFailed: 0,
    pushesSent: 0,
    subscriptionsRemoved: 0,
    userErrors: []
  }

  for (const user of users) {
    summary.usersProcessed++
    try {
      const outcome = await processUser(user)
      summary.pushesSent += outcome.pushesSent
      summary.subscriptionsRemoved += outcome.subscriptionsRemoved
      if (outcome.errors.length > 0) {
        summary.usersFailed++
        summary.userErrors.push({ userId: user.userId, error: outcome.errors.join('; ') })
      }
    } catch (err) {
      summary.usersFailed++
      summary.userErrors.push({ userId: user.userId, error: errorMessage(err) })
    }
  }

  return summary
}
