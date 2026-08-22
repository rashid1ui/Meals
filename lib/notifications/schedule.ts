// Pure, framework-free meal-reminder scheduling logic - no Supabase, no
// 'use client'/'use server'. Mirrors lib/tracking/logic.ts's split: this
// module is unit-testable in isolation, and lib/notifications/actions.ts is
// the thin DB-touching wrapper around it. Deliberately importable from
// either a client hook (Phase 1) or a future server-side dispatcher (Phase
// 2) - nothing here assumes a browser.

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidReminderTime(value: string): boolean {
  return TIME_REGEX.test(value)
}

export function timeToMinutes(value: string): number {
  const match = TIME_REGEX.exec(value)
  if (!match) throw new Error(`Invalid reminder time: ${value}`)
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10)
}

export function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)))
  const hours = Math.floor(clamped / 60)
  const minutes = clamped % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

// A meal reminder is "due" once local wall-clock time has reached its
// scheduled time - staying true for the rest of the day is what gives a
// late-opened app its one reasonable catch-up notification (dedup, not this
// function, is what stops that from becoming a repeat - see
// lib/notifications/actions.ts's claimNotificationEvent).
export function isMealReminderDue(reminderTime: string, nowMinutes: number): boolean {
  return timeToMinutes(reminderTime) <= nowMinutes
}

export function nowMinutesLocal(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes()
}

// Deterministic default reminder times for a freshly-generated plan whose
// meal count is known but whose meal names aren't yet (the AI names them) -
// evenly spread across a typical 08:00-20:00 eating window rather than a
// per-count lookup table, so any meal count (3-6, or otherwise) gets a
// sensible spread with one formula.
const DAY_START_MINUTES = 8 * 60
const DAY_END_MINUTES = 20 * 60

export function defaultReminderTimes(count: number): string[] {
  if (count <= 1) return [minutesToTime(DAY_START_MINUTES)]
  const step = (DAY_END_MINUTES - DAY_START_MINUTES) / (count - 1)
  return Array.from({ length: count }, (_, i) => minutesToTime(DAY_START_MINUTES + i * step))
}

export function buildMealReminderEventKey(mealId: string): string {
  return `meal_reminder:${mealId}`
}

export interface ReminderMeal {
  id: string
  name: string
  reminderTime: string | null
  reminderEnabled: boolean
  status: 'none' | 'partial' | 'complete'
}

// Which configured, not-yet-eaten meals have reached their scheduled time
// right now. Does not itself dedup (see lib/notifications/actions.ts's
// claimNotificationEvent) - calling this repeatedly for the same still-due
// meal is expected and safe.
export function dueMealReminders(meals: ReminderMeal[], nowMinutes: number): ReminderMeal[] {
  return meals.filter(
    m => m.reminderEnabled && m.reminderTime !== null && m.status !== 'complete' && isMealReminderDue(m.reminderTime, nowMinutes)
  )
}
