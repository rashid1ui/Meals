'use client'

// Client-side orchestration for Phase 1 (Notification API, app-open-only
// delivery - see the closed-browser limitation this project was scoped
// against). Ties together the pure decision logic (schedule.ts,
// milestones.ts, copy.ts) with the durable server-side dedup ledger
// (actions.ts's claimNotificationEvent) and the one Phase-1-specific step:
// actually calling `new Notification()`. A Phase 2 Web Push dispatcher would
// reuse every import here except this file itself - it would call
// getReminderSchedule/claimNotificationEvent from a server route instead,
// against the same rows.

import { useEffect, useRef } from 'react'
import { claimNotificationEvent, type NotificationPreferencesDTO, type ReminderMealDTO } from './actions'
import { dueMealReminders, nowMinutesLocal, buildMealReminderEventKey, type ReminderMeal } from './schedule'
import { buildMealReminderCopy, buildMilestoneCopy } from './copy'
import { claimAndDisplayMealReminder, claimNewMilestones, highestMilestone } from './clientSweep'
import { pctOf } from '@/lib/tracking/logic'
import type { DailyTrackingSummary } from '@/app/dashboard/tracking-actions'

const TICK_MS = 60_000

function showNotification(title: string, body: string) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  try {
    new Notification(title, { body })
  } catch {
    // Some environments can throw synchronously even with permission
    // granted (e.g. a non-installed iOS web app) - never let a notification
    // failure break the dashboard around it.
  }
}

export function useMealReminders(
  meals: ReminderMealDTO[],
  preferences: NotificationPreferencesDTO,
  dailyTracking: DailyTrackingSummary | null,
  localDate: string
) {
  // Session-only cache of event keys already resolved (fired, or confirmed
  // already-sent by the server) THIS page load - purely to avoid re-asking
  // the server every tick for a reminder that already fired earlier this
  // session. notification_events (server-side, via claimNotificationEvent)
  // remains the actual source of truth; a fresh page load with an empty
  // cache still behaves correctly, it just re-confirms once per key.
  const resolvedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    resolvedRef.current = new Set()
  }, [localDate])

  useEffect(() => {
    if (!preferences.remindersEnabled) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    if (!dailyTracking) return

    let cancelled = false

    const tick = async () => {
      // Re-checked every tick, not just once when the effect mounts: if
      // permission is revoked mid-session the interval keeps firing, and
      // claiming (below) without being able to display would write the
      // shared notification_events row with nothing shown - which also
      // suppresses the cron's Web Push for that key/day.
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

      const nowMinutes = nowMinutesLocal()

      const reminderMeals: ReminderMeal[] = meals.map(m => ({
        id: m.id,
        name: m.name,
        reminderTime: m.reminderTime,
        reminderEnabled: m.reminderEnabled,
        status: dailyTracking.meals.find(t => t.mealId === m.id)?.status ?? 'none'
      }))

      for (const meal of dueMealReminders(reminderMeals, nowMinutes)) {
        // Only skip work not yet started - once a claim is in flight,
        // claimAndDisplayMealReminder owns the claim->display ordering and
        // finishes it even if we were cancelled during its await.
        if (cancelled) return
        if (resolvedRef.current.has(buildMealReminderEventKey(meal.id))) continue

        const trackedMeal = dailyTracking.meals.find(t => t.mealId === meal.id)
        const plannedCalories = trackedMeal?.planned.calories
        const projected =
          plannedCalories && dailyTracking.target.calories > 0
            ? {
                consumedPct: pctOf(dailyTracking.consumed.calories, dailyTracking.target.calories),
                projectedPct: Math.min(
                  100,
                  pctOf(dailyTracking.consumed.calories + plannedCalories, dailyTracking.target.calories)
                )
              }
            : undefined

        const { eventKey, resolved } = await claimAndDisplayMealReminder(
          meal,
          () => buildMealReminderCopy(meal.name, projected),
          (key, eventType) => claimNotificationEvent(localDate, key, eventType),
          copy => showNotification(copy.title, copy.body)
        )
        if (resolved) resolvedRef.current.add(eventKey)
      }

      if (preferences.milestonesEnabled) {
        if (cancelled) return

        const currentPct = Math.round(pctOf(dailyTracking.consumed.calories, dailyTracking.target.calories))

        // A single tracking update can cross several thresholds at once
        // (e.g. logging a big meal) - claimNewMilestones claims all of them
        // (so none can fire later on their own) but only reports which were
        // freshly claimed, so we notify about the highest one only, to
        // avoid a burst of near-simultaneous notifications for one action.
        const { resolvedKeys, newlyClaimed } = await claimNewMilestones(
          currentPct,
          key => resolvedRef.current.has(key),
          (key, eventType) => claimNotificationEvent(localDate, key, eventType)
        )
        for (const key of resolvedKeys) resolvedRef.current.add(key)

        const highest = highestMilestone(newlyClaimed)
        if (highest !== null) {
          const copy = buildMilestoneCopy(highest)
          showNotification(copy.title, copy.body)
        }
      }
    }

    tick()
    const interval = setInterval(tick, TICK_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [meals, preferences, dailyTracking, localDate])
}
