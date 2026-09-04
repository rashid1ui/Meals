'use client'

// Client-side orchestration for supplement reminders - mirrors
// useMealReminders.ts's Phase 1 architecture (Notification API,
// app-open-only delivery) exactly: same 60s tick, same durable server-side
// dedup ledger (claimNotificationEvent), same "session cache of resolved
// keys so we don't re-ask the server every tick" pattern. Deliberately its
// own hook rather than folded into useMealReminders - per spec section 9,
// each supplement's notification_enabled is independent of the meal
// reminders master switch, so this hook is gated only on browser
// Notification permission, never on notification_preferences.reminders_enabled.

import { useEffect, useRef } from 'react'
import { claimNotificationEvent } from './actions'
import { dueSupplementReminders, buildSupplementReminderEventKey, type ReminderSupplement } from './supplementSchedule'
import { buildSupplementReminderCopy } from './supplementCopy'
import { nowMinutesLocal } from './schedule'

const TICK_MS = 60_000

function showNotification(title: string, body: string) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  try {
    new Notification(title, { body })
  } catch {
    // See useMealReminders.ts's identical guard - some environments can
    // throw synchronously even with permission granted.
  }
}

export function useSupplementReminders(supplements: ReminderSupplement[], localDate: string) {
  const resolvedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    resolvedRef.current = new Set()
  }, [localDate])

  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    if (supplements.length === 0) return

    let cancelled = false

    const tick = async () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

      const nowMinutes = nowMinutesLocal()
      const due = dueSupplementReminders(supplements, nowMinutes, localDate)

      for (const occurrence of due) {
        if (cancelled) return
        const key = buildSupplementReminderEventKey(occurrence.supplementId, occurrence.time)
        if (resolvedRef.current.has(key)) continue

        const claimResult = await claimNotificationEvent(localDate, key, 'supplement_reminder')
        if (cancelled) return
        if ('error' in claimResult) continue // transient failure - retried next tick

        resolvedRef.current.add(key)
        if (!claimResult.claimed) continue // already sent earlier today

        const copy = buildSupplementReminderCopy(occurrence)
        showNotification(copy.title, copy.body)
      }
    }

    tick()
    const interval = setInterval(tick, TICK_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [supplements, localDate])
}
