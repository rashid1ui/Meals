// Pure, framework-free per-key sequencing for the in-tab (Phase 1) delivery
// path - no React, no Supabase, no browser APIs. The client counterpart to
// sweep.ts (which does the same for the Phase 2 cron): the "claim the shared
// durable notification_events row, then display it" ordering lives here so
// it is unit-testable with plain fakes, and - critically - so a claim that
// SUCCEEDS can never be left recorded with nothing displayed.
//
// Why that matters: both delivery paths (this in-tab one and the cron Web
// Push one) dedup against the same (user_id, local_date, event_key) row. If
// the client writes the claim row but then skips the display - because the
// React effect was torn down mid-await (a tracking update re-runs it on
// every logged food), or permission was revoked mid-session - that
// notification is silently lost for the whole day on EVERY surface,
// including the cron push, which will now see the key as already claimed.
// Keeping claim+display together in one pure function removes every code
// path where they can come apart. useMealReminders.ts is the thin wrapper
// that injects the real claim (a server action) and display (Notification).

import { buildMealReminderEventKey, type ReminderMeal } from './schedule'
import { thresholdsToClaim, buildMilestoneEventKey, type MilestoneThreshold } from './milestones'

export type NotificationEventType = 'meal_reminder' | 'milestone'

export type ClientClaimFn = (
  eventKey: string,
  eventType: NotificationEventType
) => Promise<{ claimed: boolean } | { error: string }>

export interface ClientCopy {
  title: string
  body: string
}

export type ClientDisplayFn = (copy: ClientCopy) => void

export interface MealClaimResult {
  eventKey: string
  // true once the server has given a definitive answer for this key (freshly
  // claimed OR already-sent) - the caller adds it to its per-session cache so
  // it stops re-asking. A transient error leaves this false so the next tick
  // retries the same key.
  resolved: boolean
}

// Claim one due meal reminder and, ONLY if this call is the one that created
// the claim row, display it. The display happens synchronously right after
// the claim resolves and before this function returns - a caller that has
// since been cancelled (component unmounted / effect re-run) still cannot
// leave a fresh claim undisplayed, because it no longer controls the
// ordering.
export async function claimAndDisplayMealReminder(
  meal: Pick<ReminderMeal, 'id'>,
  buildCopy: () => ClientCopy,
  claim: ClientClaimFn,
  display: ClientDisplayFn
): Promise<MealClaimResult> {
  const eventKey = buildMealReminderEventKey(meal.id)
  const result = await claim(eventKey, 'meal_reminder')
  if ('error' in result) return { eventKey, resolved: false }
  if (result.claimed) display(buildCopy())
  return { eventKey, resolved: true }
}

export interface MilestoneClaimResult {
  // Every key that got a definitive server answer this pass (claimed or
  // already-sent) - the caller marks all of these resolved in its cache.
  resolvedKeys: string[]
  // Thresholds this pass was the first to claim - the caller displays ONE
  // notification, for the highest of these.
  newlyClaimed: MilestoneThreshold[]
}

// Claim every milestone threshold at or under currentPct that is not already
// in the caller's session cache, and report which were freshly claimed this
// pass. Mirrors the cron's processMilestoneNotifications rule: claim all
// skipped-over thresholds (so none can fire later on their own) but notify
// only about the single highest one reached.
export async function claimNewMilestones(
  currentPct: number,
  isResolved: (eventKey: string) => boolean,
  claim: ClientClaimFn
): Promise<MilestoneClaimResult> {
  const resolvedKeys: string[] = []
  const newlyClaimed: MilestoneThreshold[] = []

  for (const threshold of thresholdsToClaim(currentPct, [])) {
    const eventKey = buildMilestoneEventKey(threshold)
    if (isResolved(eventKey)) continue

    const result = await claim(eventKey, 'milestone')
    if ('error' in result) continue // transient - retry this key next tick

    resolvedKeys.push(eventKey)
    if (result.claimed) newlyClaimed.push(threshold)
  }

  return { resolvedKeys, newlyClaimed }
}

export function highestMilestone(thresholds: readonly MilestoneThreshold[]): MilestoneThreshold | null {
  return thresholds.length === 0 ? null : thresholds.reduce((a, b) => (b > a ? b : a))
}
