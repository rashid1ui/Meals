// Pure daily supplement-dose-tracking logic - no Supabase, no 'use
// client'/'use server'. Mirrors lib/tracking/logic.ts's split for food
// tracking (buildFoodTrackingRow, computeFoodStatus, etc.) for this
// separate tracking domain: lib/supplements/trackingActions.ts is the thin
// DB-touching wrapper around everything here.

import { isSupplementActiveOn } from '@/lib/notifications/supplementSchedule'

export interface TrackableSupplement {
  id: string
  times: string[]
  startDate: string
  endDate: string | null
}

export interface ExpectedDose {
  userSupplementId: string
  scheduledTime: string
}

// Every dose expected TODAY, across every active supplement.
// notification_enabled is deliberately NOT a parameter here - spec section
// 15: reminders and completion tracking are independent concerns. Turning a
// supplement's reminder off must never remove it from today's target, so
// this only ever considers the active date range (start_date/end_date),
// never the notification flag. One entry per (supplement, time) pair - a
// supplement with two scheduled times contributes two independent expected
// doses, never collapsed into one (spec section 8).
export function buildExpectedDoses(supplements: TrackableSupplement[], todayDateStr: string): ExpectedDose[] {
  const doses: ExpectedDose[] = []
  for (const supplement of supplements) {
    if (!isSupplementActiveOn(supplement, todayDateStr)) continue
    for (const time of supplement.times) {
      doses.push({ userSupplementId: supplement.id, scheduledTime: time })
    }
  }
  return doses
}

export interface SupplementProgressTotals {
  completed: number
  total: number
  percentage: number
}

// The single, authoritative "how much of today's supplements is done"
// calculation - based on actual per-dose completion, never on how many
// supplement records exist or how many have reminders enabled. Zero
// scheduled doses is 0%, never a divide-by-zero/NaN.
export function computeSupplementProgress(doses: { completed: boolean }[]): SupplementProgressTotals {
  const total = doses.length
  const completed = doses.filter(d => d.completed).length
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100)
  return { completed, total, percentage }
}

export interface SupplementTrackingRow {
  user_id: string
  user_supplement_id: string
  tracking_date: string
  scheduled_time: string
  completed: boolean
  completed_at: string | null
  updated_at: string
}

export interface SupplementTrackingRowInput {
  userId: string
  userSupplementId: string
  trackingDate: string
  scheduledTime: string
  completed: boolean
}

// Builds one supplement_tracking row - completed_at is always derived from
// `completed`, never passed independently, so the two can never disagree
// (enforced again server-side by the table's own CHECK constraint).
// Injectable `now` mirrors buildFoodTrackingRow's own pattern, for
// deterministic tests.
export function buildSupplementTrackingRow(
  input: SupplementTrackingRowInput,
  now: () => string = () => new Date().toISOString()
): SupplementTrackingRow {
  const timestamp = now()
  return {
    user_id: input.userId,
    user_supplement_id: input.userSupplementId,
    tracking_date: input.trackingDate,
    scheduled_time: input.scheduledTime,
    completed: input.completed,
    completed_at: input.completed ? timestamp : null,
    updated_at: timestamp
  }
}
