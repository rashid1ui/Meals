// Pure, dependency-injected core of the browser "subscribe this device to
// Web Push" flow. No 'use client', and - crucially - no import of ./actions
// (which pulls in server-only Supabase modules that throw the moment they're
// imported outside Next's bundler, e.g. under `node --test`). Mirrors the
// pure/wrapper split used throughout lib/notifications (vapid.ts, sweep.ts,
// subscriptions.ts): usePushSubscription.ts is the thin browser wrapper that
// wires in the real navigator/PushManager/savePushSubscription; this module
// holds every gate and branch so each failure path is unit-testable with
// plain fakes.

import { VAPID_PUBLIC_KEY_BYTES } from './vapid'
import type { PushSubscriptionInput } from './subscriptions'

export type PushSubscribeResult = { ok: true } | { ok: false; error: string }

// User-facing fallback. Callers render this verbatim in the UI, so it must
// never carry an internal error string, a stack, or any secret.
export const GENERIC_SUBSCRIBE_ERROR =
  "Notifications couldn't be enabled on this device. Please try again."

// Safe, specific messages for the failure modes we can distinguish. Every
// one of these is intentionally free of internal detail.
export const SUBSCRIBE_ERRORS = {
  unsupported: "This browser doesn't support push notifications.",
  notConfigured:
    "Notifications aren't set up for this site yet - please try again later or contact support.",
  misconfiguredKey: "Notifications aren't configured correctly on this site.",
  serviceWorker: 'Could not start the notification service on this device.',
  permissionBlocked:
    'Notification permission is blocked for this site. Enable it in your browser settings, then try again.'
} as const

// The standard web.dev conversion: a base64url VAPID public key -> the
// Uint8Array the Push API's applicationServerKey option requires. Built via
// `new Uint8Array(length)` + manual fill (not Uint8Array.from) so it is
// backed by a real ArrayBuffer, which lib.dom's PushSubscriptionOptionsInit
// demands. Throws (via atob) on input that isn't valid base64url.
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// The minimal slice of ServiceWorkerRegistration.pushManager this flow
// needs, shaped exactly like the real API: getSubscription returns the
// existing subscription or null; subscribe resolves to a subscription. Both
// expose toJSON() returning the standard PushSubscriptionJSON (endpoint/keys
// are optional on that DOM type - savePushSubscription re-validates the
// shape at runtime via isValidPushSubscriptionInput before persisting).
// usePushSubscription.ts adapts the real PushSubscription objects to this;
// tests pass a fake.
export interface PushSubscriptionLike {
  toJSON: () => PushSubscriptionJSON
}

export interface PushRegistrationLike {
  getSubscription: () => Promise<PushSubscriptionLike | null>
  subscribe: (options: {
    userVisibleOnly: true
    applicationServerKey: Uint8Array
  }) => Promise<PushSubscriptionLike>
}

export interface PushEnvironment {
  // 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
  supported: boolean
  // process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as seen by the client bundle -
  // undefined here means the build never inlined it.
  vapidPublicKey: string | undefined
  // Registers /sw.js AND awaits navigator.serviceWorker.ready, then hands
  // back the push-manager surface. Rejects if either step fails.
  registerAndReady: () => Promise<PushRegistrationLike>
  // The 'use server' action that upserts the row into push_subscriptions.
  persist: (input: PushSubscriptionInput) => Promise<{ data: void } | { error: string }>
}

function subscribeErrorMessage(err: unknown): string {
  // A user who has actually denied permission produces a NotAllowedError -
  // worth its own message so they know where to look. Everything else stays
  // generic (a DOMException message can be vague or browser-specific).
  if (err instanceof Error && err.name === 'NotAllowedError') {
    return SUBSCRIBE_ERRORS.permissionBlocked
  }
  return GENERIC_SUBSCRIBE_ERROR
}

// Runs the full gate chain and returns a definite result. Never throws:
// every failure is a `{ ok: false, error }` with a safe, renderable message,
// and every failure is also console.error'd (with detail) so it is visible
// in the browser console instead of vanishing.
export async function runSubscribe(env: PushEnvironment): Promise<PushSubscribeResult> {
  if (!env.supported) {
    console.error('[push] runSubscribe: browser lacks Notification/ServiceWorker/PushManager')
    return { ok: false, error: SUBSCRIBE_ERRORS.unsupported }
  }

  if (!env.vapidPublicKey) {
    console.error(
      '[push] runSubscribe: NEXT_PUBLIC_VAPID_PUBLIC_KEY is not present in the client bundle - ' +
        'the production build was made without it, or it is not set for this environment'
    )
    return { ok: false, error: SUBSCRIBE_ERRORS.notConfigured }
  }

  let applicationServerKey: Uint8Array
  try {
    applicationServerKey = urlBase64ToUint8Array(env.vapidPublicKey)
  } catch (err) {
    console.error('[push] runSubscribe: NEXT_PUBLIC_VAPID_PUBLIC_KEY is not valid base64url:', err)
    return { ok: false, error: SUBSCRIBE_ERRORS.misconfiguredKey }
  }
  if (applicationServerKey.byteLength !== VAPID_PUBLIC_KEY_BYTES) {
    console.error(
      `[push] runSubscribe: NEXT_PUBLIC_VAPID_PUBLIC_KEY decoded to ${applicationServerKey.byteLength} bytes, expected ${VAPID_PUBLIC_KEY_BYTES}`
    )
    return { ok: false, error: SUBSCRIBE_ERRORS.misconfiguredKey }
  }

  let registration: PushRegistrationLike
  try {
    registration = await env.registerAndReady()
  } catch (err) {
    console.error('[push] runSubscribe: service worker registration / ready failed:', err)
    return { ok: false, error: SUBSCRIBE_ERRORS.serviceWorker }
  }

  let raw: PushSubscriptionInput
  try {
    // Reuse an existing browser-level subscription if one is already present
    // rather than creating a second one (see usePushSubscription.ts's
    // header note on endpoint handoff).
    const existing = await registration.getSubscription()
    const subscription =
      existing ?? (await registration.subscribe({ userVisibleOnly: true, applicationServerKey }))
    // toJSON() is typed with optional endpoint/keys (PushSubscriptionJSON);
    // savePushSubscription rejects anything that isn't a full, valid payload.
    raw = subscription.toJSON() as PushSubscriptionInput
  } catch (err) {
    console.error('[push] runSubscribe: pushManager.subscribe failed:', err)
    return { ok: false, error: subscribeErrorMessage(err) }
  }

  const result = await env.persist(raw)
  if ('error' in result) {
    // result.error already comes from savePushSubscription as a safe,
    // user-facing string ("Failed to save push subscription." etc.).
    console.error('[push] runSubscribe: persist (savePushSubscription) failed:', result.error)
    return { ok: false, error: result.error }
  }

  return { ok: true }
}
