'use server'

// DB-touching wrapper around lib/supplements/tracking.ts's pure logic -
// mirrors app/dashboard/tracking-actions.ts's split with lib/tracking/logic.ts.
// This is a SEPARATE domain from lib/supplements/actions.ts's CRUD:
// notification_enabled controls reminders only (lib/notifications/
// useSupplementReminders.ts) and has no bearing on whether a dose is part of
// today's target or whether it can be marked taken - that independence is
// exactly why "which supplements exist" and "did I take today's doses" are
// two different files, never merged into one.

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import { isPlausibleToday } from '@/lib/tracking/date'
import { isValidReminderTime } from '@/lib/notifications/schedule'
import { isSupplementActiveOn } from '@/lib/notifications/supplementSchedule'
import { buildExpectedDoses, computeSupplementProgress, buildSupplementTrackingRow } from './tracking'
import { rowToDTO, SUPPLEMENT_SELECT_COLUMNS, type SupplementDTO, type SupplementRow } from './mapRow'

type Result<T> = { data: T } | { error: string }
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export interface SupplementDoseDTO {
  supplementId: string
  supplementName: string
  dose: number | null
  doseUnit: string | null
  quantity: number
  quantityUnit: string
  scheduledTime: string
  completed: boolean
  notificationEnabled: boolean
}

export interface SupplementTrackingSummary {
  date: string
  completed: number
  total: number
  percentage: number
  doses: SupplementDoseDTO[]
}

interface TrackingRow {
  user_supplement_id: string | null
  scheduled_time: string
  completed: boolean
}

// Every supplement of this user's that is active on `localDate` (respects
// start_date/end_date - spec section 5/14). Deliberately unfiltered by
// notification_enabled: a disabled reminder must not remove a supplement
// from today's target.
async function loadActiveSupplements(
  supabase: SupabaseServerClient,
  userId: string,
  localDate: string
): Promise<Result<SupplementDTO[]>> {
  const { data, error } = await supabase.from('user_supplements').select(SUPPLEMENT_SELECT_COLUMNS).eq('user_id', userId)

  if (error) {
    console.error('[supplements/tracking] failed to load supplements:', error)
    return { error: 'Failed to load your supplements.' }
  }

  const all = ((data as SupplementRow[] | null) || []).map(rowToDTO)
  const active = all.filter(s => isSupplementActiveOn({ startDate: s.startDate, endDate: s.endDate }, localDate))
  return { data: active }
}

// Ensures every dose expected today has a tracking row, WITHOUT ever
// overwriting an existing one - `ignoreDuplicates` makes this an ON
// CONFLICT DO NOTHING against supplement_tracking's own unique constraint,
// so a Dashboard refresh (or two concurrent tabs) can never create
// duplicates or reset an already-recorded completion back to false (spec
// sections 2 and 6). Best-effort: a failure here is logged, not fatal - a
// dose simply gets initialized again on the next call.
async function ensureTodayDoseRows(
  supabase: SupabaseServerClient,
  userId: string,
  localDate: string,
  active: SupplementDTO[]
): Promise<void> {
  const expected = buildExpectedDoses(
    active.map(s => ({ id: s.id, times: s.times, startDate: s.startDate, endDate: s.endDate })),
    localDate
  )
  if (expected.length === 0) return

  const rows = expected.map(e =>
    buildSupplementTrackingRow({
      userId,
      userSupplementId: e.userSupplementId,
      trackingDate: localDate,
      scheduledTime: e.scheduledTime,
      completed: false
    })
  )

  const { error } = await supabase
    .from('supplement_tracking')
    .upsert(rows, { onConflict: 'user_id,user_supplement_id,tracking_date,scheduled_time', ignoreDuplicates: true })

  if (error) {
    console.error("[supplements/tracking] failed to initialize today's dose rows:", error)
  }
}

// Read (and lazily initialize) today's full supplement dose list + rollup
// percentage - the single authoritative source both the Dashboard card and
// the Supplements section read from. Never invents completion: a dose with
// no tracking row yet (just initialized, or the initializer failed) reads
// as not-completed, matching its actual default state.
export async function getTodaySupplementTracking(localDate: string): Promise<Result<SupplementTrackingSummary>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isPlausibleToday(localDate)) return { error: 'Invalid date.' }

  const supabase = await createClient()

  const activeResult = await loadActiveSupplements(supabase, user.id, localDate)
  if ('error' in activeResult) return activeResult
  const active = activeResult.data

  await ensureTodayDoseRows(supabase, user.id, localDate, active)

  const { data: trackingRows, error: trackingError } = await supabase
    .from('supplement_tracking')
    .select('user_supplement_id, scheduled_time, completed')
    .eq('user_id', user.id)
    .eq('tracking_date', localDate)

  if (trackingError) {
    console.error("[supplements/tracking] failed to load today's tracking:", trackingError)
    return { error: "Failed to load today's supplement tracking." }
  }

  const completedByKey = new Map<string, boolean>()
  for (const row of (trackingRows as TrackingRow[] | null) || []) {
    if (!row.user_supplement_id) continue // historical row of a since-deleted supplement
    completedByKey.set(`${row.user_supplement_id}|${String(row.scheduled_time).slice(0, 5)}`, Boolean(row.completed))
  }

  const doses: SupplementDoseDTO[] = active.flatMap(s =>
    s.times.map(time => ({
      supplementId: s.id,
      supplementName: s.name,
      dose: s.dose,
      doseUnit: s.doseUnit,
      quantity: s.quantity,
      quantityUnit: s.quantityUnit,
      scheduledTime: time,
      completed: completedByKey.get(`${s.id}|${time}`) ?? false,
      notificationEnabled: s.notificationEnabled
    }))
  )

  const progress = computeSupplementProgress(doses)
  return { data: { date: localDate, ...progress, doses } }
}

// Ownership + membership checked: the supplement must belong to the caller
// AND `scheduledTime` must be one of ITS actually-configured times AND it
// must be active on `localDate` - a stale, foreign, mistyped, or
// no-longer-scheduled dose can never be marked, regardless of what the
// client sends. Idempotent: re-marking an already-completed (or
// already-uncompleted) dose is a safe no-op upsert, never a duplicate row.
async function setSupplementDoseCompleted(
  supplementId: string,
  scheduledTime: string,
  localDate: string,
  completed: boolean
): Promise<Result<SupplementTrackingSummary>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isPlausibleToday(localDate)) return { error: 'Tracking is only available for today.' }
  if (!isValidReminderTime(scheduledTime)) return { error: 'Invalid time.' }

  const supabase = await createClient()

  const { data: supplement, error: supplementError } = await supabase
    .from('user_supplements')
    .select('id, times, start_date, end_date')
    .eq('id', supplementId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (supplementError) {
    console.error('[supplements/tracking] failed to load supplement for tracking:', supplementError)
    return { error: 'Failed to update supplement tracking.' }
  }
  if (!supplement) return { error: 'Supplement not found.' }

  const scheduledTimes = ((supplement.times as string[] | null) || []).map(t => String(t).slice(0, 5))
  if (!scheduledTimes.includes(scheduledTime)) {
    return { error: 'This time is not scheduled for this supplement.' }
  }
  if (
    !isSupplementActiveOn(
      { startDate: supplement.start_date as string, endDate: supplement.end_date as string | null },
      localDate
    )
  ) {
    return { error: 'This supplement is not active on this date.' }
  }

  const row = buildSupplementTrackingRow({
    userId: user.id,
    userSupplementId: supplementId,
    trackingDate: localDate,
    scheduledTime,
    completed
  })

  const { error: upsertError } = await supabase
    .from('supplement_tracking')
    .upsert(row, { onConflict: 'user_id,user_supplement_id,tracking_date,scheduled_time' })

  if (upsertError) {
    console.error('[supplements/tracking] failed to save dose completion:', upsertError)
    return { error: 'Failed to update supplement tracking.' }
  }

  return getTodaySupplementTracking(localDate)
}

export async function markSupplementTaken(
  supplementId: string,
  scheduledTime: string,
  localDate: string
): Promise<Result<SupplementTrackingSummary>> {
  return setSupplementDoseCompleted(supplementId, scheduledTime, localDate, true)
}

export async function unmarkSupplementTaken(
  supplementId: string,
  scheduledTime: string,
  localDate: string
): Promise<Result<SupplementTrackingSummary>> {
  return setSupplementDoseCompleted(supplementId, scheduledTime, localDate, false)
}

// General-purpose entry point (mirrors app/dashboard/tracking-actions.ts's
// toggleMealCompletion) for a UI control that already knows the target
// state, rather than needing to branch between mark/unmark itself.
export async function toggleSupplementDose(
  supplementId: string,
  scheduledTime: string,
  localDate: string,
  completed: boolean
): Promise<Result<SupplementTrackingSummary>> {
  return setSupplementDoseCompleted(supplementId, scheduledTime, localDate, completed)
}
