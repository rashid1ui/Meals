'use server'

// DB-touching wrapper around lib/notifications/schedule.ts's pure logic -
// mirrors the split between app/dashboard/tracking-actions.ts and
// lib/tracking/logic.ts. Every function here is transport-agnostic: nothing
// assumes a client-side Notification call is what happens next, so a future
// Phase 2 server-side Web Push dispatcher can call claimNotificationEvent/
// getReminderSchedule directly instead of duplicating this logic.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUser } from '@/lib/auth/get-user'
import { isPlausibleToday } from '@/lib/tracking/date'
import { isValidReminderTime } from './schedule'
import { isValidPushSubscriptionInput, type PushSubscriptionInput } from './subscriptions'

type Result<T> = { data: T } | { error: string }

export type NotificationEventType = 'meal_reminder' | 'milestone'

export interface NotificationPreferencesDTO {
  remindersEnabled: boolean
  milestonesEnabled: boolean
  timezone: string | null
}

export interface ReminderMealDTO {
  id: string
  name: string
  sortOrder: number
  reminderTime: string | null
  reminderEnabled: boolean
}

export interface ReminderScheduleDTO {
  meals: ReminderMealDTO[]
  preferences: NotificationPreferencesDTO
}

// Read-only. Active plan's meals (for reminder scheduling) + the user's
// notification preferences, or defaults when no preferences row exists yet
// (pre-feature users, or anyone who reaches Settings without having gone
// through the onboarding Reminders step). Shared by both the Settings page
// and the client-side useMealReminders hook so this join exists in exactly
// one place.
export async function getReminderSchedule(): Promise<Result<ReminderScheduleDTO>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()

  const { data: activePlans } = await supabase
    .from('diet_plans')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)

  const activePlanId = activePlans?.[0]?.id as string | undefined

  let meals: ReminderMealDTO[] = []
  if (activePlanId) {
    const { data: mealRows } = await supabase
      .from('meals')
      .select('id, name, sort_order, reminder_time, reminder_enabled')
      .eq('diet_plan_id', activePlanId)
      .order('sort_order')

    meals = (mealRows || []).map(m => ({
      id: m.id as string,
      name: m.name as string,
      sortOrder: m.sort_order as number,
      reminderTime: m.reminder_time ? String(m.reminder_time).slice(0, 5) : null,
      reminderEnabled: Boolean(m.reminder_enabled)
    }))
  }

  const { data: prefRow } = await supabase
    .from('notification_preferences')
    .select('reminders_enabled, milestones_enabled, timezone')
    .eq('user_id', user.id)
    .maybeSingle()

  const preferences: NotificationPreferencesDTO = {
    remindersEnabled: prefRow?.reminders_enabled ?? false,
    milestonesEnabled: prefRow?.milestones_enabled ?? true,
    timezone: prefRow?.timezone ?? null
  }

  return { data: { meals, preferences } }
}

export async function upsertNotificationPreferences(input: {
  remindersEnabled: boolean
  milestonesEnabled?: boolean
  timezone?: string | null
}): Promise<Result<NotificationPreferencesDTO>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()

  const payload: Record<string, unknown> = {
    user_id: user.id,
    reminders_enabled: input.remindersEnabled,
    updated_at: new Date().toISOString()
  }
  if (input.milestonesEnabled !== undefined) payload.milestones_enabled = input.milestonesEnabled
  if (input.timezone !== undefined) payload.timezone = input.timezone

  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert(payload, { onConflict: 'user_id' })
    .select('reminders_enabled, milestones_enabled, timezone')
    .single()

  if (error || !data) {
    console.error('[notifications] upsertNotificationPreferences failed:', error)
    return { error: 'Failed to save notification preferences.' }
  }

  return {
    data: {
      remindersEnabled: data.reminders_enabled,
      milestonesEnabled: data.milestones_enabled,
      timezone: data.timezone
    }
  }
}

// Ownership-checked (eq user_id) - a meal id from a stale/foreign session
// can never update another user's row.
export async function updateMealReminder(
  mealId: string,
  input: { reminderTime: string | null; reminderEnabled: boolean }
): Promise<Result<void>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }
  if (input.reminderTime !== null && !isValidReminderTime(input.reminderTime)) {
    return { error: 'Invalid reminder time.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('meals')
    .update({ reminder_time: input.reminderTime, reminder_enabled: input.reminderEnabled })
    .eq('id', mealId)
    .eq('user_id', user.id)

  if (error) {
    console.error('[notifications] updateMealReminder failed:', error)
    return { error: 'Failed to update meal reminder.' }
  }
  return { data: undefined }
}

// Uses the admin (service-role) client deliberately, not the per-request
// RLS client - `endpoint` is globally unique (not scoped per user), so
// re-subscribing the same physical device/browser for a DIFFERENT user
// (e.g. a shared computer, or a previous account) needs to update a row
// whose CURRENT user_id doesn't match the caller yet, which the RLS UPDATE
// policy (`auth.uid() = user_id`, checked against the existing row) would
// otherwise block. The identity written is still never client-supplied -
// getUser() authenticates the caller first, exactly as every other action
// in this file; the admin client is only used to guarantee the upsert
// succeeds regardless of who owned the endpoint before.
export async function savePushSubscription(subscription: PushSubscriptionInput): Promise<Result<void>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  if (!isValidPushSubscriptionInput(subscription)) {
    return { error: 'Invalid push subscription.' }
  }

  // createAdminClient() throws synchronously if SUPABASE_SERVICE_ROLE_KEY/
  // NEXT_PUBLIC_SUPABASE_URL are missing - without this try/catch, that
  // throw propagated out of this 'use server' action uncaught, which Next.js
  // then redacts to a generic error on the client in production, hiding the
  // real cause from both the browser console and this function's caller.
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (err) {
    console.error('[notifications] savePushSubscription: admin client unavailable (missing env config):', err)
    return { error: 'Push notifications are not fully configured on the server.' }
  }

  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth_key: subscription.keys.auth
    },
    { onConflict: 'endpoint' }
  )

  if (error) {
    console.error('[notifications] savePushSubscription failed:', error)
    return { error: 'Failed to save push subscription.' }
  }
  return { data: undefined }
}

// Ownership-checked (eq user_id) via the normal per-request RLS client -
// unlike savePushSubscription above, there's no cross-user handoff case to
// work around here, so RLS alone is sufficient.
export async function deletePushSubscription(endpoint: string): Promise<Result<void>> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }

  const supabase = await createClient()
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', user.id)

  if (error) {
    console.error('[notifications] deletePushSubscription failed:', error)
    return { error: 'Failed to delete push subscription.' }
  }
  return { data: undefined }
}

// Atomic "has this exact notification already been sent today" claim: relies
// on notification_events' (user_id, local_date, event_key) unique
// constraint rather than a check-then-insert, so two near-simultaneous calls
// (e.g. two open tabs) can never both fire the same notification. Returning
// claimed:false is the normal, expected "already sent" outcome, not an error.
export async function claimNotificationEvent(
  localDate: string,
  eventKey: string,
  eventType: NotificationEventType
): Promise<{ claimed: boolean } | { error: string }> {
  const user = await getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!isPlausibleToday(localDate)) return { error: 'Invalid date.' }

  const supabase = await createClient()
  const { error } = await supabase.from('notification_events').insert({
    user_id: user.id,
    local_date: localDate,
    event_key: eventKey,
    event_type: eventType
  })

  if (!error) return { claimed: true }
  if (error.code === '23505') return { claimed: false }
  console.error('[notifications] claimNotificationEvent failed:', error)
  return { error: 'Failed to record notification event.' }
}
