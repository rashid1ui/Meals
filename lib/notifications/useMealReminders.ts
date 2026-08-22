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
import { thresholdsToClaim, buildMilestoneEventKey, type MilestoneThreshold } from './milestones'
import { buildMealReminderCopy, buildMilestoneCopy } from './copy'
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
      const nowMinutes = nowMinutesLocal()

      const reminderMeals: ReminderMeal[] = meals.map(m => ({
        id: m.id,
        name: m.name,
        reminderTime: m.reminderTime,
        reminderEnabled: m.reminderEnabled,
        status: dailyTracking.meals.find(t => t.mealId === m.id)?.status ?? 'none'
      }))

      for (const meal of dueMealReminders(reminderMeals, nowMinutes)) {
        const key = buildMealReminderEventKey(meal.id)
        if (resolvedRef.current.has(key)) continue

        const result = await claimNotificationEvent(localDate, key, 'meal_reminder')
        if (cancelled) return
        if ('error' in result) continue
        resolvedRef.current.add(key)
        if (!result.claimed) continue

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

        const copy = buildMealReminderCopy(meal.name, projected)
        showNotification(copy.title, copy.body)
      }

      if (preferences.milestonesEnabled) {
        const currentPct = Math.round(pctOf(dailyTracking.consumed.calories, dailyTracking.target.calories))
        // No client-side "already claimed" list is threaded in here - the
        // per-key resolvedRef check below plus the server's unique
        // constraint are what actually prevent repeats (see comment above).
        const toClaim = thresholdsToClaim(currentPct, [])
        const newlyClaimed: MilestoneThreshold[] = []

        for (const threshold of toClaim) {
          const key = buildMilestoneEventKey(threshold)
          if (resolvedRef.current.has(key)) continue

          const result = await claimNotificationEvent(localDate, key, 'milestone')
          if (cancelled) return
          if ('error' in result) continue
          resolvedRef.current.add(key)
          if (result.claimed) newlyClaimed.push(threshold)
        }

        // A single tracking update can cross several thresholds at once
        // (e.g. logging a big meal) - claim all of them (above) so none can
        // fire later on their own, but only ever notify about the highest
        // one actually reached, to avoid a burst of near-simultaneous
        // notifications for one user action.
        if (newlyClaimed.length > 0) {
          const highest = newlyClaimed.reduce((a, b) => (b > a ? b : a))
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
