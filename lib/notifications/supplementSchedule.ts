// Pure, framework-free supplement-reminder scheduling logic - no Supabase,
// no 'use client'/'use server'. Deliberately reuses isMealReminderDue from
// ./schedule (the same "due within a short catch-up window, not all day"
// rule that already prevents a burst of stale meal reminders) rather than
// reimplementing it, per the project's "do not duplicate notification logic
// unnecessarily" rule - the only genuinely new logic here is (a) a
// supplement having MULTIPLE times instead of one, and (b) an active date
// range (start_date/end_date) meals don't have.

import { isMealReminderDue } from './schedule'

export function buildSupplementReminderEventKey(supplementId: string, time: string): string {
  return `supplement_reminder:${supplementId}:${time}`
}

export interface ReminderSupplement {
  id: string
  name: string
  dose: number | null
  doseUnit: string | null
  quantity: number
  quantityUnit: string
  times: string[]
  notificationEnabled: boolean
  startDate: string // "YYYY-MM-DD"
  endDate: string | null // "YYYY-MM-DD", null = ongoing
}

// String comparison is safe and correct for "YYYY-MM-DD" dates - lexical
// order matches chronological order for this fixed-width, zero-padded
// format, exactly like lib/tracking/date.ts's own date-string handling.
export function isSupplementActiveOn(supplement: Pick<ReminderSupplement, 'startDate' | 'endDate'>, dateStr: string): boolean {
  if (dateStr < supplement.startDate) return false
  if (supplement.endDate !== null && dateStr > supplement.endDate) return false
  return true
}

export interface SupplementReminderOccurrence {
  supplementId: string
  name: string
  time: string
  dose: number | null
  doseUnit: string | null
  quantity: number
  quantityUnit: string
}

// Which (supplement, time) pairs are due right now - one supplement with
// multiple times can produce multiple occurrences today (e.g. Magnesium at
// 08:00 AND 20:00 - spec section 11). Does not itself dedup (see
// lib/notifications/actions.ts's claimNotificationEvent, keyed per
// occurrence via buildSupplementReminderEventKey) - calling this repeatedly
// for an already-fired occurrence is expected and safe.
export function dueSupplementReminders(
  supplements: ReminderSupplement[],
  nowMinutes: number,
  todayDateStr: string
): SupplementReminderOccurrence[] {
  const occurrences: SupplementReminderOccurrence[] = []
  for (const supplement of supplements) {
    if (!supplement.notificationEnabled) continue
    if (!isSupplementActiveOn(supplement, todayDateStr)) continue
    for (const time of supplement.times) {
      if (isMealReminderDue(time, nowMinutes)) {
        occurrences.push({
          supplementId: supplement.id,
          name: supplement.name,
          time,
          dose: supplement.dose,
          doseUnit: supplement.doseUnit,
          quantity: supplement.quantity,
          quantityUnit: supplement.quantityUnit
        })
      }
    }
  }
  return occurrences
}
