'use client'

// Client-side subscribe/unsubscribe helpers - the browser half of the Phase
// 2 subscription flow (lib/notifications/actions.ts's savePushSubscription/
// deletePushSubscription is the server half). Plain async functions, not a
// React hook with internal state - every caller (ReminderStatusBar,
// RemindersStep, NotificationSettings) already owns its own loading/error
// state for the surrounding "enable notifications" action and just awaits
// these inline, the same way they already await Notification.
// requestPermission() and upsertNotificationPreferences().
//
// All of the gate/branch logic lives in ./pushSubscribe (runSubscribe),
// which is pure and dependency-injected so every failure path is
// unit-testable without a bundler or a DOM. This file is just the adapter:
// it reads the real browser globals + NEXT_PUBLIC_VAPID_PUBLIC_KEY and wires
// in the real savePushSubscription action.

import { savePushSubscription, deletePushSubscription } from './actions'
import {
  runSubscribe,
  type PushEnvironment,
  type PushRegistrationLike,
  type PushSubscribeResult
} from './pushSubscribe'

export type { PushSubscribeResult }

// Every capability runSubscribe depends on. Notification is included (it was
// missing before): userVisibleOnly push requires it, and callers gate their
// "enable" UI on Notification.permission anyway.
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

// Adapts the real ServiceWorkerRegistration.pushManager to the small
// PushRegistrationLike surface runSubscribe expects. Registering an
// already-registered, unchanged /sw.js is a no-op, and awaiting
// navigator.serviceWorker.ready guarantees an *active* worker before we ask
// it to hold a push subscription.
async function registerAndReady(): Promise<PushRegistrationLike> {
  await navigator.serviceWorker.register('/sw.js')
  const registration = await navigator.serviceWorker.ready
  return {
    getSubscription: () => registration.pushManager.getSubscription(),
    subscribe: options =>
      registration.pushManager.subscribe({
        userVisibleOnly: options.userVisibleOnly,
        // Cast: a known TS/lib.dom mismatch (Uint8Array<ArrayBufferLike> vs
        // the ArrayBufferView<ArrayBuffer> this option's type demands) - not
        // a real runtime concern, PushManager.subscribe accepts any
        // BufferSource-shaped Uint8Array.
        applicationServerKey: options.applicationServerKey as BufferSource
      })
  }
}

// Registers the service worker and subscribes this device, reusing an
// existing browser-level subscription if one is already present. Always
// persists via savePushSubscription so the server row (endpoint/keys) is up
// to date even when the browser subscription itself already existed.
//
// Return shape is unchanged: { ok: true } | { ok: false; error: string },
// where `error` is always a safe, user-renderable message (never a stack or
// secret). Every failure is also console.error'd with detail by runSubscribe.
export async function subscribeToPush(): Promise<PushSubscribeResult> {
  const env: PushEnvironment = {
    supported: isPushSupported(),
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    registerAndReady,
    persist: savePushSubscription
  }
  return runSubscribe(env)
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
