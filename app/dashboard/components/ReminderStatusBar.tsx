'use client'

// Combines spec sections 3 (permission request UX) and 11 (dashboard status
// indicator) into one small, non-dominant element - both are really the same
// "where do meal reminders stand right now" concern from the user's point of
// view. Deliberately thin: the only logic here is reading Notification.
// permission and persisting the result via lib/notifications/actions.ts -
// scheduling/milestone/dedup/copy logic all lives in lib/notifications/,
// never here (see AGENTS.md's architecture rule).

import { useState } from 'react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { upsertNotificationPreferences, type NotificationPreferencesDTO } from '@/lib/notifications/actions'
import { useNotificationPermission, notifyPermissionChanged } from '@/lib/notifications/useNotificationPermission'
import { subscribeToPush } from '@/lib/notifications/usePushSubscription'

type Props = {
  preferences: NotificationPreferencesDTO
  onPreferencesChange: (preferences: NotificationPreferencesDTO) => void
}

export default function ReminderStatusBar({ preferences, onPreferencesChange }: Props) {
  const permission = useNotificationPermission()
  const [enabling, setEnabling] = useState(false)

  if (permission === 'unsupported') return null

  // Only ever called from this click handler - never on mount/effect - a
  // browser only honors Notification.requestPermission() as the direct
  // result of a user gesture.
  const handleEnable = async () => {
    setEnabling(true)
    try {
      const result = await Notification.requestPermission()
      notifyPermissionChanged()
      if (result === 'granted') {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
        const saved = await upsertNotificationPreferences({ remindersEnabled: true, timezone })
        if ('data' in saved) onPreferencesChange(saved.data)
        // Best-effort: a failed subscribe (e.g. VAPID misconfigured) still
        // leaves the in-tab Notification API path (useMealReminders.ts)
        // working, so it must never block the preference save above.
        await subscribeToPush()
      }
    } finally {
      setEnabling(false)
    }
  }

  if (permission === 'denied') {
    return (
      <p className="text-xs text-muted-foreground">
        Notifications are currently blocked. Enable notifications in your browser&apos;s site settings to receive meal reminders.
      </p>
    )
  }

  if (permission === 'default') {
    return (
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-foreground">Want meal reminders?</p>
          <p className="text-xs text-muted-foreground">
            Get a reminder when it&apos;s time to eat and encouragement as you hit your daily targets.
          </p>
        </div>
        <Button size="sm" onClick={handleEnable} loading={enabling}>
          Enable reminders
        </Button>
      </div>
    )
  }

  return (
    <p className="text-xs text-muted-foreground">
      Meal reminders: {preferences.remindersEnabled ? 'On' : 'Off'}
      {!preferences.remindersEnabled && (
        <>
          {' '}
          <Link
            href="/settings"
            className="text-primary font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            Enable meal reminders →
          </Link>
        </>
      )}
    </p>
  )
}
