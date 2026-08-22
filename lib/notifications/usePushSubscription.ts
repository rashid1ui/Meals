'use client'

// Client-side subscribe/unsubscribe helpers - the browser half of the Phase
// 2 subscription flow (lib/notifications/actions.ts's savePushSubscription/
// deletePushSubscription is the server half). Plain async functions, not a
// React hook with internal state - every caller (ReminderStatusBar,
// RemindersStep, NotificationSettings) already owns its own loading/error
// state for the surrounding "enable notifications" action and just awaits
// these inline, the same way they already await Notification.
// requestPermission() and upsertNotificationPreferences().

import { savePushSubscription, deletePushSubscription } from './actions'
import type { PushSubscriptionInput } from './subscriptions'

export type PushSubscribeResult = { ok: true } | { ok: false; error: string }

// Standard web.dev snippet: the Push API's applicationServerKey must be a
// Uint8Array, but VAPID public keys are distributed as base64url strings.
// Built via `new Uint8Array(length)` + manual fill (not Uint8Array.from)
// specifically so it's backed by a real ArrayBuffer - lib.dom's
// PushSubscriptionOptionsInit wants BufferSource/ArrayBufferView<ArrayBuffer>,
// which Uint8Array.from's return type doesn't satisfy under this TS version.
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

// Registers the service worker (idempotent - re-registering an
// already-registered, unchanged /sw.js is a no-op) and subscribes this
// device, reusing an existing browser-level subscription if one is already
// present rather than creating a second one. Always calls
// savePushSubscription so the server row (endpoint/keys) is up to date even
// when the browser subscription itself already existed - e.g. permission
// was granted in an earlier session and the user is just re-confirming.
export async function subscribeToPush(): Promise<PushSubscribeResult> {
  if (!isPushSupported()) {
    const error = 'Push notifications are not supported in this browser.'
    console.error('[push] subscribeToPush: unsupported browser -', error)
    return { ok: false, error }
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) {
    const error = 'Push notifications are not configured.'
    console.error('[push] subscribeToPush: NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing -', error)
    return { ok: false, error }
  }

  let registration: ServiceWorkerRegistration
  try {
    registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
  } catch (err) {
    console.error('[push] subscribeToPush: service worker registration failed:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to register the service worker.' }
  }

  let subscription: PushSubscription
  try {
    const existing = await registration.pushManager.getSubscription()
    subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast: a known TS/lib.dom mismatch (Uint8Array<ArrayBufferLike> vs
        // the ArrayBufferView<ArrayBuffer> this option's type demands) - not
        // a real runtime concern, PushManager.subscribe accepts any
        // BufferSource-shaped Uint8Array.
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource
      }))
  } catch (err) {
    console.error('[push] subscribeToPush: pushManager.subscribe failed:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to create a push subscription.' }
  }

  const result = await savePushSubscription(subscription.toJSON() as PushSubscriptionInput)
  if ('error' in result) {
    console.error('[push] subscribeToPush: savePushSubscription failed:', result.error)
    return { ok: false, error: result.error }
  }
  return { ok: true }
}

// Tears down both halves - the browser-level subscription (so this device
// stops being asked to show notifications at all) and the server row (so a
// stale endpoint isn't kept around, and other devices/users are free to
// reuse it later - see savePushSubscription's comment on endpoint handoff).
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return

  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return

    const endpoint = subscription.endpoint
    await subscription.unsubscribe()
    await deletePushSubscription(endpoint)
  } catch {
    // Best-effort - the user has already toggled reminders off server-side
    // regardless (see NotificationSettings), which is what actually stops
    // delivery; failing to tear down the browser-level subscription just
    // leaves an inert row the next successful unsubscribe/resubscribe cleans up.
  }
}
