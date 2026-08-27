import 'server-only'

// System-context (no logged-in user) reads/writes for the Phase 2 cron
// dispatcher - the counterpart to lib/notifications/actions.ts, which is
// 'use server' and therefore client-callable. Every function here takes an
// explicit userId + the admin (service-role) client instead of deriving the
// user from a session, because the cron has no session. This MUST stay a
// plain module (no 'use server') so Next.js never exposes it as a
// client-callable RPC - see lib/supabase/admin.ts's comment for why that
// distinction matters here specifically (an explicit-userId function in a
// 'use server' file would let a client request act as any user).

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeFoodStatus, deriveMealStatus, type TrackingStatus } from '@/lib/tracking/logic'
import type { NotificationEventType } from './actions'

export interface EnabledUser {
  userId: string
  timezone: string | null
  milestonesEnabled: boolean
}

// Every user with the master reminders switch on - the cron's starting
// population for a run.
export async function getUsersWithRemindersEnabled(admin: SupabaseClient): Promise<EnabledUser[]> {
  const { data, error } = await admin
    .from('notification_preferences')
    .select('user_id, timezone, milestones_enabled')
    .eq('reminders_enabled', true)

  if (error) {
    console.error('[notifications/admin] getUsersWithRemindersEnabled failed:', error)
    return []
  }

  return (data || []).map(row => ({
    userId: row.user_id as string,
    timezone: row.timezone as string | null,
    milestonesEnabled: Boolean(row.milestones_enabled)
  }))
}

export interface ReminderMealWithStatus {
  id: string
  name: string
  reminderTime: string | null
  reminderEnabled: boolean
  status: TrackingStatus
}

interface MealRow {
  id: string
  name: string
  reminder_time: string | null
  reminder_enabled: boolean
  foods: { id: string; quantity: number }[]
}

interface TrackedFoodRow {
  food_id: string | null
  completed: boolean
  quantity: number
}

// Mirrors app/dashboard/tracking-actions.ts's getTodayTracking meal-status
// join (same tables, same shape), but via the admin client for an explicit
// userId/localDate. Reuses the exact same pure status functions
// (computeFoodStatus/deriveMealStatus) - completion is never re-derived by
// any different rule here.
export async function getReminderMealsForUser(
  admin: SupabaseClient,
  userId: string,
  localDate: string
): Promise<ReminderMealWithStatus[]> {
  const { data: activePlans, error: activePlanError } = await admin
    .from('diet_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)

  if (activePlanError) {
    console.error(`[notifications/admin] getReminderMealsForUser: failed to load active plan for user ${userId}:`, activePlanError)
    return []
  }

  const activePlanId = activePlans?.[0]?.id as string | undefined
  if (!activePlanId) return []

  const { data: mealRows, error: mealsError } = await admin
    .from('meals')
    .select('id, name, reminder_time, reminder_enabled, foods(id, quantity)')
    .eq('diet_plan_id', activePlanId)
    .order('sort_order')

  if (mealsError) {
    console.error(`[notifications/admin] getReminderMealsForUser: failed to load meals for user ${userId}:`, mealsError)
    return []
  }

  const meals = (mealRows as MealRow[] | null) || []

  const { data: trackedFoods, error: trackedFoodsError } = await admin
    .from('food_tracking')
    .select('food_id, completed, quantity')
    .eq('user_id', userId)
    .eq('tracking_date', localDate)

  if (trackedFoodsError) {
    console.error(`[notifications/admin] getReminderMealsForUser: failed to load today's tracking for user ${userId}:`, trackedFoodsError)
    // Not fatal to the whole lookup - fall through with an empty tracked-set
    // so meals still report (as "none eaten yet") rather than being dropped
    // entirely; the error is still surfaced above, not swallowed.
  }

  const trackedByFoodId = new Map<string, TrackedFoodRow>()
  for (const t of (trackedFoods as TrackedFoodRow[] | null) || []) {
    if (t.completed && t.food_id) trackedByFoodId.set(t.food_id, t)
  }

  return meals.map(meal => {
    const foodStatuses: TrackingStatus[] = meal.foods.map(f => {
      const tracked = trackedByFoodId.get(f.id)
      return computeFoodStatus(tracked ? Number(tracked.quantity) : 0, f.quantity)
    })
    return {
      id: meal.id,
      name: meal.name,
      reminderTime: meal.reminder_time ? String(meal.reminder_time).slice(0, 5) : null,
      reminderEnabled: Boolean(meal.reminder_enabled),
      status: deriveMealStatus(foodStatuses)
    }
  })
}

export interface DailyProgressForUser {
  consumedCalories: number
  consumedProtein: number
  targetCalories: number
  targetProtein: number
}

// Mirrors getTodayTracking's daily rollup source (daily_tracking if a row
// exists for the date, else the active plan's targets with zero consumed -
// a fresh day has no daily_tracking row until the user logs something) -
// reads the already-persisted numbers rather than recomputing them from
// food_tracking rows.
export async function getDailyProgressForUser(
  admin: SupabaseClient,
  userId: string,
  localDate: string
): Promise<DailyProgressForUser | null> {
  const { data: activePlans, error: activePlanError } = await admin
    .from('diet_plans')
    .select('calories_target, protein_target')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)

  if (activePlanError) {
    console.error(`[notifications/admin] getDailyProgressForUser: failed to load active plan for user ${userId}:`, activePlanError)
    return null
  }

  const activePlan = activePlans?.[0]
  if (!activePlan) return null

  const { data: dailyRows, error: dailyError } = await admin
    .from('daily_tracking')
    .select('calories, protein')
    .eq('user_id', userId)
    .eq('tracking_date', localDate)
    .limit(1)

  if (dailyError) {
    console.error(`[notifications/admin] getDailyProgressForUser: failed to load daily tracking for user ${userId}:`, dailyError)
    // Not fatal - fall through treating the day as "nothing logged yet"
    // (consumed=0), same as a brand-new day with no daily_tracking row.
  }

  const daily = dailyRows?.[0]

  return {
    consumedCalories: Number(daily?.calories ?? 0),
    consumedProtein: Number(daily?.protein ?? 0),
    targetCalories: activePlan.calories_target,
    targetProtein: activePlan.protein_target
  }
}

// System-context counterpart to lib/notifications/actions.ts's
// claimNotificationEvent - identical semantics (atomic claim via the same
// (user_id, local_date, event_key) unique constraint) but takes an explicit
// userId instead of a session. Shares the exact same table/constraint, so a
// meal reminder claimed here can never also fire from the client-side path
// (useMealReminders.ts) for the same user/day, and vice versa.
export async function claimNotificationEventForUser(
  admin: SupabaseClient,
  userId: string,
  localDate: string,
  eventKey: string,
  eventType: NotificationEventType
): Promise<{ claimed: boolean } | { error: string }> {
  const { error } = await admin.from('notification_events').insert({
    user_id: userId,
    local_date: localDate,
    event_key: eventKey,
    event_type: eventType
  })

  if (!error) return { claimed: true }
  if (error.code === '23505') return { claimed: false }
  console.error('[notifications/admin] claimNotificationEventForUser failed:', error)
  return { error: 'Failed to record notification event.' }
}

// Compensating action for claimNotificationEventForUser: deletes a claim
// that turned out to be undeliverable (the push threw, or reached zero
// subscriptions) so the SAME (user_id, local_date, event_key) can be
// claimed again on a later tick instead of being permanently stuck "sent"
// with nothing ever actually delivered. Never called for a claim that was
// successfully delivered - see app/api/cron/notifications/route.ts's
// processMealReminder/processMilestones, which only call this on a failed
// or zero-delivery send.
export async function releaseNotificationEventClaim(
  admin: SupabaseClient,
  userId: string,
  localDate: string,
  eventKey: string
): Promise<{ released: boolean } | { error: string }> {
  const { error } = await admin
    .from('notification_events')
    .delete()
    .eq('user_id', userId)
    .eq('local_date', localDate)
    .eq('event_key', eventKey)

  if (error) {
    console.error('[notifications/admin] releaseNotificationEventClaim failed:', error)
    return { error: 'Failed to release notification claim for retry.' }
  }
  return { released: true }
}
