// Vercel Cron-compatible endpoint - the Phase 2 scheduler. Orchestrates
// exactly the same decision logic Phase 1's client hook uses
// (dueMealReminders/thresholdsToClaim/buildMealReminderCopy/
// buildMilestoneCopy), just driven by a timer instead of a browser tab, over
// every user instead of the one currently signed in, and delivered via
// sendPushToUser instead of `new Notification()`. See lib/notifications/
// admin.ts's header comment for why the data layer this calls is a separate,
// server-only module rather than living in lib/notifications/actions.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getUsersWithRemindersEnabled,
  getReminderMealsForUser,
  getDailyProgressForUser,
  claimNotificationEventForUser,
  releaseNotificationEventClaim,
  type EnabledUser
} from '@/lib/notifications/admin'
import { localDateTimeInTimeZone } from '@/lib/notifications/timezone'
import { dueMealReminders, type ReminderMeal } from '@/lib/notifications/schedule'
import { buildMealReminderCopy, buildMilestoneCopy, computeRemainingNutrition } from '@/lib/notifications/copy'
import { pctOf } from '@/lib/tracking/logic'
import { sendPushToUser, checkVapidConfig } from '@/lib/notifications/push'
import {
  processMealReminderNotification,
  processMilestoneNotifications,
  runUsersSweep,
  emptyOutcome,
  mergeOutcome,
  type ClaimFn,
  type ReleaseFn,
  type SendFn,
  type SweepOutcome
} from '@/lib/notifications/sweep'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs' // web-push needs Node's crypto, not the Edge runtime
export const maxDuration = 60

// Fails CLOSED: if CRON_SECRET isn't configured, every request is rejected -
// there is no "open" fallback mode. Vercel Cron automatically sends this
// exact header when CRON_SECRET is set as a project env var; any other
// scheduler (self-hosted cron, GitHub Actions, etc.) just needs to send the
// same header.
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    return await runNotificationSweep()
  } catch (err) {
    // A transient DB error (or anything else unexpected reaching this far)
    // must surface as a clean 500 the scheduler's own retry/alerting can
    // see, never as an unhandled crash. VAPID misconfiguration is checked
    // and reported separately, below, BEFORE any per-user work starts - see
    // runNotificationSweep's up-front checkVapidConfig() call.
    console.error('[cron/notifications] sweep failed:', err)
    return Response.json({ error: 'Notification sweep failed.' }, { status: 500 })
  }
}

async function runNotificationSweep() {
  // A malformed VAPID key pair is a GLOBAL configuration problem, not a
  // per-user one - every single send would fail identically, so there is
  // nothing to gain from discovering that inside the per-user loop (which
  // is exactly what happened in production: the first user's send threw a
  // generic "Vapid public key should be 65 bytes long when decoded" from
  // deep inside web-push's own validator, uncaught, aborting the sweep
  // before any other user was even looked at). Checking once, up front,
  // turns that into one clear, specific, loudly-logged failure instead.
  const vapidCheck = checkVapidConfig()
  if (!vapidCheck.valid) {
    console.error('[cron/notifications] VAPID configuration invalid, sweep skipped entirely:', vapidCheck.errors)
    return Response.json(
      { error: 'VAPID configuration invalid - no notifications were sent.', details: vapidCheck.errors },
      { status: 500 }
    )
  }

  const admin = createAdminClient()
  const now = new Date()

  const users = await getUsersWithRemindersEnabled(admin)

  const summary = await runUsersSweep(users, user => processUserNotifications(admin, user, now))

  if (summary.usersFailed > 0) {
    // Do not hide a partial failure behind a 200 - some users were
    // processed successfully (their pushesSent/subscriptionsRemoved counts
    // are still accurate and included), but at least one user's outcome
    // carried an error and must be visible to the scheduler's own
    // failure/alerting signal, not silently swallowed into a "success".
    console.error('[cron/notifications] sweep completed with per-user failures:', summary.userErrors)
    return Response.json(summary, { status: 207 })
  }

  return Response.json(summary)
}

// One user's full notification pass: load their due meals + progress, then
// hand each due meal and the milestone check to sweep.ts's pure
// processors, wiring claim/release/send to the real admin client. Any
// unexpected throw here (e.g. a network error from getReminderMealsForUser)
// propagates to runUsersSweep's own try/catch, which isolates it from every
// other user - it is deliberately NOT caught here as well, so it is not
// silently absorbed twice.
async function processUserNotifications(
  admin: SupabaseClient,
  user: EnabledUser,
  now: Date
): Promise<SweepOutcome> {
  const outcome = emptyOutcome()

  // Never assumes UTC - each user's own stored IANA timezone (captured at
  // the moment they enabled reminders; see ReminderStatusBar/RemindersStep/
  // NotificationSettings) decides both today's date bucket for dedup and
  // whether a reminder_time has been reached, independent of the server's
  // own clock or any other user's timezone.
  const { dateString: localDate, minutesSinceMidnight: nowMinutes } = localDateTimeInTimeZone(now, user.timezone)

  const meals = await getReminderMealsForUser(admin, user.userId, localDate)
  const reminderMeals: ReminderMeal[] = meals.map(m => ({
    id: m.id,
    name: m.name,
    reminderTime: m.reminderTime,
    reminderEnabled: m.reminderEnabled,
    status: m.status
  }))
  const due = dueMealReminders(reminderMeals, nowMinutes)

  const needsProgress = due.length > 0 || user.milestonesEnabled
  const progress = needsProgress ? await getDailyProgressForUser(admin, user.userId, localDate) : null

  const claim: ClaimFn = (eventKey, eventType) =>
    claimNotificationEventForUser(admin, user.userId, localDate, eventKey, eventType)

  const release: ReleaseFn = async eventKey => {
    const result = await releaseNotificationEventClaim(admin, user.userId, localDate, eventKey)
    if ('error' in result) {
      // Logged loudly rather than swallowed - the worst case is this one
      // event stays claimed and won't retry until the underlying DB issue
      // clears, same failure mode as before this fix, never worse.
      console.error(`[cron/notifications] failed to release claim for retry (user ${user.userId}, key ${eventKey}):`, result.error)
    }
  }

  const send: SendFn = payload => sendPushToUser(admin, user.userId, payload)

  for (const meal of due) {
    try {
      const remaining = progress
        ? computeRemainingNutrition(
            { calories: progress.consumedCalories, protein: progress.consumedProtein },
            { calories: progress.targetCalories, protein: progress.targetProtein }
          )
        : undefined

      const mealOutcome = await processMealReminderNotification(
        meal,
        () => buildMealReminderCopy(meal.name, undefined, remaining),
        claim,
        release,
        send
      )
      mergeOutcome(outcome, mealOutcome)
    } catch (err) {
      // One meal reminder failing must never block this user's other due
      // meals, or their milestone check below.
      const message = err instanceof Error ? err.message : String(err)
      outcome.errors.push(`meal ${meal.id}: ${message}`)
      console.error(`[cron/notifications] meal reminder failed for user ${user.userId}, meal ${meal.id}:`, err)
    }
  }

  if (user.milestonesEnabled && progress) {
    try {
      const currentPct = Math.round(pctOf(progress.consumedCalories, progress.targetCalories))
      const milestoneOutcome = await processMilestoneNotifications(
        currentPct,
        threshold => buildMilestoneCopy(threshold),
        claim,
        release,
        send
      )
      mergeOutcome(outcome, milestoneOutcome)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      outcome.errors.push(`milestones: ${message}`)
      console.error(`[cron/notifications] milestone check failed for user ${user.userId}:`, err)
    }
  }

  return outcome
}
