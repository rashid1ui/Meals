// Vercel Cron-compatible endpoint - the Phase 2 scheduler. Orchestrates
// exactly the same decision logic Phase 1's client hook uses
// (dueMealReminders/thresholdsToClaim/buildMealReminderCopy/
// buildMilestoneCopy), just driven by a timer instead of a browser tab, over
// every user instead of the one currently signed in, and delivered via
// sendPushToUser instead of `new Notification()`. See lib/notifications/
// admin.ts's header comment for why the data layer this calls is a separate,
// server-only module rather than living in lib/notifications/actions.ts.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  getUsersWithRemindersEnabled,
  getReminderMealsForUser,
  getDailyProgressForUser,
  claimNotificationEventForUser
} from '@/lib/notifications/admin'
import { localDateTimeInTimeZone } from '@/lib/notifications/timezone'
import { dueMealReminders, buildMealReminderEventKey, type ReminderMeal } from '@/lib/notifications/schedule'
import { thresholdsToClaim, buildMilestoneEventKey, type MilestoneThreshold } from '@/lib/notifications/milestones'
import { buildMealReminderCopy, buildMilestoneCopy, computeRemainingNutrition } from '@/lib/notifications/copy'
import { pctOf } from '@/lib/tracking/logic'
import { sendPushToUser } from '@/lib/notifications/push'

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
    // A misconfiguration (missing SUPABASE_SERVICE_ROLE_KEY/VAPID env vars)
    // or a transient DB error must surface as a clean 500 the scheduler's
    // own retry/alerting can see, never as an unhandled crash.
    console.error('[cron/notifications] sweep failed:', err)
    return Response.json({ error: 'Notification sweep failed.' }, { status: 500 })
  }
}

async function runNotificationSweep() {
  const admin = createAdminClient()
  const now = new Date()

  const users = await getUsersWithRemindersEnabled(admin)

  let usersProcessed = 0
  let pushesSent = 0
  let subscriptionsRemoved = 0

  for (const user of users) {
    usersProcessed++

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

    for (const meal of due) {
      const key = buildMealReminderEventKey(meal.id)
      const claim = await claimNotificationEventForUser(admin, user.userId, localDate, key, 'meal_reminder')
      if ('error' in claim || !claim.claimed) continue

      const remaining = progress
        ? computeRemainingNutrition(
            { calories: progress.consumedCalories, protein: progress.consumedProtein },
            { calories: progress.targetCalories, protein: progress.targetProtein }
          )
        : undefined

      const copy = buildMealReminderCopy(meal.name, undefined, remaining)
      const result = await sendPushToUser(admin, user.userId, {
        title: copy.title,
        body: copy.body,
        url: '/dashboard',
        tag: key
      })
      pushesSent += result.sent
      subscriptionsRemoved += result.removed
    }

    if (user.milestonesEnabled && progress) {
      const currentPct = Math.round(pctOf(progress.consumedCalories, progress.targetCalories))
      const toClaim = thresholdsToClaim(currentPct, [])
      const newlyClaimed: MilestoneThreshold[] = []

      for (const threshold of toClaim) {
        const key = buildMilestoneEventKey(threshold)
        const claim = await claimNotificationEventForUser(admin, user.userId, localDate, key, 'milestone')
        if ('error' in claim) continue
        if (claim.claimed) newlyClaimed.push(threshold)
      }

      // Claims every newly-crossed threshold (so none can fire later on
      // their own) but only ever sends one push, for the highest reached -
      // same "collapse a big jump into one notification" policy as
      // useMealReminders.ts.
      if (newlyClaimed.length > 0) {
        const highest = newlyClaimed.reduce((a, b) => (b > a ? b : a))
        const copy = buildMilestoneCopy(highest)
        const result = await sendPushToUser(admin, user.userId, { title: copy.title, body: copy.body, url: '/dashboard' })
        pushesSent += result.sent
        subscriptionsRemoved += result.removed
      }
    }
  }

  return Response.json({ usersProcessed, pushesSent, subscriptionsRemoved })
}
