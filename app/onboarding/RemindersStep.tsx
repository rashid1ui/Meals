'use client'

// Onboarding step 7 - collects meal reminder times + notification permission
// up front (spec section 7). Meal NAMES aren't known yet (the AI names them
// after this step runs), so times are collected by POSITION and applied to
// whichever meal lands at that sort_order once generation finishes (see
// app/onboarding/actions.ts) - the labels below are just a friendly,
// non-binding guess at what a meal in that position usually is.

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { useNotificationPermission, notifyPermissionChanged } from '@/lib/notifications/useNotificationPermission'
import { subscribeToPush } from '@/lib/notifications/usePushSubscription'

export interface ReminderFormMeal {
  time: string
  enabled: boolean
}

export interface RemindersFormValue {
  enabled: boolean
  perMeal: ReminderFormMeal[]
}

type Props = {
  value: RemindersFormValue
  onChange: (value: RemindersFormValue) => void
}

const MEAL_LABELS: Record<number, string[]> = {
  1: ['Meal'],
  2: ['Breakfast', 'Dinner'],
  3: ['Breakfast', 'Lunch', 'Dinner'],
  4: ['Breakfast', 'Lunch', 'Snack', 'Dinner'],
  5: ['Breakfast', 'Snack', 'Lunch', 'Snack', 'Dinner'],
  6: ['Breakfast', 'Snack', 'Lunch', 'Snack', 'Snack', 'Dinner']
}

function labelsFor(count: number): string[] {
  return MEAL_LABELS[count] ?? Array.from({ length: count }, (_, i) => `Meal ${i + 1}`)
}

export default function RemindersStep({ value, onChange }: Props) {
  const permission = useNotificationPermission()
  const [requesting, setRequesting] = useState(false)

  const labels = labelsFor(value.perMeal.length)

  const setMeal = (index: number, patch: Partial<ReminderFormMeal>) => {
    onChange({ ...value, perMeal: value.perMeal.map((m, i) => (i === index ? { ...m, ...patch } : m)) })
  }

  // Only ever called from this click handler - a browser only honors
  // Notification.requestPermission() as the direct result of a user gesture,
  // never on mount/effect.
  const handleEnableNotifications = async () => {
    setRequesting(true)
    try {
      const result = await Notification.requestPermission()
      notifyPermissionChanged()
      if (result === 'granted') {
        onChange({ ...value, enabled: true })
        // Best-effort - a subscribe failure here shouldn't block onboarding;
        // the user can still enable push later from Settings. Still logged
        // so a silent failure is visible in the browser console.
        const pushResult = await subscribeToPush()
        if (!pushResult.ok) console.error('[RemindersStep] push subscription failed:', pushResult.error)
      }
    } finally {
      setRequesting(false)
    }
  }

  return (
    <div className="space-y-6 animate-step-in">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground mb-2">Meal reminders</h1>
        <p className="text-muted-foreground">
          We&apos;ll match these times to your generated meals, in order. Fine-tune everything later in Settings.
        </p>
      </div>

      {permission !== 'unsupported' && (
        <div className="p-4 rounded-control border border-border bg-surface-elevated space-y-3">
          {permission === 'granted' ? (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={value.enabled}
                onChange={e => onChange({ ...value, enabled: e.target.checked })}
                className="w-5 h-5 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
              />
              <span className="text-sm font-semibold text-foreground">Enable meal reminders</span>
            </label>
          ) : permission === 'denied' ? (
            <p className="text-xs text-muted-foreground">
              Notifications are blocked in your browser. Enable them in your browser&apos;s site settings, then turn reminders on later in Settings.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-foreground">
                Get a nudge when it&apos;s time to eat, and encouragement as you hit your targets.
              </p>
              <Button type="button" size="sm" onClick={handleEnableNotifications} loading={requesting}>
                Enable reminders
              </Button>
            </div>
          )}
        </div>
      )}

      <div className={`space-y-3 ${value.enabled ? '' : 'opacity-50'}`}>
        {value.perMeal.map((meal, i) => (
          <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-control border border-border">
            <label className="flex items-center gap-3 flex-1 cursor-pointer" htmlFor={`reminder-meal-${i}`}>
              <input
                id={`reminder-meal-${i}`}
                type="checkbox"
                checked={meal.enabled}
                disabled={!value.enabled}
                onChange={e => setMeal(i, { enabled: e.target.checked })}
                className="w-5 h-5 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer disabled:cursor-not-allowed"
              />
              <span className="text-sm font-semibold text-foreground">{labels[i]}</span>
            </label>
            <input
              type="time"
              aria-label={`${labels[i]} reminder time`}
              value={meal.time}
              disabled={!value.enabled || !meal.enabled}
              onChange={e => setMeal(i, { time: e.target.value })}
              className="min-h-[44px] bg-background border border-border rounded-control px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus:border-primary transition-colors disabled:cursor-not-allowed"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
