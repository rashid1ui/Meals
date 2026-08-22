'use client'

// User control surface for spec section 10 - extends the existing Settings
// page rather than introducing a separate settings system. Purely a thin UI
// over lib/notifications/actions.ts; no scheduling/milestone/dedup/copy
// logic lives here (see AGENTS.md's architecture rule).

import { useState } from 'react'
import {
  updateMealReminder,
  upsertNotificationPreferences,
  type NotificationPreferencesDTO,
  type ReminderMealDTO
} from '@/lib/notifications/actions'
import { useNotificationPermission, notifyPermissionChanged } from '@/lib/notifications/useNotificationPermission'
import { subscribeToPush, unsubscribeFromPush } from '@/lib/notifications/usePushSubscription'

type Props = {
  initialMeals: ReminderMealDTO[]
  initialPreferences: NotificationPreferencesDTO
}

export default function NotificationSettings({ initialMeals, initialPreferences }: Props) {
  const permission = useNotificationPermission()
  const [requesting, setRequesting] = useState(false)
  const [preferences, setPreferences] = useState(initialPreferences)
  const [meals, setMeals] = useState(initialMeals)
  const [savingMealId, setSavingMealId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleEnableNotifications = async () => {
    setRequesting(true)
    setError(null)
    try {
      const result = await Notification.requestPermission()
      notifyPermissionChanged()
      if (result === 'granted') {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
        const saved = await upsertNotificationPreferences({ remindersEnabled: true, timezone })
        if ('data' in saved) setPreferences(saved.data)
        else setError(saved.error)
        // Best-effort - see ReminderStatusBar's identical comment.
        await subscribeToPush()
      }
    } finally {
      setRequesting(false)
    }
  }

  const handleTogglePreference = async (patch: { remindersEnabled?: boolean; milestonesEnabled?: boolean }) => {
    const next = { ...preferences, ...patch }
    setPreferences(next)
    setError(null)
    const result = await upsertNotificationPreferences(next)
    if ('error' in result) {
      setPreferences(preferences)
      setError(result.error)
      return
    }
    // Tear down this device's push subscription the moment the user turns
    // reminders off, rather than leaving it dangling (the server already
    // stops sending regardless, since the cron only ever looks at users
    // with reminders_enabled=true - this is just good hygiene per spec
    // section 2's "allow deleting old subscriptions").
    if (patch.remindersEnabled === false) await unsubscribeFromPush()
  }

  const handleMealChange = async (mealId: string, patch: { reminderTime?: string | null; reminderEnabled?: boolean }) => {
    const previous = meals
    const next = meals.map(m => (m.id === mealId ? { ...m, ...patch } : m))
    setMeals(next)
    setSavingMealId(mealId)
    setError(null)

    const meal = next.find(m => m.id === mealId)!
    const result = await updateMealReminder(mealId, { reminderTime: meal.reminderTime, reminderEnabled: meal.reminderEnabled })
    if ('error' in result) {
      setMeals(previous)
      setError(result.error)
    }
    setSavingMealId(null)
  }

  const remindersOn = permission === 'granted' && preferences.remindersEnabled

  return (
    <div className="space-y-5">
      {error && (
        <p className="text-xs text-error" role="alert">
          {error}
        </p>
      )}

      {permission === 'unsupported' ? (
        <p className="text-sm text-muted-foreground">
          Your browser doesn&apos;t support notifications, so meal reminders aren&apos;t available here.
        </p>
      ) : permission === 'denied' ? (
        <p className="text-sm text-muted-foreground">
          Notifications are currently blocked. Enable notifications in your browser&apos;s site settings to receive
          meal reminders.
        </p>
      ) : permission === 'default' ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-foreground">Turn on browser notifications to receive meal reminders.</p>
          <button
            type="button"
            onClick={handleEnableNotifications}
            disabled={requesting}
            className="min-h-[44px] px-4 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            {requesting ? 'Requesting…' : 'Enable notifications'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.remindersEnabled}
              onChange={e => handleTogglePreference({ remindersEnabled: e.target.checked })}
              className="w-5 h-5 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
            />
            <span className="text-sm font-semibold text-foreground">Enable meal reminders</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.milestonesEnabled}
              onChange={e => handleTogglePreference({ milestonesEnabled: e.target.checked })}
              className="w-5 h-5 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
            />
            <span className="text-sm text-foreground">Progress milestone notifications (25/50/75/90/100%)</span>
          </label>

          {meals.length === 0 ? (
            <p className="text-xs text-muted-foreground">No meals in your active plan yet.</p>
          ) : (
            <div className={`space-y-2 pt-2 ${remindersOn ? '' : 'opacity-50'}`}>
              {meals.map(meal => (
                <div key={meal.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border">
                  <label className="flex items-center gap-3 flex-1 cursor-pointer" htmlFor={`settings-reminder-${meal.id}`}>
                    <input
                      id={`settings-reminder-${meal.id}`}
                      type="checkbox"
                      checked={meal.reminderEnabled}
                      disabled={!remindersOn}
                      onChange={e => handleMealChange(meal.id, { reminderEnabled: e.target.checked })}
                      className="w-5 h-5 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span className="text-sm font-semibold text-foreground truncate">{meal.name}</span>
                  </label>
                  <input
                    type="time"
                    aria-label={`${meal.name} reminder time`}
                    value={meal.reminderTime ?? ''}
                    disabled={!remindersOn || !meal.reminderEnabled || savingMealId === meal.id}
                    onChange={e => handleMealChange(meal.id, { reminderTime: e.target.value || null })}
                    className="min-h-[44px] bg-background border border-border rounded-lg px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors disabled:cursor-not-allowed"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
